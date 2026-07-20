/**
 * Claude-subscription provider runtime (provider id 'claude-code').
 *
 * Anthropic's policy allows subscription (Pro/Max) authentication in
 * third-party apps ONLY through the Claude Agent SDK — never by sending
 * the OAuth token to the HTTP API directly. So this provider replaces the
 * LangGraph orchestrator with the SDK's own agent loop while presenting
 * the SAME facade LangGraphManager already drives (setMode /
 * setContextBudget / buildGraph().invoke / cancel / pause / compact), and
 * keeps every WordBird tool executing in-process via toolBridge.
 *
 * Auth resolution inside the spawned runtime: a pasted `claude
 * setup-token` (rides config.apiKey → CLAUDE_CODE_OAUTH_TOKEN) wins;
 * otherwise the user's existing Claude Code login is picked up from its
 * credential store. ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are stripped
 * from the subprocess env — either would silently override the
 * subscription and bill API credits (documented gotcha).
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import log from 'electron-log'
import type {
  AgentPermissionMode,
  AgentRole,
  IAIConfig,
  IAgentActivityEvent,
  ITokenTally
} from '@shared/types/langgraph'
import type { AgentToolService } from '../AgentToolService'
import {
  buildSupervisorPrompt,
  DESTRUCTIVE_TOOLS,
  emptyTally,
  addToTally,
  previewArgs,
  type OrchestratorCallbacks
} from '../orchestrator/Orchestrator'
import { AGENT_ROLES, MODE_BUDGETS, isAgentRole } from '../orchestrator/roles'
import {
  buildSdkAgents,
  isSpawnToolCall,
  mainThreadToolNames,
  stripMcpPrefix,
  MCP_SERVER_NAME,
  MCP_TOOL_PREFIX,
  SPAWN_TOOL_NAMES,
  type AgentSdkModule
} from './toolBridge'
import { buildWordbirdHttpMcpServer, type HttpMcpServerHandle } from './httpMcpServer'

/** Claude Code built-ins that could bypass the review queue — never bound. */
// DENY EVERY SDK BUILT-IN EXCEPT THE SPAWN TOOL (Agent/Task).
// The allowlist only covers mcp__wordbird__* tools; built-ins are NOT
// restricted by it, so any built-in the runtime ships is reachable unless
// explicitly denied. That matters because non-spawn built-ins that need a
// decision (AskUserQuestion, ExitPlanMode, …) ride the canUseTool
// PERMISSION STREAM — the same stream that collapses under parallel
// subagent load ("Tool permission request failed: AbortError: Stream
// closed", prj7 + the 2026-07-19 live repro). The model must ask the
// writer through mcp__wordbird__ask_writer (allowlisted, raises the option
// card, never touches the stream), never the built-in AskUserQuestion.
// Keep this list in sync with the SDK's built-in tool set (the *Input
// interfaces in @anthropic-ai/claude-agent-sdk/sdk-tools.d.ts); the
// agent-sdk-runner spec pins the invariant. Agent/Task (SPAWN_TOOL_NAMES)
// are the sole survivors — they carry the dedup + ledger-injection machinery.
export const DISALLOWED_BUILTIN_TOOLS = [
  // Classic Claude Code tool names (invocation names, not *Input names).
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'KillShell',
  'BashOutput',
  'SlashCommand',
  'Skill',
  // Newer built-ins the stale list missed — every one either rides the
  // permission stream or is irrelevant/harmful inside WordBird.
  'AskUserQuestion',
  'Artifact',
  'ClaudeDesign',
  'CronCreate',
  'CronDelete',
  'CronList',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
  'FileEdit',
  'FileRead',
  'FileWrite',
  'ListMcpResources',
  'Mcp',
  'Monitor',
  'Projects',
  'PushNotification',
  'REPL',
  'ReadMcpResource',
  'ReadMcpResourceDir',
  'RefreshMcpTools',
  'RemoteTrigger',
  'ReportFindings',
  'ScheduleWakeup',
  'ShowOnboardingRolePicker',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'TodoWrite',
  'Workflow'
]

/**
 * Max subagents allowed in flight at once on the SDK runtime. 1 = fully
 * serial. The in-process MCP tool channel collapses under parallel subagent
 * load with large/slow calls (prj13 empty-tools race, upstream #114); the
 * gate enforces this so the model spawns specialists sequentially.
 */
export const SDK_MAX_CONCURRENT_SUBAGENTS = 1

/**
 * How long a spawn may hold a concurrency slot before the gate treats it as
 * dead and reclaims it. A subagent that fails hard (spawn error, killed
 * runtime) can end WITHOUT ever emitting the tool_result that normally
 * releases its slot; without this the single slot would stay occupied and
 * every later spawn would be denied "already running" for the rest of the
 * turn — the supervisor then looks like it is waiting forever.
 */
