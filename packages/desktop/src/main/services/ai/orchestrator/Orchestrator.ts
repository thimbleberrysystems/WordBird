/**
 * Dynamic multi-agent orchestrator.
 *
 * The graph is NOT fixed: a supervisor model receives the writer's intent
 * and decides at runtime which sub-agents to spawn (explorers, online
 * researchers, drafters, continuity auditors, line editors — see
 * roles.ts), how many, and in how many waves. Workers run in parallel as
 * independent ReAct subgraphs with role-scoped toolsets; their results
 * flow back to the supervisor, which spawns again or answers.
 *
 * Autonomy is governed by a Claude-Code-style permission mode:
 * plan (describe, never execute), ask (approval before each wave),
 * auto / full-auto (budgeted free rein). Every mode keeps prose edits
 * inside the review pipeline — workers can only PROPOSE edits.
 *
 * The supervisor graph is compiled with the durable checkpointer, so a
 * long orchestration survives an app restart and resumes on its thread.
 */

import crypto from 'crypto'
import log from 'electron-log'
import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import {
  AIMessage,
  SystemMessage,
  ToolMessage,
  HumanMessage,
  RemoveMessage
} from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { Runnable } from '@langchain/core/runnables'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import {
  StateGraph,
  MessagesAnnotation,
  END,
  START,
  REMOVE_ALL_MESSAGES
} from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { AGENT_ROLES, MODE_BUDGETS, isAgentRole } from './roles'
import type {
  AgentPermissionMode,
  AgentRole,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentSpawnRequest,
  IAgentStatus,
  IContextUsage,
  ITokenTally,
  ITokenUsageUpdate
} from '../../../../shared/types/langgraph'

export interface OrchestratorCallbacks {
  emitActivity: (event: IAgentActivityEvent) => void
  requestApproval: (request: IAgentApprovalRequest) => Promise<boolean>
  /** Compact per-turn project grounding (outline + book summary + issues). */
  buildBrief?: () => Promise<string>
  /** Context-window pressure updates, drives the ring indicator in the UI. */
  emitContextUsage?: (usage: IContextUsage) => void
  /** Token accounting per turn/session, drives the usage counter. */
  emitTokenUsage?: (usage: ITokenUsageUpdate) => void
  /** Live per-agent status updates, drives the agent panel. */
  emitAgentStatus?: (status: IAgentStatus) => void
  /** Mid-run writer notes, drained at each supervisor boundary. */
  drainSteering?: () => string[]
}

// ---- Token accounting -------------------------------------------------

export const emptyTally = (): ITokenTally => ({
  inputTokens: 0,
  outputTokens: 0,
  calls: 0,
  byRole: {}
})

/** Pull token counts off a model response (usage_metadata is the modern
 * field; response_metadata.tokenUsage covers older provider adapters). */
export const extractUsage = (
  message: BaseMessage
): { inputTokens: number; outputTokens: number } | null => {
  const m = message as unknown as {
    usage_metadata?: { input_tokens?: number; output_tokens?: number }
    response_metadata?: { tokenUsage?: { promptTokens?: number; completionTokens?: number } }
  }
  if (m.usage_metadata) {
    return {
      inputTokens: m.usage_metadata.input_tokens ?? 0,
      outputTokens: m.usage_metadata.output_tokens ?? 0
    }
  }
  const legacy = m.response_metadata?.tokenUsage
  if (legacy && (legacy.promptTokens || legacy.completionTokens)) {
    return {
      inputTokens: legacy.promptTokens ?? 0,
      outputTokens: legacy.completionTokens ?? 0
    }
  }
  return null
}

export const addToTally = (
  tally: ITokenTally,
  role: string,
  usage: { inputTokens: number; outputTokens: number }
): void => {
  tally.inputTokens += usage.inputTokens
  tally.outputTokens += usage.outputTokens
  tally.calls += 1
  const bucket = (tally.byRole[role] ??= { inputTokens: 0, outputTokens: 0, calls: 0 })
  bucket.inputTokens += usage.inputTokens
  bucket.outputTokens += usage.outputTokens
  bucket.calls += 1
}

/** ~80-char single-line preview of tool args for the activity feed. */
export const previewArgs = (args: unknown): string => {
  try {
    const text = JSON.stringify(args ?? {})
    return text.length > 80 ? text.slice(0, 80) + '…' : text
  } catch {
    return ''
  }
}

// ---- Interrupt safety --------------------------------------------------

export const INTERRUPTED_TOOL_NOTE =
  '[interrupted — this action never completed; re-run it if still needed]'

/**
 * Repair a thread whose run was interrupted between supersteps: any
 * AIMessage tool_call without a matching ToolMessage would make the next
 * provider request invalid (dangling tool_use → 400 on Anthropic/OpenAI).
 * Synthetic ToolMessages are inserted DIRECTLY AFTER the calling message
 * (and any of its real results) so ordering stays provider-legal.
 */
