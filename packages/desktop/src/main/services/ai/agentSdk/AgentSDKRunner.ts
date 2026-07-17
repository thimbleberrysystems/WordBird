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
import { MODE_BUDGETS, isAgentRole } from '../orchestrator/roles'
import {
  buildWordbirdMcpServer,
  buildSdkAgents,
  mainThreadToolNames,
  stripMcpPrefix,
  MCP_SERVER_NAME,
  MCP_TOOL_PREFIX,
  type AgentSdkModule
} from './toolBridge'

/** Claude Code built-ins that could bypass the review queue — never bound. */
const DISALLOWED_BUILTIN_TOOLS = [
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
  'Skill'
]

/** The one built-in we keep: Task spawns our role subagents. */
const SPAWN_TOOL = 'Task'

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
  private _contextWindow = 200000
  private _turnUsage: ITokenTally = emptyTally()
  /** Spawned (type, task) pairs this turn — duplicate Task calls bounce. */
  private readonly _turnTaskKeys = new Set<string>()
  private _sessionUsage: ITokenTally = emptyTally()
  private _activeQuery: { interrupt?: () => Promise<unknown> } | null = null

  constructor(options: AgentSDKRunnerOptions) {
    this._config = options.config
    this._callbacks = options.callbacks
    this._toolService = options.toolService
    this._stateDir = options.stateDir
    this._projectRoot = options.projectRoot ?? (() => null)
    this._sdkModule = options.sdkModule ?? null
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

  /** SDK turns are API round-trips; give long agentic work generous room. */
  recursionLimit(): number {
    return MODE_BUDGETS[this._mode].workerRecursionLimit * 4
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
    const { server } = buildWordbirdMcpServer(sdk, this._toolService, this._mode)
    // Subagents carry the same per-turn brief LangGraph workers get.
    const agents = buildSdkAgents(this._mode, brief)
    const mainThreadSet = new Set(mainThreadToolNames(this._toolService, this._mode))

    const systemPrompt =
      buildSupervisorPrompt(this._mode, budget.maxWorkersPerWave, SPAWN_TOOL) +
      `\nTOOL NAMING: project tools come from the "${MCP_SERVER_NAME}" MCP server — a ` +
      `reference like list_structure means the tool named ${MCP_TOOL_PREFIX}list_structure. ` +
      'You have NO file tools besides these; never claim to have used Bash/Read/Write.\n' +
      (brief ? `\n${brief}\n` : '')

    const options: Record<string, unknown> = {
      ...this._authOptions(),
      model: this._config.model || 'sonnet',
      cwd: this._projectRoot() ?? undefined,
      resume,
      systemPrompt,
      settingSources: [],
      mcpServers: { [MCP_SERVER_NAME]: server },
      agents,
      // Destructive tools stay OFF the allowlist deliberately: a bare
      // allowedTools entry auto-approves before canUseTool is consulted
      // (the SDK warns about exactly this shadowing) — leaving them out
      // routes delete_unit/delete_file/restore_snapshot through the
      // writer-approval gate below while every other tool runs freely.
      // SPAWN_TOOL (Task) is deliberately NOT allow-listed: a bare entry
      // would shadow canUseTool, and canUseTool is where duplicate spawns
      // (same subagent type + same task, twice in one turn) get bounced.
      allowedTools: [
        ...[...mainThreadSet]
          .filter((n) => !DESTRUCTIVE_TOOLS.includes(n))
          .map((n) => `${MCP_TOOL_PREFIX}${n}`)
      ],
      disallowedTools: DISALLOWED_BUILTIN_TOOLS,
      maxTurns: this.recursionLimit(),
      permissionMode: 'default',
      canUseTool: async(
        toolName: string,
        input: Record<string, unknown>,
        extra?: { agentID?: string }
      ): Promise<Record<string, unknown>> => {
        const bare = stripMcpPrefix(toolName)
        // Duplicate-spawn guard (parity with the orchestrator's wave
        // dedup): the same subagent type with the same task runs ONCE
        // per turn — the second attempt is bounced with guidance.
        if (toolName === SPAWN_TOOL) {
          const task = String(input.prompt ?? input.description ?? '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
          const key = `${String(input.subagent_type ?? '')}:${task}`
          if (task && this._turnTaskKeys.has(key)) {
            return {
              behavior: 'deny',
              message:
                'An identical agent (same type, same task) already ran this turn — use its ' +
                'result, or give this one a genuinely different scope.'
            }
          }
          this._turnTaskKeys.add(key)
          return { behavior: 'allow', updatedInput: input }
        }
        if (DESTRUCTIVE_TOOLS.includes(bare)) {
          const approved = await this._callbacks.requestApproval({
            id: crypto.randomUUID(),
            summary: `DESTRUCTIVE OPERATION — ${bare}: ${previewArgs(input)}`,
            spawns: []
          })
          if (!approved) {
            return {
              behavior: 'deny',
              message: 'The writer declined this operation. Do not retry it.'
            }
          }
        }
        // Worker-only tools are registered on the server (subagents need
        // them) but the MAIN thread must delegate, exactly like the
        // LangGraph supervisor. agentID is present only inside subagents.
        if (
          !extra?.agentID &&
          toolName.startsWith(MCP_TOOL_PREFIX) &&
          !mainThreadSet.has(bare) &&
          !DESTRUCTIVE_TOOLS.includes(bare)
        ) {
          return {
            behavior: 'deny',
            message: 'This tool belongs to a specialist — spawn one with Task.'
          }
        }
        return { behavior: 'allow', updatedInput: input }
      }
    }

    const stream = sdk.query({ prompt, options })
    this._activeQuery = stream
    const onAbort = (): void => {
      stream.interrupt?.().catch(() => {})
    }
    cfg?.signal?.addEventListener('abort', onAbort, { once: true })

    this._turnUsage = emptyTally()
    this._turnTaskKeys.clear()
    let finalText = ''
    let sawError: string | null = null
    let sawBudget: Error | null = null

    try {
      for await (const raw of stream) {
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
        if (name === SPAWN_TOOL) {
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
        if (block.type !== 'tool_result' || !this._spawnedTaskIds.has(String(block.tool_use_id))) {
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