export const SPAWN_SLOT_STALE_MS = 180_000

/**
 * How long the SDK stream may go COMPLETELY silent — no message of any kind
 * — before the turn gives up on it. A wedged runtime otherwise leaves the
 * `for await` waiting indefinitely: the writer sees "running" forever and
 * Stop is the only exit. Generous on purpose, because silence is normal
 * while a slow tool runs (MCP_TOOL_TIMEOUT is 60s) and a legitimately long
 * book-run segment must never be cut short. Firing is treated as a BUDGET
 * event, not a crash: the session persists, so "continue" resumes.
 */
export const SDK_SILENCE_TIMEOUT_MS = 300_000

/** The only built-ins we keep: Agent/Task spawn our role subagents. */

type SdkMessage = Record<string, unknown>

export interface AgentSDKRunnerOptions {
  config: IAIConfig
  callbacks: OrchestratorCallbacks
  toolService: AgentToolService
  /** Durable state dir (.wordbird/agent-state) for the thread→session map. */
  stateDir: string
  projectRoot?: () => string | null
  /** Test seam: inject a scripted SDK module instead of the real import. */
  sdkModule?: AgentSdkModule
  /**
   * Hard cap on SDK turns per invoke (maxTurns). Unset = the generous
   * mode-scaled default. The live suite sets this per flow so a wandering
   * model cannot burn the writer's subscription on a test.
   */
  turnBudget?: number
  /** Optional model alias for SUBAGENTS only (SDK AgentDefinition.model).
   * Unset = inherit the parent model. Live-suite thrift knob. */
  subagentModel?: string
  /** Silence budget before a wedged runtime ends the turn. Tests override
   * it; production uses SDK_SILENCE_TIMEOUT_MS. */
  silenceMs?: number
}

interface CompiledFacade {
  invoke: (
    state: { messages: Array<{ content?: unknown }> },
    cfg?: { signal?: AbortSignal; configurable?: { thread_id?: string } }
  ) => Promise<{ messages: Array<{ content: string }> }>
}

export class AgentSDKRunner {
  private _mode: AgentPermissionMode = 'approvals'
  private readonly _config: IAIConfig
  private readonly _callbacks: OrchestratorCallbacks
  private readonly _toolService: AgentToolService
  private readonly _stateDir: string
  private readonly _projectRoot: () => string | null
  private _sdkModule: AgentSdkModule | null
  /** True only when a SCRIPTED sdk was injected (unit tests). Distinct from
   * _sdkModule, which _loadSdk() populates with the REAL sdk after the first
   * turn — using that here made production serve a dead stub MCP config
   * ("spawned with zero tools"). */
  private readonly _usingScriptedSdk: boolean
  private _contextWindow = 200000
  private _turnUsage: ITokenTally = emptyTally()
  /** Spawned (type, task) pairs this turn — duplicate spawn calls bounce. */
  private readonly _turnTaskKeys = new Set<string>()
  // tool_use_id → gate-admission time for subagents the PreToolUse gate has
  // ALLOWED that have not yet reported done. size = live concurrency. Its
  // own map (not _spawnedTaskIds) because the gate must see the count at
  // gate time, before the stream loop records the spawn. Timestamped so a
  // subagent that dies WITHOUT emitting a tool_result cannot hold the only
  // slot forever — see SPAWN_SLOT_STALE_MS.
  private readonly _inFlightSpawnIds = new Map<string, number>()
  /** tool_use id → bare tool name, so errored results can name the tool. */
  private readonly _toolUseNames = new Map<string, string>()
  private _sessionUsage: ITokenTally = emptyTally()
  private _activeQuery: { interrupt?: () => Promise<unknown> } | null = null
  private _turnBudget: number | null = null
  private _subagentModel: string | undefined
  private readonly _silenceMs: number
  /** Live per-turn abort signal — read by the MCP tool bridge. */
  private _turnSignal: AbortSignal | undefined
  /** Loopback HTTP MCP server (tools run in-process). Built once, reused
   * across turns; closed on dispose. HTTP transport dodges the in-process
   * result-drop bug (#108/#43642). */
  private _httpMcp: HttpMcpServerHandle | null = null

  constructor(options: AgentSDKRunnerOptions) {
    this._config = options.config
    this._callbacks = options.callbacks
    this._toolService = options.toolService
    this._stateDir = options.stateDir
    this._projectRoot = options.projectRoot ?? (() => null)
    this._sdkModule = options.sdkModule ?? null
    this._usingScriptedSdk = Boolean(options.sdkModule)
    this._turnBudget = options.turnBudget ?? null
    this._subagentModel = options.subagentModel
    this._silenceMs = options.silenceMs ?? SDK_SILENCE_TIMEOUT_MS
  }

  // ---- Orchestrator facade -------------------------------------------------

  get mode(): AgentPermissionMode {
    return this._mode
  }