export const repairDanglingToolCalls = (
  messages: BaseMessage[]
): { messages: BaseMessage[]; repaired: number } => {
  const answered = new Set<string>()
  for (const message of messages) {
    if (message instanceof ToolMessage && message.tool_call_id) {
      answered.add(message.tool_call_id)
    }
  }

  let repaired = 0
  const output: BaseMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    output.push(message)
    if (!(message instanceof AIMessage) || !(message.tool_calls?.length)) continue

    const missing = message.tool_calls.filter((c) => c.id && !answered.has(c.id))
    if (missing.length === 0) continue

    // Skip past this call's real ToolMessages before inserting synthetics.
    while (i + 1 < messages.length && messages[i + 1] instanceof ToolMessage) {
      i += 1
      output.push(messages[i])
    }
    for (const call of missing) {
      output.push(
        new ToolMessage({ content: INTERRUPTED_TOOL_NOTE, tool_call_id: call.id as string })
      )
      repaired += 1
    }
  }
  return { messages: output, repaired }
}

/**
 * Boundary-based pause: an in-flight LLM call cannot be halted, so the
 * gate is awaited at every step boundary (before model calls and tool
 * executions). Stop/cancel signals win over a paused gate instantly.
 */
export class PauseGate {
  private _paused = false
  private _waiters: Array<() => void> = []

  get paused(): boolean {
    return this._paused
  }

  pause(): void {
    this._paused = true
  }

  resume(): void {
    this._paused = false
    const waiters = this._waiters
    this._waiters = []
    for (const wake of waiters) wake()
  }

