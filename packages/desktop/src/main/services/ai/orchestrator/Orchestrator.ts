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
  IContextUsage
} from '../../../../shared/types/langgraph'

export interface OrchestratorCallbacks {
  emitActivity: (event: IAgentActivityEvent) => void
  requestApproval: (request: IAgentApprovalRequest) => Promise<boolean>
  /** Compact per-turn project grounding (outline + book summary + issues). */
  buildBrief?: () => Promise<string>
  /** Context-window pressure updates, drives the ring indicator in the UI. */
  emitContextUsage?: (usage: IContextUsage) => void
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

export interface OrchestratorRunOptions {
  threadId?: string
  signal?: AbortSignal
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
  private _buildWorker(role: AgentRole): { graph: Runnable; toolCount: number } {
    const definition = AGENT_ROLES[role]
    const tools = this._toolsByName(definition.allowedTools)
    const model = this._modelFactory()
    const bound = tools.length && model.bindTools ? model.bindTools(tools) : model
    const toolMap = new Map(tools.map((t) => [t.name, t]))

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', async(state) => {
        const response = await bound.invoke(state.messages)
        return { messages: [response] }
      })
      .addNode('tools', async(state) => {
        const last = state.messages[state.messages.length - 1] as AIMessage
        const calls = last.tool_calls ?? []
        const results: ToolMessage[] = []
        for (const call of calls) {
          const toolImpl = toolMap.get(call.name)
          let content: string
          try {
            if (!toolImpl) throw new Error(`Tool ${call.name} is not available to this agent.`)
            this._activity('tool', `${definition.displayName}: ${call.name}`, undefined, role)
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
    try {
      const { graph } = this._buildWorker(spawn.role)
      // Workers are context-isolated (they never see the conversation), but
      // they share the same compact project grounding as the supervisor so
      // they start oriented instead of re-discovering the novel via tools.
      const brief = await this._getBrief()
      const systemText = definition.systemPrompt + (brief ? `\n\n${brief}` : '')
      const result = (await graph.invoke(
        {
          messages: [new SystemMessage(systemText), new HumanMessage(spawn.task)]
        },
        { recursionLimit, signal } as never
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
      this._activity('agent-done', `${definition.displayName} finished`, undefined, spawn.role)
      return content || '(no result)'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this._activity('agent-done', `${definition.displayName} failed`, message, spawn.role)
      return `The ${definition.displayName} agent failed: ${message}`
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
        // Runs once per user turn, before the supervisor: report context
        // pressure and, past the threshold, durably compact the thread.
        const used = historyChars(state.messages)
        if (used > HISTORY_CHAR_BUDGET * COMPACT_TRIGGER_RATIO) {
          const update = await this._compact(
            state.messages,
            config?.signal as AbortSignal | undefined
          )
          if (update) {
            const after = update.filter((m) => !(m instanceof RemoveMessage))
            this._emitUsage(historyChars(after), false)
            return { messages: update }
          }
        }
        this._emitUsage(used, false)
        return { messages: [] }
      })
      .addNode('supervisor', async(state, config) => {
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
        const messages = [new SystemMessage(systemText), ...history]
        const response = await bound.invoke(messages, config)
        return { messages: [response] }
      })
      .addNode('actions', async(state, config) => {
        const last = state.messages[state.messages.length - 1] as AIMessage
        const calls = last.tool_calls ?? []
        const results: ToolMessage[] = []

        for (const call of calls) {
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
            this._activity('tool', `Biscuit: ${call.name}`)
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