  setMode(mode: AgentPermissionMode): void {
    this._mode = mode
  }

  /** The SDK runtime manages its own context; remember the window for the ring. */
  setContextBudget(contextWindow: number, _maxOutputTokens: number): void {
    if (Number.isFinite(contextWindow) && contextWindow > 0) {
      this._contextWindow = Math.floor(contextWindow)
    }
  }

  /** SDK turns are API round-trips; give long agentic work generous room —
   * unless a turnBudget caps it (the live suite's token-thrift guard). */
  recursionLimit(): number {
    const scaled = MODE_BUDGETS[this._mode].workerRecursionLimit * 4
    return this._turnBudget !== null ? Math.min(this._turnBudget, scaled) : scaled
  }

  /** Per-agent pause/cancel granularity lives inside the runtime — the only
   * live handle is the whole run. Cancelling the root interrupts it. */
  cancelAgent(agentId: string): boolean {
    if (agentId && agentId !== 'biscuit-root') return false
    this._activeQuery?.interrupt?.().catch(() => {})
    return !!this._activeQuery
  }

  pauseAgent(_agentId: string): boolean {
    return false
  }

  resumeAgent(_agentId: string): boolean {
    return false
  }

  pause(): void {
    // Boundary-pause is a LangGraph-loop feature; the SDK loop has no
    // equivalent — Stop (interrupt) remains the control that works.
  }

  resumeFromPause(): void {}

  get isPaused(): boolean {
    return false
  }

  /** Total tokens this session — the book-run token ceiling reads this. */
  get sessionTokens(): number {
    return this._sessionUsage.inputTokens + this._sessionUsage.outputTokens
  }

  resetSessionUsage(): void {
    this._sessionUsage = emptyTally()
  }

  /** Release the loopback HTTP MCP server. Called from the manager's
   * disconnect so the local port + transport don't leak between sessions. */
  async dispose(): Promise<void> {
    const mcp = this._httpMcp
    this._httpMcp = null
    await mcp?.close()
  }

  /** True when this WordBird thread already maps to a resumable SDK session
   * — the session itself holds the history, so only NEW messages are sent. */
  hasThread(threadId: string): boolean {
    return Boolean(this._loadSessions()[threadId])
  }

  async compactThread(
    _agent: unknown,
    _threadId: string
  ): Promise<{ compacted: boolean; repaired: number }> {
    // The Claude Code runtime auto-compacts its own session.
    return { compacted: false, repaired: 0 }
  }

  // ---- Probe (connect-time validation) --------------------------------------

  /**
   * Cheapest real end-to-end check: one no-tool turn. Classifies auth
   * failures so Settings can say "log in / paste a setup-token" instead of
   * a generic error.
   */
  async probe(): Promise<void> {
    const sdk = await this._loadSdk()
    const stream = sdk.query({
      prompt: 'Reply with the single word: ready',
      options: {
        ...this._authOptions(),
        maxTurns: 1,
        allowedTools: [],
        disallowedTools: DISALLOWED_BUILTIN_TOOLS,
        systemPrompt: 'You are a connectivity probe. Reply with one word.',
        settingSources: [],
        persistSession: false
      }
    })
    for await (const raw of stream) {
      const message = raw as SdkMessage
      if (message.type === 'assistant' && (message as { error?: string }).error) {
        throw this._classifyAuthError(String((message as { error?: string }).error))
      }
      if (message.type === 'result') {
        const result = message as { is_error?: boolean; result?: string; subtype?: string }
        if (result.is_error || result.subtype !== 'success') {
          throw this._classifyAuthError(String(result.result ?? result.subtype ?? 'unknown'))
        }
        return
      }
    }
    throw new Error('The Claude Code runtime ended without a result — try again.')
  }

  private _classifyAuthError(detail: string): Error {
    if (/authentication_failed|oauth|401|403|logged? ?in|credential/i.test(detail)) {
      return new Error(
        'Claude subscription login not found or expired. Either log in with the Claude ' +
        'Code CLI (`claude`), or run `claude setup-token` and paste the token in ' +
        'Settings → AI. Never use an Anthropic API key here — this provider bills ' +
        `your Claude plan. (${detail})`
      )
    }
    if (/billing/i.test(detail)) {
      return new Error(`Claude reported a billing problem for this account. (${detail})`)
    }
    return new Error(`Claude Code runtime error: ${detail}`)
  }

  // ---- The compiled-agent facade --------------------------------------------

  buildGraph(): CompiledFacade {
    return {
      invoke: async(state, cfg) => {
        const text = await this._runTurn(state, cfg)
        return { messages: [{ content: text }] }
      }
    }
  }