  /** Resolves immediately when not paused; while paused, waits for resume
   * or rejects on abort so Stop/cancel are never blocked by a pause. */
  wait(signal?: AbortSignal): Promise<void> {
    if (!this._paused) return Promise.resolve()
    if (signal?.aborted) return Promise.reject(new Error('Aborted while paused'))
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        this._waiters = this._waiters.filter((w) => w !== wake)
        reject(new Error('Aborted while paused'))
      }
      const wake = (): void => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      this._waiters.push(wake)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

// ---- Context budgeting -------------------------------------------------
// Thread state accumulates every turn and tool result; without a window
// the model input grows unboundedly on a long project. Budgets are in
// characters (~4 chars/token): generous enough for continuity, small
// enough to never blow a context window.
const HISTORY_CHAR_BUDGET = 60000
const SINGLE_MESSAGE_CHAR_CAP = 16000
const WORKER_RESULT_CHAR_CAP = 8000

const contentLength = (message: BaseMessage): number => {
  const c = message.content
  return typeof c === 'string' ? c.length : JSON.stringify(c ?? '').length
}

const clipContent = (message: BaseMessage): BaseMessage => {
  if (typeof message.content !== 'string') return message
  if (message.content.length <= SINGLE_MESSAGE_CHAR_CAP) return message
  const clipped =
    message.content.slice(0, SINGLE_MESSAGE_CHAR_CAP) +
    `\n…[${message.content.length - SINGLE_MESSAGE_CHAR_CAP} characters trimmed]`
  if (message instanceof ToolMessage) {
    return new ToolMessage({ content: clipped, tool_call_id: message.tool_call_id })
  }
  return message
}

// Compaction: when the thread crosses this share of the budget, the
// oldest turns are summarized INTO the thread (a durable rewrite) instead
// of being silently dropped by the trim safety net.
const COMPACT_TRIGGER_RATIO = 0.8
// How much recent conversation survives compaction verbatim.
const COMPACT_RETAIN_CHARS = 24000
export const COMPACT_MARKER = '[CONVERSATION SO FAR — condensed]'

export const historyChars = (messages: BaseMessage[]): number =>
  messages.reduce((sum, m) => sum + contentLength(m), 0)

/**
 * Split the thread for compaction: everything before the retained tail is
 * summarized; the tail survives verbatim. The tail never starts on a
 * ToolMessage (orphaned tool results are API errors on most providers).
 * Returns null when there is nothing worth compacting.
 */
export const splitForCompaction = (
  messages: BaseMessage[],
  retainChars = COMPACT_RETAIN_CHARS
): { old: BaseMessage[]; tail: BaseMessage[] } | null => {
  let tailStart = messages.length
  let tailSize = 0
  while (tailStart > 0 && tailSize + contentLength(messages[tailStart - 1]) <= retainChars) {
    tailStart -= 1
    tailSize += contentLength(messages[tailStart])
  }
  // Don't let the tail open with orphaned tool results.
  while (tailStart < messages.length && messages[tailStart] instanceof ToolMessage) {
    tailStart += 1
  }
  if (tailStart <= 0) return null
  return { old: messages.slice(0, tailStart), tail: messages.slice(tailStart) }
}

const renderForSummary = (messages: BaseMessage[]): string =>
  messages
    .map((m) => {
      const kind = m.getType?.() ?? 'message'
      const text =
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      return `${kind}: ${text.slice(0, 2000)}`
    })
    .join('\n---\n')

const COMPACT_PROMPT =
  'You are compacting the memory of a long working conversation between a ' +
  'novelist and Biscuit, their AI writing companion. Write a dense briefing ' +
  '(under 350 words) that preserves everything a future turn needs:\n' +
  '- decisions made and the writer\'s stated preferences\n' +
  '- story facts established or changed (characters, plot, canon)\n' +
  '- work completed (edits proposed/applied, files touched, unit ids)\n' +
  '- tasks still pending or promised\n' +
  '- unresolved questions\n' +
  'Write it as plain prose/bullets. Do not add commentary or preamble.'

/**
 * Fit the conversation into the character budget: keep the most recent
 * messages whole (oversized tool results clipped), drop the oldest, and
 * report whether anything was elided so the caller can note it in the
 * system prompt. The window never starts on a ToolMessage — an orphaned
 * tool result without its calling AIMessage is an API error on most
 * providers.
 */
export const trimHistory = (
  messages: BaseMessage[],
  budget = HISTORY_CHAR_BUDGET
): { messages: BaseMessage[]; trimmed: boolean } => {
  const clipped = messages.map(clipContent)
  let total = clipped.reduce((sum, m) => sum + contentLength(m), 0)
  if (total <= budget) return { messages: clipped, trimmed: false }

  let start = 0
  while (start < clipped.length - 1 && total > budget) {
    total -= contentLength(clipped[start])
    start += 1
  }
  // Never lead with orphaned tool results.
  while (start < clipped.length - 1 && clipped[start] instanceof ToolMessage) {
    start += 1
  }
  return { messages: clipped.slice(start), trimmed: true }
}

interface BindableModel extends Runnable {
  bindTools?: (tools: unknown[]) => Runnable
}

const SUPERVISOR_TOOL_NAMES = [
  'list_structure',
  'read_summary',
  'search_manuscript',
  'read_bible',
  'list_files',
  'list_continuity_issues',
  'start_revision',
  'get_revision',
  'complete_revision',
  'save_plan',
  'update_plan',
  'list_plans',
  'propose_plan'
]

const SPAWN_TOOL_NAME = 'spawn_agents'

const spawnSchema = z.object({
  agents: z
    .array(
      z.object({
        role: z
          .enum(['explorer', 'researcher', 'drafter', 'auditor', 'line-editor', 'plotter'])
          .describe('Which specialist to spawn.'),
        task: z
          .string()
          .describe(
            'Complete, self-contained instructions for this agent — it cannot see the conversation.'
          )
      })
    )
    .min(1)
    .describe('Sub-agents to run in parallel in this wave.')
})

const buildSupervisorPrompt = (mode: AgentPermissionMode, maxWorkers: number): string =>
  'You are Biscuit, the AI writing companion inside WordBird, a novel-writing app. ' +
  'You orchestrate a team of specialist sub-agents to serve a novelist:\n' +
  Object.values(AGENT_ROLES)
    .map((r) => `- ${r.role}: ${r.displayName} — ${r.activityLabel.toLowerCase()}`)
    .join('\n') +
  '\n\nHOW TO WORK:\n' +
  '- Answer directly (or with your own read tools) when the request is simple.\n' +
  `- For anything needing legwork, call ${SPAWN_TOOL_NAME} with up to ${maxWorkers} agents per wave; ` +
  'independent tasks belong in ONE wave so they run in parallel.\n' +
  '- Give each agent complete, self-contained instructions: what to do, where to look, what to ' +
  'return. Include relevant unit ids/paths from the project brief so they start oriented.\n' +
  '- Prose/bible changes are made by drafter or line-editor agents and always reach the writer as ' +
  'reviewable diffs — never claim changes happened without spawning an agent that proposed them.\n' +
  '- After results return, either spawn another wave (if genuinely needed) or reply to the writer ' +
  'in warm, plain language. Do not mention roles, waves, or tool names to the writer.\n' +
  '- Messages marked "[Writer, mid-run]" arrived while you were working — they take precedence ' +
  'over earlier instructions when they conflict; adjust course immediately.\n' +
  '- Tool results reading "[interrupted…]" mean a previous run was stopped mid-action: nothing ' +
  'was completed for that call. Re-run it if the writer still wants it.\n' +
  '\nSWEEPING REVISIONS (removing a character, changing a timeline, renaming across the book):\n' +
  '- Never wing a book-wide change. Run the revision workflow:\n' +
  '  1) INTERVIEW the writer first: exactly what changes; every name/alias involved; who ' +
  'inherits orphaned plot functions; delete vs rewrite policy for essential scenes; tone ' +
  'constraints. Then start_revision with their answers as the directive.\n' +
  '  2) IMPACT ANALYSIS: fan out explorers using search_manuscript entity=<name> to find ' +
  'EVERY affected unit and classify it into the impact map (update_impact_map).\n' +
  '  3) Present the impact map to the writer, highlighting plot-dependency units that need ' +
  'their decision. Get approval BEFORE any edits.\n' +
  '  4) EXECUTE in small batches: spawn drafters per batch of units; each reads the ' +
  'directive via get_revision, proposes edits through normal review, and marks units done. ' +
  'Do a few units per turn and tell the writer to say "continue" for the next batch.\n' +
  '  5) VERIFY: when the map is exhausted, spawn an auditor to prove zero references ' +
  'survive and nothing new contradicts; then complete_revision with the report.\n' +
  '- If the project brief shows an ACTIVE REVISION, continue it: get_revision, work the ' +
  'next pending units.\n' +
  '\nTHE NOVEL IS THE SOURCE OF TRUTH:\n' +
  '- bible/ is established canon. Anything that touches characters, places, or plot must be checked ' +
  'against it (read_bible) before writing or claiming facts. Pages marked locked are immutable.\n' +
  '- Never assert where something appears in the manuscript without search_manuscript evidence.\n' +
  '- Prefer summaries (read_summary) over full prose to orient; read full units only when the task ' +
  'demands the actual text. Have summaries refreshed (update_summary) after prose changes.\n' +
  '- Before sweeping multi-file changes, have an agent take snapshot_project so the writer can rewind.\n' +
  '- New canon discovered while working should be recorded via a drafter with propose_bible_update.\n' +
  (mode === 'plan'
    ? '\nPLAN MODE IS ACTIVE: you may use read tools to analyze, but you cannot spawn agents ' +
      'and no prose, scenes, or bible pages can change. Your one writable surface is the LIVE ' +
      'PLAN FILE in plans/:\n' +
      '- Check list_plans first: continue an existing plan for this task, or save_plan a new ' +
      'one EARLY (a new task means a new plan file).\n' +
      '- Keep the file current with update_plan as each exchange refines the idea — the ' +
      'writer can open plans/<file>.md in the editor and edit it themselves, so re-read it ' +
      '(read_project_file) before updating and fold their edits in, never clobber them.\n' +
      '- When the plan is settled, call propose_plan — the writer gets an approval card; ' +
      'approving switches them to an execution mode and you will be asked to carry it out. ' +
      'Then STOP and wait.\n' +
      '- If the writer asks you to write anything else, explain Plan mode blocks it and that ' +
      'Shift+Tab (the mode line under the chat box) switches modes.\n'
    : '') +
  (mode === 'ask'
    ? '\nASK MODE IS ACTIVE: the writer approves each spawn wave. Keep waves small and purposeful.\n'
    : '')

export class Orchestrator {
  private _mode: AgentPermissionMode = 'ask'
  private _callbacks: OrchestratorCallbacks
  private _modelFactory: () => BindableModel
  private _allTools: DynamicStructuredTool[]
  private _checkpointer: BaseCheckpointSaver | undefined

