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
import { AIMessage, SystemMessage, ToolMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { Runnable } from '@langchain/core/runnables'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { AGENT_ROLES, MODE_BUDGETS, isAgentRole } from './roles'
import type {
  AgentPermissionMode,
  AgentRole,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentSpawnRequest
} from '../../../../shared/types/langgraph'

export interface OrchestratorCallbacks {
  emitActivity: (event: IAgentActivityEvent) => void
  requestApproval: (request: IAgentApprovalRequest) => Promise<boolean>
}

export interface OrchestratorRunOptions {
  threadId?: string
  signal?: AbortSignal
}

interface BindableModel extends Runnable {
  bindTools?: (tools: unknown[]) => Runnable
}

const SUPERVISOR_TOOL_NAMES = ['list_structure', 'read_summary', 'search_manuscript', 'read_bible']

const SPAWN_TOOL_NAME = 'spawn_agents'

const spawnSchema = z.object({
  agents: z
    .array(
      z.object({
        role: z
          .enum(['explorer', 'researcher', 'drafter', 'auditor', 'line-editor'])
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
  '- Give each agent complete, self-contained instructions: what to do, where to look, what to return.\n' +
  '- Prose/bible changes are made by drafter or line-editor agents and always reach the writer as ' +
  'reviewable diffs — never claim changes happened without spawning an agent that proposed them.\n' +
  '- After results return, either spawn another wave (if genuinely needed) or reply to the writer ' +
  'in warm, plain language. Do not mention roles, waves, or tool names to the writer.\n' +
  (mode === 'plan'
    ? '\nPLAN MODE IS ACTIVE: do NOT call any tools. Instead, reply with a short numbered plan of ' +
      'what you would do — which specialists you would spawn and what each would be asked. ' +
      'End by asking the writer to switch modes or say "go" to execute.\n'
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
      const result = (await graph.invoke(
        {
          messages: [new SystemMessage(definition.systemPrompt), new HumanMessage(spawn.task)]
        },
        { recursionLimit, signal } as never
      )) as { messages: BaseMessage[] }
      const last = result.messages[result.messages.length - 1]
      const content =
        typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
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
      .addNode('supervisor', async(state, config) => {
        const messages = [
          new SystemMessage(buildSupervisorPrompt(mode, budget.maxWorkersPerWave)),
          ...state.messages
        ]
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
      .addEdge(START, 'supervisor')
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
        'PLAN MODE: sub-agents cannot be spawned. Present your plan to the writer as a ' +
        'numbered list instead, and ask them to approve or switch modes.'
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

  /** Supervisor step ceiling: each wave costs 2 steps (supervisor + actions). */
  recursionLimit(): number {
    const budget = MODE_BUDGETS[this._mode]
    return Math.max(6, budget.maxWaves * 2 + 6)
  }

  static isKnownRole(role: string): boolean {
    return isAgentRole(role)
  }

  static logBudgets(): void {
    log.debug('[orchestrator] budgets:', MODE_BUDGETS)
  }
}