  private async _runTurn(
    state: { messages: Array<{ content?: unknown }> },
    cfg?: { signal?: AbortSignal; configurable?: { thread_id?: string } }
  ): Promise<string> {
    // An abort listener on an ALREADY-aborted signal never fires — without
    // this check a post-Stop invoke (book-run segment, follow-up) would run
    // a whole uninterruptible SDK query. Stop means stop.
    if (cfg?.signal?.aborted) return ''
    const sdk = await this._loadSdk()
    // Mid-run steering notes queue while a turn works; every invoke
    // boundary (book-run segments, coherence follow-ups, next turns)
    // drains them — the same delivery points the LangGraph supervisor has.
    const steering = this._callbacks.drainSteering?.() ?? []
    const prompt = [
      this._promptFromMessages(state.messages),
      ...steering.map((note) => `[Writer, mid-run]: ${note}`)
    ]
      .filter(Boolean)
      .join('\n\n')
    const threadId = cfg?.configurable?.thread_id ?? 'default'
    const sessions = this._loadSessions()
    const resume = sessions[threadId]

    const brief = (await this._callbacks.buildBrief?.()) ?? ''
    const budget = MODE_BUDGETS[this._mode]
    // Stop must reach IN-PROCESS tools too: interrupt() only stops the
    // model loop; queued mcp__wordbird__ calls kept running (web retries
    // included) long after the Stop button without this signal.
    this._turnSignal = cfg?.signal
    // Loopback HTTP MCP server, built once and reused. Tools still execute
    // in-process via runForModel; only the SDK↔tools transport is HTTP,
    // which delivers results the in-process transport intermittently drops.
    if (!this._httpMcp) {
      // Under a scripted SDK (unit tests) the query never makes real HTTP
      // requests, so skip standing up a real loopback server — a stub config
      // keeps the options shape intact without leaking ports across tests.
      this._httpMcp = this._usingScriptedSdk
        ? {
          config: {
            type: 'http',
            url: 'http://127.0.0.1:0/mcp',
            headers: {},
            alwaysLoad: true,
            timeout: 60000
          },
          toolNames: [],
          close: async() => {}
        }
        : await buildWordbirdHttpMcpServer(this._toolService, () => this._turnSignal)
    }
    // GATHERED THIS TURN at invoke time: empty on a turn's first invoke
    // (nothing gathered yet), accumulated on follow-up invokes and
    // book-run segments. Subagent prompts are static per invoke, so the
    // canUseTool spawn branch below re-injects the LIVE section per
    // spawn (updatedInput); if a runtime ignores updatedInput the floor
    // is the ledger's serve-from-digest at the tool choke point.
    const gathered = this._callbacks.buildGathered?.() ?? ''
    // Subagents carry the same per-turn brief LangGraph workers get.
    const agents = buildSdkAgents(this._mode, brief, gathered, this._subagentModel)
    const mainThreadSet = new Set(mainThreadToolNames(this._toolService, this._mode))

    const systemPrompt =
      buildSupervisorPrompt(this._mode, budget.maxWorkersPerWave, SPAWN_TOOL_NAMES[0]) +
      `\nTOOL NAMING: project tools come from the "${MCP_SERVER_NAME}" MCP server — a ` +
      `reference like list_structure means the tool named ${MCP_TOOL_PREFIX}list_structure. ` +
      'You have NO file tools besides these; never claim to have used Bash/Read/Write.\n' +
      // SDK RUNTIME: subagents run ONE AT A TIME here (the tool channel
      // cannot survive parallel subagents). Spawn ONE specialist, wait for
      // its report, then spawn the next — do NOT launch several at once
      // (extra ones are denied "already running" and just waste a step).
      'SPAWNING: this runtime runs subagents ONE AT A TIME. Spawn a single ' +
      'specialist, wait for its report, THEN spawn the next. Never launch ' +
      'multiple agents in one message — the others will be denied.\n' +
      (brief ? `\n${brief}\n` : '') +
      (gathered ? `\n${gathered}\n` : '')

    const options: Record<string, unknown> = {
      ...this._authOptions(),
      model: this._config.model || 'sonnet',
      cwd: this._projectRoot() ?? undefined,
      resume,
      systemPrompt,
      settingSources: [],
      mcpServers: { [MCP_SERVER_NAME]: this._httpMcp.config },
      agents,
      // ARCHITECTURAL INVARIANT (revised 2026-07-19, prj13 empty-tools
      // incident): NOTHING rides the canUseTool permission stream. The
      // `can_use_tool` control_request is a per-call round-trip over the
      // CLI control channel; under real-runner load it starves the
      // in-process MCP tool channel — reproduced live: with canUseTool
      // gating spawns, tool throughput HALVED and large-payload web_fetch/
      // wiki_read calls were dropped as "completed with no output" before
      // ever reaching our handlers. Fix: ALLOWLIST everything (spawns +
      // destructive included) so canUseTool is never invoked, and gate the
      // low-frequency decisions (spawn dedup + ledger injection, writer
      // approval for destructive ops) through a PreToolUse HOOK instead —
      // the SDK's own CLAUDE_SDK_CAN_USE_TOOL_SHADOWED warning recommends
      // exactly this. The hook is matcher-scoped to spawns/destructive so
      // it never fires on the researcher's high-frequency read/web calls.
      allowedTools: [
        ...[...mainThreadSet].map((n) => `${MCP_TOOL_PREFIX}${n}`),
        ...SPAWN_TOOL_NAMES
      ],
      disallowedTools: DISALLOWED_BUILTIN_TOOLS,
      maxTurns: this.recursionLimit(),
      permissionMode: 'default',
      hooks: {
        // Fires only for spawns + destructive ops (matcher-scoped); every
        // other tool is allowlisted and never reaches this callback.
        PreToolUse: [
          {
            matcher: 'Agent|Task|delete_unit|delete_file|delete_folder|restore_snapshot',
            hooks: [this.preToolUseGate]
          }
        ]
      }
    }

    // The SDK's own kill switch: aborting this controller terminates the
    // query at the subprocess level — interrupt() alone is a SOFT request
    // with queue-drain semantics that a subagent/tool storm can outlive
    // (live repro 2026-07-19: Stop pressed at run start, turn kept going).
    const sdkAbortController = new AbortController()
    ;(options as Record<string, unknown>).abortController = sdkAbortController
    const stream = sdk.query({ prompt, options })
    this._activeQuery = stream
    let interruptRequested = false
    let streamDone = false
    let hardKillTimer: ReturnType<typeof setTimeout> | null = null
    const onAbort = (): void => {
      if (interruptRequested) return
      interruptRequested = true
      // Soft first (clean interrupt receipt when the runtime is quick)…
      stream.interrupt?.().catch(() => {})
      // …then a BOUNDED escalation: if the stream is still alive after a
      // short grace, kill it hard. Stop is a guarantee, not a request.
      hardKillTimer = setTimeout(() => {
        if (streamDone) return
        try {
          sdkAbortController.abort()
        } catch {
          // already dead
        }
        try {
          ;(stream as { close?: () => void }).close?.()
        } catch {
          // already closed
        }
      }, 2000)
    }
    cfg?.signal?.addEventListener('abort', onAbort, { once: true })
    // The entry check above ran BEFORE several awaits (SDK load, brief
    // build, session read). A Stop landing in that window aborts a signal
    // with no listener yet — and addEventListener on an already-aborted
    // signal NEVER fires (same pitfall as the post-Stop invoke guard).
    // Live repro 2026-07-19: Stop pressed right at run start left the
    // whole turn running to completion. Check once after attaching.
    if (cfg?.signal?.aborted) onAbort()

    this._turnUsage = emptyTally()
    this._turnTaskKeys.clear()
    this._inFlightSpawnIds.clear()
    this._toolUseNames.clear()
    let finalText = ''
    let sawError: string | null = null
    let sawBudget: Error | null = null

    try {
      for await (const raw of this._withSilenceTimeout(stream, () => {
        // The runtime stopped talking to us. Kill it hard — otherwise the
        // subprocess keeps its grip and the next turn inherits the mess.
        try {
          sdkAbortController.abort()
        } catch {
          // already dead
        }
        try {
          ;(stream as { close?: () => void }).close?.()
        } catch {
          // already closed
        }
      })) {
        // Belt-and-braces: if the abort was missed by any path, the next
        // yielded message re-arms the interrupt so a stop can never be
        // lost for the rest of the turn.
        if (cfg?.signal?.aborted && !interruptRequested) onAbort()
        const message = raw as SdkMessage
        this._handleStreamMessage(message, threadId, sessions)
        if (message.type === 'result') {
          const result = message as {
            subtype?: string
            is_error?: boolean
            result?: string
            errors?: string[]
            usage?: Record<string, number>
          }
          if (result.is_error) {
            if (result.subtype === 'error_max_turns') {
              // Same budget semantics as LangGraph's GraphRecursionError:
              // the manager answers "say continue" and book runs pause
              // gracefully instead of reporting a failure. The session
              // persists, so continue genuinely resumes.
              sawBudget = new Error('SDK run hit its max-turns step budget')
              sawBudget.name = 'GraphRecursionError'
            } else {
              sawError = String(
                result.errors?.filter(Boolean).join('; ') || result.subtype || 'unknown error'
              )
            }
          } else {
            finalText = String(result.result ?? '')
          }
          this._recordResultUsage(result.usage)
        }
      }
    } catch (error) {
      // The SDK also surfaces error results by THROWING when the stream
      // ends ("Claude Code returned an error result: Reached maximum
      // number of turns (N)") — pinned live in claude-subscription.spec.
      if (cfg?.signal?.aborted) return finalText || ''
      if (sawBudget) throw sawBudget
      if (error instanceof Error && /maximum number of turns/i.test(error.message)) {
        const budgetError = new Error('SDK run hit its max-turns step budget')
        budgetError.name = 'GraphRecursionError'
        throw budgetError
      }
      throw error
    } finally {
      streamDone = true
      if (hardKillTimer) clearTimeout(hardKillTimer)
      cfg?.signal?.removeEventListener('abort', onAbort)
      this._activeQuery = null
    }

    if (cfg?.signal?.aborted) return finalText || ''
    if (sawBudget) throw sawBudget
    if (sawError) throw this._classifyAuthError(sawError)
    return finalText
  }