  constructor(options: {
    modelFactory: () => BindableModel
    tools: DynamicStructuredTool[]
    callbacks: OrchestratorCallbacks
    checkpointer?: BaseCheckpointSaver
  }) {
    this._modelFactory = options.modelFactory
    this._allTools = options.tools
    this._callbacks = options.callbacks
    this._checkpointer = options.checkpointer
  }

  get mode(): AgentPermissionMode {
    return this._mode
  }

  setMode(mode: AgentPermissionMode): void {
    this._mode = mode
  }

  // ---- Token accounting state ----
  private _turnUsage: ITokenTally = emptyTally()
  private _sessionUsage: ITokenTally = emptyTally()

  private _recordUsage(role: string, message: BaseMessage): void {
    const usage = extractUsage(message)
    if (!usage) return
    addToTally(this._turnUsage, role, usage)
    addToTally(this._sessionUsage, role, usage)
    this._callbacks.emitTokenUsage?.({
      turn: JSON.parse(JSON.stringify(this._turnUsage)),
      session: JSON.parse(JSON.stringify(this._sessionUsage))
    })
  }

  /** New user turn — turn tally starts fresh (called from housekeeping). */
  private _beginTurnUsage(): void {
    this._turnUsage = emptyTally()
  }

  resetSessionUsage(): void {
    this._turnUsage = emptyTally()
    this._sessionUsage = emptyTally()
  }

  // ---- Pause gate (boundary-based; see PauseGate) ----
  private _pauseGate = new PauseGate()

  pause(): void {
    this._pauseGate.pause()
  }

  resumeFromPause(): void {
    this._pauseGate.resume()
  }

  get isPaused(): boolean {
    return this._pauseGate.paused
  }

  // ---- Live agent registry (per-agent cancel) ----
  private _liveAgents = new Map<string, { controller: AbortController; status: IAgentStatus }>()

  /** Abort ONE running sub-agent; the rest of the wave continues. */
  cancelAgent(agentId: string): boolean {
    const live = this._liveAgents.get(agentId)
    if (!live) return false
    live.controller.abort()
    return true
  }

  private _emitAgentStatus(status: IAgentStatus): void {
    this._callbacks.emitAgentStatus?.({ ...status })
  }

  // The project brief is rebuilt at most once per few seconds: the
  // supervisor and every parallel worker in the same turn share one build.
  private _briefCache: { value: string; at: number } | null = null

  private async _getBrief(): Promise<string> {
    if (!this._callbacks.buildBrief) return ''
    if (this._briefCache && Date.now() - this._briefCache.at < 5000) {
      return this._briefCache.value
    }
    try {
      const value = await this._callbacks.buildBrief()
      this._briefCache = { value, at: Date.now() }
      return value
    } catch {
      return ''
    }
  }

  private _activity(
    kind: IAgentActivityEvent['kind'],
    label: string,
    detail?: string,
    role?: AgentRole
  ): void {
    this._callbacks.emitActivity({
      id: crypto.randomUUID(),
      ts: Date.now(),
      kind,
      role,
      label,
      detail
    })
  }

  private _toolsByName(names: string[]): DynamicStructuredTool[] {
    return this._allTools.filter((t) => names.includes(t.name))
  }

  private _emitUsage(usedChars: number, compacting: boolean): void {
    this._callbacks.emitContextUsage?.({
      usedChars,
      budgetChars: HISTORY_CHAR_BUDGET,
      ratio: Math.min(1, usedChars / HISTORY_CHAR_BUDGET),
      compacting
    })
  }

  /**
   * Durable compaction: summarize the oldest turns into one condensed
   * message and rewrite the checkpointed thread as [summary, ...tail].
   * Returns the state update, or null when compaction isn't needed or
   * the summarization call fails (the trim safety net still applies).
   */
  private async _compact(
    messages: BaseMessage[],
    signal?: AbortSignal
  ): Promise<BaseMessage[] | null> {
    const split = splitForCompaction(messages)
    if (!split || split.old.length === 0) return null

    this._activity('status', 'Condensing earlier conversation…')
    this._emitUsage(historyChars(messages), true)

    try {
      const model = this._modelFactory()
      const response = (await model.invoke(
        [
          new SystemMessage(COMPACT_PROMPT),
          new HumanMessage(renderForSummary(split.old))
        ],
        { signal } as never
      )) as BaseMessage
      this._recordUsage('compaction', response)
      const summaryText =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content ?? '')
      if (!summaryText.trim()) return null

      // Carry forward the previous condensation if the tail-side summary
      // marker was itself about to be compacted away — it is part of `old`
      // and therefore already folded into the new summary by the model.
      const summary = new HumanMessage({
        content: `${COMPACT_MARKER}\n${summaryText.trim().slice(0, 4000)}`
      })

      log.info(
        `[orchestrator] Compacted ${split.old.length} messages ` +
        `(${historyChars(split.old)} chars) into ${summaryText.length} chars`
      )
      // REMOVE_ALL_MESSAGES clears the thread; the reducer then re-appends
      // in order, giving a clean [summary, ...tail] history.
      return [
        new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
        summary,
        ...split.tail
      ]
    } catch (error) {
      log.warn('[orchestrator] Compaction failed, falling back to trim:', error)
      return null
    }
  }