  // ---- Stream → WordBird events ---------------------------------------------

  private _handleStreamMessage(
    message: SdkMessage,
    threadId: string,
    sessions: Record<string, string>
  ): void {
    if (message.type === 'system' && message.subtype === 'init') {
      const sessionId = String(message.session_id ?? '')
      if (sessionId && sessions[threadId] !== sessionId) {
        sessions[threadId] = sessionId
        this._saveSessions(sessions)
      }
      return
    }

    if (message.type === 'assistant') {
      const inner = (message as { message?: { content?: unknown } }).message
      const blocks = Array.isArray(inner?.content) ? (inner?.content as Array<Record<string, unknown>>) : []
      for (const block of blocks) {
        if (block.type !== 'tool_use') continue
        const name = String(block.name ?? '')
        if (isSpawnToolCall(name, block.input)) {
          const input = (block.input ?? {}) as { subagent_type?: string; description?: string; prompt?: string }
          const roleName = String(input.subagent_type ?? 'explorer')
          const role = isAgentRole(roleName) ? roleName : 'explorer'
          const task = String(input.description ?? input.prompt ?? '').slice(0, 400)
          this._emitActivity({
            kind: 'spawn',
            role,
            label: `Spawning ${roleName}`,
            detail: task
          })
          const agentId = String(block.id ?? crypto.randomUUID())
          const startedAt = Date.now()
          this._spawnedTaskIds.set(agentId, { role, task, startedAt })
          this._callbacks.emitAgentStatus?.({
            agentId,
            role,
            task,
            status: 'running',
            startedAt,
            toolCalls: 0
          })
        } else {
          this._toolUseNames.set(String(block.id ?? ''), stripMcpPrefix(name))
          this._emitActivity({
            kind: 'tool',
            label: stripMcpPrefix(name),
            detail: previewArgs(block.input)
          })
        }
      }
      return
    }

    // A user message carrying a tool_result that answers a Task call means
    // that subagent finished.
    if (message.type === 'user') {
      const inner = (message as { message?: { content?: unknown } }).message
      const blocks = Array.isArray(inner?.content) ? (inner?.content as Array<Record<string, unknown>>) : []
      for (const block of blocks) {
        if (block.type !== 'tool_result') continue
        // FAILURES MUST BE VISIBLE: 46 silent tool errors looked like a
        // healthy-but-endless run to the writer (prj7 incident). Every
        // errored result becomes an activity line.
        if (block.is_error) {
          const failedTool = this._toolUseNames.get(String(block.tool_use_id)) ?? 'tool'
          this._emitActivity({
            kind: 'status',
            label: `tool failed — ${failedTool}`,
            detail: JSON.stringify(block.content ?? '').slice(0, 120)
          })
        }
        // Release the concurrency slot the gate reserved for this subagent
        // (no-op for spawns the gate denied — their id was never added).
        this._inFlightSpawnIds.delete(String(block.tool_use_id))
        if (!this._spawnedTaskIds.has(String(block.tool_use_id))) {
          continue
        }
        const info = this._spawnedTaskIds.get(String(block.tool_use_id))
        this._spawnedTaskIds.delete(String(block.tool_use_id))
        this._callbacks.emitAgentStatus?.({
          agentId: String(block.tool_use_id),
          role: info?.role ?? 'explorer',
          task: info?.task ?? '',
          status: block.is_error ? 'failed' : 'done',
          startedAt: info?.startedAt ?? Date.now(),
          endedAt: Date.now(),
          toolCalls: 0
        })
      }
    }
  }

  private readonly _spawnedTaskIds = new Map<
    string,
    { role: AgentRole; task: string; startedAt: number }
  >()

  private _emitActivity(partial: Omit<IAgentActivityEvent, 'id' | 'ts'>): void {
    // After Stop, the tail of in-flight events is noise that reads as
    // "the run is still going" — drop it (rows close out via run-state).
    if (this._turnSignal?.aborted) return
    this._callbacks.emitActivity({
      id: crypto.randomUUID(),
      ts: Date.now(),
      ...partial
    })
  }

  private _recordResultUsage(usage?: Record<string, number>): void {
    if (!usage) return
    const inputTokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    const outputTokens = usage.output_tokens ?? 0
    addToTally(this._turnUsage, 'supervisor', { inputTokens, outputTokens })
    addToTally(this._sessionUsage, 'supervisor', { inputTokens, outputTokens })
    this._callbacks.emitTokenUsage?.({
      turn: JSON.parse(JSON.stringify(this._turnUsage)),
      session: JSON.parse(JSON.stringify(this._sessionUsage))
    })
    // Context pressure for the ring: prompt size vs the model window. The
    // runtime compacts itself, so this is informational, never a trigger.
    const usedTokens = usage.input_tokens ?? 0
    if (usedTokens > 0) {
      this._callbacks.emitContextUsage?.({
        usedChars: usedTokens * 4,
        budgetChars: this._contextWindow * 4,
        ratio: Math.min(1, usedTokens / this._contextWindow),
        compacting: false,
        usedTokens,
        budgetTokens: this._contextWindow,
        contextWindow: this._contextWindow
      })
    }
  }