  /** Build a transient ReAct worker for one role. */
  private _buildWorker(
    role: AgentRole,
    onToolCall?: (name: string, args: unknown) => void
  ): { graph: Runnable; toolCount: number } {
    const definition = AGENT_ROLES[role]
    const tools = this._toolsByName(definition.allowedTools)
    const model = this._modelFactory()
    const bound = tools.length && model.bindTools ? model.bindTools(tools) : model
    const toolMap = new Map(tools.map((t) => [t.name, t]))

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', async(state, config) => {
        await this._pauseGate.wait(config?.signal as AbortSignal | undefined)
        const response = await bound.invoke(state.messages)
        this._recordUsage(role, response as BaseMessage)
        return { messages: [response] }
      })
      .addNode('tools', async(state, config) => {
        const last = state.messages[state.messages.length - 1] as AIMessage
        const calls = last.tool_calls ?? []
        const results: ToolMessage[] = []
        for (const call of calls) {
          await this._pauseGate.wait(config?.signal as AbortSignal | undefined)
          const toolImpl = toolMap.get(call.name)
          let content: string
          try {
            if (!toolImpl) throw new Error(`Tool ${call.name} is not available to this agent.`)
            onToolCall?.(call.name, call.args)
            this._activity(
              'tool',
              `${definition.displayName}: ${call.name}`,
              previewArgs(call.args),
              role
            )
            const raw = await toolImpl.invoke(call.args ?? {})
            content = typeof raw === 'string' ? raw : JSON.stringify(raw)
          } catch (error) {
            content = `Error: ${error instanceof Error ? error.message : String(error)}`
          }
          results.push(
            new ToolMessage({ content, tool_call_id: call.id ?? crypto.randomUUID() })
          )
        }
        return { messages: results }
      })
      .addEdge(START, 'agent')
      .addConditionalEdges(
        'agent',
        (state) => {
          const last = state.messages[state.messages.length - 1] as AIMessage
          return last.tool_calls && last.tool_calls.length > 0 ? 'tools' : END
        },
        { tools: 'tools', [END]: END }
      )
      .addEdge('tools', 'agent')

    return { graph: workflow.compile() as unknown as Runnable, toolCount: tools.length }
  }

  private async _runWorker(
    spawn: IAgentSpawnRequest,
    recursionLimit: number,
    signal?: AbortSignal
  ): Promise<string> {
    const definition = AGENT_ROLES[spawn.role]
    this._activity('agent-start', `${definition.displayName}: ${definition.activityLabel}`, spawn.task, spawn.role)

    // Every worker is individually cancellable from the agent panel; the
    // turn-level Stop still aborts everyone via the combined signal.
    const agentId = crypto.randomUUID()
    const controller = new AbortController()
    const status: IAgentStatus = {
      agentId,
      role: spawn.role,
      task: spawn.task,
      status: 'running',
      startedAt: Date.now(),
      toolCalls: 0
    }
    this._liveAgents.set(agentId, { controller, status })
    this._emitAgentStatus(status)

    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal

    try {
      const { graph } = this._buildWorker(spawn.role, () => {
        status.toolCalls += 1
        this._emitAgentStatus(status)
      })
      // Workers are context-isolated (they never see the conversation), but
      // they share the same compact project grounding as the supervisor so
      // they start oriented instead of re-discovering the novel via tools.
      const brief = await this._getBrief()
      const systemText = definition.systemPrompt + (brief ? `\n\n${brief}` : '')
      const result = (await graph.invoke(
        {
          messages: [new SystemMessage(systemText), new HumanMessage(spawn.task)]
        },
        { recursionLimit, signal: combinedSignal } as never
      )) as { messages: BaseMessage[] }
      const last = result.messages[result.messages.length - 1]
      let content =
        typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
      // Worker reports persist in thread state — keep them bounded.
      if (content.length > WORKER_RESULT_CHAR_CAP) {
        content =
          content.slice(0, WORKER_RESULT_CHAR_CAP) +
          `\n…[report truncated at ${WORKER_RESULT_CHAR_CAP} characters]`
      }
      status.status = 'done'
      status.endedAt = Date.now()
      this._emitAgentStatus(status)
      this._activity('agent-done', `${definition.displayName} finished`, undefined, spawn.role)
      return content || '(no result)'
    } catch (error) {
      const cancelled = controller.signal.aborted && !signal?.aborted
      status.status = cancelled ? 'cancelled' : 'failed'
      status.endedAt = Date.now()
      this._emitAgentStatus(status)
      if (cancelled) {
        this._activity('agent-done', `${definition.displayName} cancelled`, undefined, spawn.role)
        return `The ${definition.displayName} agent was cancelled by the writer before finishing.`
      }
      const message = error instanceof Error ? error.message : String(error)
      this._activity('agent-done', `${definition.displayName} failed`, message, spawn.role)
      return `The ${definition.displayName} agent failed: ${message}`
    } finally {
      this._liveAgents.delete(agentId)
    }
  }

  private _parseSpawns(args: Record<string, unknown>): IAgentSpawnRequest[] {
    const agents = Array.isArray(args.agents) ? args.agents : []
    const spawns: IAgentSpawnRequest[] = []
    for (const entry of agents) {
      if (
        entry &&
        typeof entry === 'object' &&
        isAgentRole((entry as Record<string, unknown>).role) &&
        typeof (entry as Record<string, unknown>).task === 'string'
      ) {
        spawns.push({
          role: (entry as { role: AgentRole }).role,
          task: (entry as { task: string }).task
        })
      }
    }
    return spawns
  }

  /** Count spawn waves already executed in this thread's state. */
  private _countWaves(messages: BaseMessage[]): number {
    return messages.filter(
      (m) =>
        m instanceof AIMessage &&
        (m.tool_calls ?? []).some((c) => c.name === SPAWN_TOOL_NAME)
    ).length
  }

  buildGraph(): Runnable {
    const budget = MODE_BUDGETS[this._mode]
    const mode = this._mode

    const spawnTool = tool(async() => 'handled-by-actions-node', {
      name: SPAWN_TOOL_NAME,
      description:
        'Spawn one wave of specialist sub-agents that run in parallel. ' +
        'Use for research, manuscript exploration, drafting, auditing, or polishing.',
      schema: spawnSchema
    })

    const supervisorTools = [
      ...(mode === 'plan' ? [] : [spawnTool]),
      ...this._toolsByName(SUPERVISOR_TOOL_NAMES)
    ]
    const supervisorToolMap = new Map(supervisorTools.map((t) => [t.name, t]))

    const model = this._modelFactory()
    const bound =
      supervisorTools.length && model.bindTools ? model.bindTools(supervisorTools) : model

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('housekeeping', async(state, config) => {
        // Runs once per user turn, before the supervisor: honor pause,
        // REPAIR any interrupted prior run (dangling tool_calls corrupt
        // the thread for every provider), reset the turn token tally,
        // then report context pressure / compact past the threshold.
        const signal = config?.signal as AbortSignal | undefined
        await this._pauseGate.wait(signal)
        this._beginTurnUsage()

        const { messages: repairedMessages, repaired } = repairDanglingToolCalls(state.messages)
        if (repaired > 0) {
          this._activity(
            'status',
            'Recovered from an interrupted run',
            `${repaired} unfinished action${repaired > 1 ? 's' : ''} marked as interrupted`
          )
          log.info(`[orchestrator] Repaired ${repaired} dangling tool call(s) on entry`)
        }

        const used = historyChars(repairedMessages)
        if (used > HISTORY_CHAR_BUDGET * COMPACT_TRIGGER_RATIO) {
          const update = await this._compact(repairedMessages, signal)
          if (update) {
            const after = update.filter((m) => !(m instanceof RemoveMessage))
            this._emitUsage(historyChars(after), false)
            return { messages: update }
          }
        }
        this._emitUsage(used, false)
        if (repaired > 0) {
          return { messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...repairedMessages] }
        }
        return { messages: [] }
      })
      .addNode('supervisor', async(state, config) => {
        await this._pauseGate.wait(config?.signal as AbortSignal | undefined)

        // Mid-run steering: writer notes typed while agents work land here,
        // at the next supervisor boundary — in the model input AND the
        // persisted thread.
        const steering = (this._callbacks.drainSteering?.() ?? []).map(
          (text) => new HumanMessage(`[Writer, mid-run]: ${text}`)
        )

        // Grounding + budgeting, fresh every call and never persisted:
        // the system prompt carries the project brief, and the accumulated
        // thread is windowed to the character budget.
        const brief = await this._getBrief()
        const { messages: history, trimmed } = trimHistory(state.messages)
        const systemText =
          buildSupervisorPrompt(mode, budget.maxWorkersPerWave) +
          (brief ? `\n\n${brief}` : '') +
          (trimmed
            ? '\n\n[Note: earlier parts of this long conversation were trimmed for space. ' +
              'Rely on the project brief and tools rather than memory of old turns.]'
            : '')
        const messages = [new SystemMessage(systemText), ...history, ...steering]
        const response = await bound.invoke(messages, config)
        this._recordUsage('supervisor', response as BaseMessage)
        return { messages: [...steering, response] }
      })
      .addNode('actions', async(state, config) => {
        const last = state.messages[state.messages.length - 1] as AIMessage
        const calls = last.tool_calls ?? []
        const results: ToolMessage[] = []

        for (const call of calls) {
          await this._pauseGate.wait(config?.signal as AbortSignal | undefined)
          const callId = call.id ?? crypto.randomUUID()

          if (call.name === SPAWN_TOOL_NAME) {
            const content = await this._handleSpawnCall(
              call.args as Record<string, unknown>,
              state.messages,
              config?.signal as AbortSignal | undefined
            )
            results.push(new ToolMessage({ content, tool_call_id: callId }))
            continue
          }

          const toolImpl = supervisorToolMap.get(call.name)
          let content: string
          try {
            if (!toolImpl) throw new Error(`Unknown tool: ${call.name}`)
            this._activity('tool', `Biscuit: ${call.name}`, previewArgs(call.args))
            const raw = await (toolImpl as DynamicStructuredTool).invoke(call.args ?? {})
            content = typeof raw === 'string' ? raw : JSON.stringify(raw)
          } catch (error) {
            content = `Error: ${error instanceof Error ? error.message : String(error)}`
          }
          results.push(new ToolMessage({ content, tool_call_id: callId }))
        }
        return { messages: results }
      })
      .addEdge(START, 'housekeeping')
      .addEdge('housekeeping', 'supervisor')
      .addConditionalEdges(
        'supervisor',
        (state) => {
          const last = state.messages[state.messages.length - 1] as AIMessage
          return last.tool_calls && last.tool_calls.length > 0 ? 'actions' : END
        },
        { actions: 'actions', [END]: END }
      )
      .addEdge('actions', 'supervisor')

    return workflow.compile({
      checkpointer: this._checkpointer
    }) as unknown as Runnable
  }

  private async _handleSpawnCall(
    args: Record<string, unknown>,
    stateMessages: BaseMessage[],
    signal?: AbortSignal
  ): Promise<string> {
    const budget = MODE_BUDGETS[this._mode]

    if (this._mode === 'plan') {
      this._activity('plan', 'Plan mode: spawning is disabled')
      return (
        'PLAN MODE: sub-agents cannot be spawned and nothing can be written. Present your ' +
        'plan to the writer as a numbered list, and tell them to press Shift+Tab (the mode ' +
        'line under the chat box) to switch to Ask or Auto when they want it executed — ' +
        'only the writer can switch the mode.'
      )
    }

    const waves = this._countWaves(stateMessages)
    if (waves > budget.maxWaves) {
      this._activity('status', 'Budget reached', `Wave limit (${budget.maxWaves}) hit`)
      return `Budget exhausted: this task already used ${budget.maxWaves} spawn waves. Summarize what you have.`
    }

    let spawns = this._parseSpawns(args)
    if (spawns.length === 0) {
      return 'No valid agents were requested. Check the role names and try again.'
    }
    if (spawns.length > budget.maxWorkersPerWave) {
      spawns = spawns.slice(0, budget.maxWorkersPerWave)
    }

    if (this._mode === 'ask') {
      this._activity('approval', 'Waiting for your approval', `${spawns.length} agent(s) requested`)
      const approved = await this._callbacks.requestApproval({
        id: crypto.randomUUID(),
        summary: spawns.map((s) => `${AGENT_ROLES[s.role].displayName}: ${s.task}`).join('\n'),
        spawns
      })
      if (!approved) {
        this._activity('status', 'Spawn declined by writer')
        return 'The writer declined this wave of agents. Ask what they would like instead.'
      }
    }

    this._activity(
      'spawn',
      `Spawning ${spawns.length} agent${spawns.length > 1 ? 's' : ''}`,
      spawns.map((s) => AGENT_ROLES[s.role].displayName).join(', ')
    )

    const results = await Promise.all(
      spawns.map((spawn) => this._runWorker(spawn, budget.workerRecursionLimit, signal))
    )

    return spawns
      .map(
        (spawn, i) =>
          `=== ${AGENT_ROLES[spawn.role].displayName} (${spawn.role}) ===\nTask: ${spawn.task}\n\n${results[i]}`
      )
      .join('\n\n')
  }

  /**
   * Manual compaction between turns: read the checkpointed thread, run the
   * same repair+condense pass housekeeping uses, and write it back with
   * updateState (attributed to the housekeeping node so the reducer applies
   * it identically).
   */
  async compactThread(
    graph: Runnable,
    threadId: string
  ): Promise<{ compacted: boolean; repaired: number }> {
    const stateful = graph as unknown as {
      getState: (config: unknown) => Promise<{ values?: { messages?: BaseMessage[] } }>
      updateState: (config: unknown, values: unknown, asNode?: string) => Promise<unknown>
    }
    const config = { configurable: { thread_id: threadId } }
    const snapshot = await stateful.getState(config)
    const messages = snapshot?.values?.messages ?? []
    if (messages.length === 0) return { compacted: false, repaired: 0 }

    const { messages: repairedMessages, repaired } = repairDanglingToolCalls(messages)
    // Manual trigger ignores the 80% threshold — the writer asked for it —
    // but still needs enough material beyond the retained tail.
    const update = await this._compact(repairedMessages)
    if (update) {
      await stateful.updateState(config, { messages: update }, 'housekeeping')
      const after = update.filter((m) => !(m instanceof RemoveMessage))
      this._emitUsage(historyChars(after), false)
      return { compacted: true, repaired }
    }
    if (repaired > 0) {
      await stateful.updateState(
        config,
        { messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...repairedMessages] },
        'housekeeping'
      )
    }
    this._emitUsage(historyChars(repairedMessages), false)
    return { compacted: false, repaired }
  }

  /**
   * Supervisor step ceiling: each wave costs 2 steps (supervisor +
   * actions), plus the per-turn housekeeping step.
   */
  recursionLimit(): number {
    const budget = MODE_BUDGETS[this._mode]
    return Math.max(8, budget.maxWaves * 2 + 8)
  }

  static isKnownRole(role: string): boolean {
    return isAgentRole(role)
  }

  static logBudgets(): void {
    log.debug('[orchestrator] budgets:', MODE_BUDGETS)
  }
}