  /**
   * Wrap the SDK stream so a runtime that goes completely silent ends the
   * turn instead of hanging it. The timer is per-message (any yield resets
   * it), so slow-but-alive work is never cut short — only total silence
   * trips it. `onTimeout` gets a chance to kill the underlying query before
   * the graceful budget error is thrown.
   *
   * Exposed for tests via the `silenceMs` override so the contract can be
   * pinned without a 5-minute test.
   */
  private async * _withSilenceTimeout(
    stream: AsyncIterable<unknown>,
    onTimeout: () => void
  ): AsyncGenerator<unknown, void> {
    const limit = this._silenceMs
    const iterator = stream[Symbol.asyncIterator]()
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | null = null
      const silence = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), limit)
      })
      let outcome: IteratorResult<unknown> | 'timeout'
      try {
        outcome = await Promise.race([iterator.next(), silence])
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (outcome === 'timeout') {
        onTimeout()
        // NOT awaited: closing an iterator that is suspended inside an
        // unresolved await never settles, which would re-create exactly the
        // hang this watchdog exists to break.
        try {
          Promise.resolve(iterator.return?.()).catch(() => {})
        } catch {
          // the iterator is already wedged — nothing to salvage
        }
        const stalled = new Error(
          `The Claude Code runtime stopped responding for ${Math.round(limit / 1000)}s.`
        )
        // Budget semantics: the SDK session persists, so the writer's
        // "continue" genuinely resumes rather than starting over.
        stalled.name = 'GraphRecursionError'
        throw stalled
      }
      if (outcome.done) return
      yield outcome.value
    }
  }

  // ---- Permission gating (PreToolUse hook, NOT canUseTool) -------------------

  /**
   * The one gate that survives after the canUseTool removal: spawn dedup +
   * live ledger injection, and writer approval for destructive ops. Runs
   * as a matcher-scoped PreToolUse hook (fires only for Agent/Task +
   * DESTRUCTIVE_TOOLS), so the high-frequency read/web calls never touch a
   * permission mechanism at all. Bound arrow so `this` holds in the hook.
   * Exposed (not private) for the agent-sdk-runner unit pins.
   */
  preToolUseGate = async(rawInput: unknown): Promise<Record<string, unknown>> => {
    const input = (rawInput ?? {}) as {
      tool_name?: string
      tool_input?: Record<string, unknown>
      tool_use_id?: string
    }
    const toolUseId = String(input.tool_use_id ?? '')
    const toolName = String(input.tool_name ?? '')
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>
    const allow = (updatedInput?: Record<string, unknown>): Record<string, unknown> => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        ...(updatedInput ? { updatedInput } : {})
      }
    })
    const deny = (reason: string): Record<string, unknown> => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    })

    // Duplicate-spawn guard + live GATHERED-THIS-TURN injection (parity
    // with the old canUseTool spawn branch; keyed on the ORIGINAL task).
    if (isSpawnToolCall(toolName, toolInput)) {
      const task = String(toolInput.prompt ?? toolInput.description ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      const key = `${String(toolInput.subagent_type ?? '')}:${task}`
      if (task && this._turnTaskKeys.has(key)) {
        return deny(
          'An identical agent (same type, same task) already ran this turn — use its ' +
            'result, or give this one a genuinely different scope.'
        )
      }
      // SERIALIZE SUBAGENTS (prj13 empty-tools race): the SDK's in-process
      // MCP tool channel collapses when parallel subagents make large/slow
      // calls at once (live: 2-3 concurrent researchers → tool stream dies,
      // wiki_read/web_fetch dropped as "no output", model cries outage;
      // upstream #114 not fully fixed through 0.3.215). Cap live subagent
      // concurrency: while one runs, deny the next so the model spawns them
      // ONE AT A TIME. Reliability over parallelism — a serial researcher
      // that finishes beats three that collapse the channel. Checked +
      // reserved SYNCHRONOUSLY (no await before this) so a parallel Task
      // burst can't all pass the gate at once.
      // Reclaim slots held by spawns that died without reporting back (a
      // hard subagent failure emits no tool_result), so a dead agent can
      // never wedge the gate shut for the rest of the turn.
      const now = Date.now()
      for (const [id, startedAt] of this._inFlightSpawnIds) {
        if (now - startedAt > SPAWN_SLOT_STALE_MS) this._inFlightSpawnIds.delete(id)
      }
      if (this._inFlightSpawnIds.size >= SDK_MAX_CONCURRENT_SUBAGENTS) {
        return deny(
          'A subagent is already running and this runtime executes them ONE AT A TIME. ' +
            'Wait for the running agent to report back, then spawn this one. If it never ' +
            'reports, say so plainly to the writer — do not stall silently.'
        )
      }
      this._turnTaskKeys.add(key)
      if (toolUseId) this._inFlightSpawnIds.set(toolUseId, now)
      const spawnType = String(toolInput.subagent_type ?? '')
      const cold = isAgentRole(spawnType) && AGENT_ROLES[spawnType].coldStart === true
      const gatheredNow = cold ? '' : (this._callbacks.buildGathered?.() ?? '')
      if (gatheredNow && typeof toolInput.prompt === 'string' && toolInput.prompt) {
        return allow({ ...toolInput, prompt: `${toolInput.prompt}\n\n${gatheredNow}` })
      }
      // No injection (cold role / empty ledger): pass the input through
      // unchanged, but still as updatedInput so callers see it.
      return allow(toolInput)
    }

    // Destructive ops always raise the writer-approval card (both providers).
    const bare = stripMcpPrefix(toolName)
    if (DESTRUCTIVE_TOOLS.includes(bare)) {
      const approved = await this._callbacks.requestApproval({
        id: crypto.randomUUID(),
        summary: `DESTRUCTIVE OPERATION — ${bare}: ${previewArgs(toolInput)}`,
        spawns: []
      })
      if (!approved) return deny('The writer declined this operation. Do not retry it.')
    }
    return allow()
  }

  // ---- Auth & env ------------------------------------------------------------

  /**
   * Subprocess environment: strip credentials that would override the
   * subscription; wire the setup-token when the writer pasted one.
   * Exposed for tests (env hygiene is a safety property).
   */
  buildEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...base }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    const token = (this._config.apiKey ?? '').trim()
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token
    env.CLAUDE_AGENT_SDK_CLIENT_APP = 'wordbird'
    // IN-PROCESS MCP TOOL TIMEOUT. The in-process SDK MCP server has no
    // per-server `timeout` field (that lives only on stdio/sse/http
    // configs), so the ONLY lever for it is this env var. The default is
    // short (~the 5s connect window), and any in-process tool that stays
    // in flight past it makes the CLI close the tool stream — after which
    // EVERY later mcp__wordbird__* call in that agent (local reads
    // included) returns "completed with no output" (the prj12/prj13
    // "research tool intermittently working" wedge; upstream
    // claude-agent-sdk #114/#41/#98). A web_fetch can legitimately run
    // ~15s (FETCH_TIMEOUT_MS) plus retry backoff, so give tools a generous
    // hard wall-clock ceiling. Web handlers keep their own tighter
    // timeouts, so this only stops the STREAM from dying under a slow call.
    if (!env.MCP_TOOL_TIMEOUT) env.MCP_TOOL_TIMEOUT = '60000'
    return env
  }

  private _authOptions(): Record<string, unknown> {
    return { env: this.buildEnv() }
  }

  // ---- Session persistence ----------------------------------------------------

  private _sessionsPath(): string {
    return path.join(this._stateDir, 'sdk-sessions.json')
  }

  private _loadSessions(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this._sessionsPath(), 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private _saveSessions(sessions: Record<string, string>): void {
    try {
      fs.mkdirSync(this._stateDir, { recursive: true })
      fs.writeFileSync(this._sessionsPath(), JSON.stringify(sessions, null, 2))
    } catch (error) {
      log.warn('[AgentSDKRunner] Could not persist session map:', error)
    }
  }

  // ---- SDK loading -------------------------------------------------------------

  private async _loadSdk(): Promise<AgentSdkModule> {
    if (this._sdkModule) return this._sdkModule
    // ESM-only package from a CJS main bundle: dynamic import survives the
    // rollup CJS transform (dynamicImportInCjs) and Electron's Node loads it.
    const loaded = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as AgentSdkModule
    this._sdkModule = loaded
    return loaded
  }

  private _promptFromMessages(messages: Array<{ content?: unknown }>): string {
    const parts: string[] = []
    for (const message of messages) {
      const content = (message as { content?: unknown }).content
      if (typeof content === 'string' && content.trim()) parts.push(content)
    }
    return parts.join('\n\n')
  }
}
