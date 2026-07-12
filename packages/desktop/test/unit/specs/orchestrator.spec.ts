import { describe, it, expect, beforeEach } from 'vitest'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  Orchestrator,
  extractUsage,
  addToTally,
  emptyTally,
  previewArgs
} from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES, MODE_BUDGETS } from '../../../src/main/services/ai/orchestrator/roles'
import type {
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentStatus,
  ITokenUsageUpdate
} from '../../../src/shared/types/langgraph'

/**
 * A scripted stand-in for a chat model: returns the queued responses in
 * order. `bindTools` returns itself so supervisor and workers share the
 * same script within a test.
 */
class ScriptedModel {
  responses: AIMessage[]
  calls: BaseMessage[][] = []

  constructor(responses: AIMessage[]) {
    this.responses = responses
  }

  bindTools(): ScriptedModel {
    return this
  }

  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    this.calls.push(messages)
    const next = this.responses.shift()
    if (!next) return new AIMessage('done (script exhausted)')
    return next
  }
}

const spawnCall = (agents: Array<{ role: string; task: string }>): AIMessage =>
  new AIMessage({
    content: '',
    tool_calls: [{ id: 'call-1', name: 'spawn_agents', args: { agents } }]
  })

const echoTool = tool(async({ query }: { query: string }) => `echo:${query}`, {
  name: 'search_manuscript',
  description: 'test search tool',
  schema: z.object({ query: z.string() })
})

let activities: IAgentActivityEvent[]
let approvals: IAgentApprovalRequest[]
let approveNext: boolean
let usages: ITokenUsageUpdate[]
let agentStatuses: IAgentStatus[]

const makeOrchestrator = (model: ScriptedModel): Orchestrator =>
  new Orchestrator({
    modelFactory: () => model as never,
    tools: [echoTool as never],
    callbacks: {
      emitActivity: (e) => activities.push(e),
      requestApproval: async(req) => {
        approvals.push(req)
        return approveNext
      },
      emitTokenUsage: (u) => usages.push(u),
      emitAgentStatus: (s) => agentStatuses.push(s)
    }
  })

const invokeGraph = async(
  orchestrator: Orchestrator,
  text: string
): Promise<{ messages: BaseMessage[] }> => {
  const graph = orchestrator.buildGraph() as unknown as {
    invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
  }
  return graph.invoke(
    { messages: [new HumanMessage(text)] },
    { recursionLimit: orchestrator.recursionLimit() }
  )
}

beforeEach(() => {
  activities = []
  approvals = []
  approveNext = true
  usages = []
  agentStatuses = []
})

const withUsage = (message: AIMessage, input: number, output: number): AIMessage => {
  ;(message as unknown as { usage_metadata: unknown }).usage_metadata = {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output
  }
  return message
}

describe('roles catalog', () => {
  it('gives read-only tools to explorer and auditor, propose tools to drafter', () => {
    expect(AGENT_ROLES.explorer.allowedTools).not.toContain('propose_project_file_edit')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('log_continuity_issue')
    expect(AGENT_ROLES.drafter.allowedTools).toContain('propose_project_file_edit')
    expect(AGENT_ROLES.researcher.allowedTools).toContain('web_search')
  })

  it('scales budgets with autonomy', () => {
    expect(MODE_BUDGETS.plan.maxWorkersPerWave).toBe(0)
    expect(MODE_BUDGETS.ask.maxWorkersPerWave).toBeLessThan(MODE_BUDGETS.auto.maxWorkersPerWave)
    expect(MODE_BUDGETS.auto.maxWaves).toBeLessThan(MODE_BUDGETS['full-auto'].maxWaves)
  })
})

describe('Orchestrator', () => {
  it('answers directly when the supervisor never calls tools', async() => {
    const model = new ScriptedModel([new AIMessage('Just an answer.')])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('auto')

    const result = await invokeGraph(orchestrator, 'hi')
    const last = result.messages[result.messages.length - 1]
    expect(String(last.content)).toBe('Just an answer.')
  })

  it('spawns workers in auto mode and feeds results back to the supervisor', async() => {
    const model = new ScriptedModel([
      // supervisor wave 1: spawn one explorer
      spawnCall([{ role: 'explorer', task: 'Find every mention of rain.' }]),
      // worker run: answers directly (no tool calls)
      new AIMessage('Rain appears in scenes 1 and 3.'),
      // supervisor final answer
      new AIMessage('Rain shows up twice — scenes 1 and 3.')
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('auto')

    const result = await invokeGraph(orchestrator, 'where does rain appear?')
    const last = result.messages[result.messages.length - 1]
    expect(String(last.content)).toContain('twice')

    // The tool message fed to the supervisor contains the worker's report.
    const toolMsg = result.messages.find((m) => m.getType?.() === 'tool')
    expect(String(toolMsg?.content)).toContain('Rain appears in scenes 1 and 3')

    // Activity feed narrates the run.
    const kinds = activities.map((a) => a.kind)
    expect(kinds).toContain('spawn')
    expect(kinds).toContain('agent-start')
    expect(kinds).toContain('agent-done')
    expect(approvals).toHaveLength(0)
  })

  it('asks for approval in ask mode and respects a decline', async() => {
    approveNext = false
    const model = new ScriptedModel([
      spawnCall([{ role: 'researcher', task: 'Research 1880s telegraphy.' }]),
      new AIMessage('Understood — what would you like instead?')
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('ask')

    const result = await invokeGraph(orchestrator, 'research telegraphy')
    expect(approvals).toHaveLength(1)
    expect(approvals[0].spawns[0].role).toBe('researcher')

    const toolMsg = result.messages.find((m) => m.getType?.() === 'tool')
    expect(String(toolMsg?.content)).toContain('declined')
    // No worker ever started.
    expect(activities.some((a) => a.kind === 'agent-start')).toBe(false)
  })

  it('blocks spawning entirely in plan mode', async() => {
    const model = new ScriptedModel([new AIMessage('PLAN: 1. spawn researcher 2. draft')])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('plan')

    const result = await invokeGraph(orchestrator, 'draft chapter 2')
    const last = result.messages[result.messages.length - 1]
    expect(String(last.content)).toContain('PLAN')
    expect(approvals).toHaveLength(0)
    expect(activities.some((a) => a.kind === 'spawn')).toBe(false)
  })

  it('clamps a wave to the mode budget', async() => {
    const requested = Array.from({ length: 12 }, (_, i) => ({
      role: 'explorer',
      task: `task ${i}`
    }))
    const model = new ScriptedModel([
      spawnCall(requested),
      // 4 workers (ask budget) each answer immediately
      new AIMessage('r1'),
      new AIMessage('r2'),
      new AIMessage('r3'),
      new AIMessage('r4'),
      new AIMessage('final')
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('ask')
    approveNext = true

    const result = await invokeGraph(orchestrator, 'sweep the manuscript')
    expect(approvals[0].spawns).toHaveLength(MODE_BUDGETS.ask.maxWorkersPerWave)
    const spawnEvent = activities.find((a) => a.kind === 'spawn')
    expect(spawnEvent?.label).toContain(String(MODE_BUDGETS.ask.maxWorkersPerWave))
    const last = result.messages[result.messages.length - 1]
    expect(String(last.content)).toBe('final')
  })

  it('lets workers use their scoped tools', async() => {
    const model = new ScriptedModel([
      spawnCall([{ role: 'explorer', task: 'Search for Elara.' }]),
      // worker: calls search tool, then reports
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'w1', name: 'search_manuscript', args: { query: 'Elara' } }]
      }),
      new AIMessage('Found via search.'),
      new AIMessage('She appears in the opening.')
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('auto')

    await invokeGraph(orchestrator, 'find Elara')
    // The worker's tool call surfaced in the activity feed.
    expect(
      activities.some((a) => a.kind === 'tool' && a.label.includes('search_manuscript'))
    ).toBe(true)
  })

  it('tallies token usage per turn and session with a by-role breakdown', async() => {
    const model = new ScriptedModel([
      // supervisor: spawn one explorer (with usage)
      withUsage(spawnCall([{ role: 'explorer', task: 'look around' }]), 100, 20),
      // worker reply
      withUsage(new AIMessage('found things'), 50, 10),
      // supervisor final
      withUsage(new AIMessage('done'), 200, 30)
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('auto')
    await invokeGraph(orchestrator, 'sweep')

    const last = usages[usages.length - 1]
    expect(last.turn.inputTokens).toBe(350)
    expect(last.turn.outputTokens).toBe(60)
    expect(last.turn.calls).toBe(3)
    expect(last.turn.byRole.supervisor.calls).toBe(2)
    expect(last.turn.byRole.explorer.inputTokens).toBe(50)
    // Session mirrors the single turn here.
    expect(last.session.inputTokens).toBe(350)

    // A second turn resets the turn tally but grows the session.
    model.responses.push(withUsage(new AIMessage('again'), 40, 5))
    await invokeGraph(orchestrator, 'hi again')
    const final = usages[usages.length - 1]
    expect(final.turn.inputTokens).toBe(40)
    expect(final.session.inputTokens).toBe(390)

    orchestrator.resetSessionUsage()
    model.responses.push(withUsage(new AIMessage('fresh'), 7, 3))
    await invokeGraph(orchestrator, 'fresh start')
    expect(usages[usages.length - 1].session.inputTokens).toBe(7)
  })

  it('emits agent status lifecycle and supports cancelling one worker of a wave', async() => {
    // Two explorers spawn; worker A hangs long enough to be cancelled,
    // worker B answers quickly; the supervisor still gets both reports.
    let callCount = 0
    const model = {
      bindTools() {
        return this
      },
      async invoke(): Promise<AIMessage> {
        callCount += 1
        if (callCount === 1) {
          return spawnCall([
            { role: 'explorer', task: 'slow sweep' },
            { role: 'explorer', task: 'fast sweep' }
          ])
        }
        if (callCount === 2 || callCount === 3) {
          // Worker calls: first one to arrive sleeps, second returns fast.
          if (callCount === 2) {
            await new Promise((resolve) => setTimeout(resolve, 400))
            return new AIMessage('slow result')
          }
          return new AIMessage('fast result')
        }
        return new AIMessage('summary of both')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: {
        emitActivity: (e) => activities.push(e),
        requestApproval: async() => true,
        emitAgentStatus: (s) => agentStatuses.push(s)
      }
    })
    orchestrator.setMode('auto')

    // Cancel the slow agent shortly after it starts running.
    const cancelSoon = setInterval(() => {
      const running = agentStatuses.find(
        (s) => s.status === 'running' && s.task === 'slow sweep'
      )
      if (running) {
        clearInterval(cancelSoon)
        setTimeout(() => orchestrator.cancelAgent(running.agentId), 50)
      }
    }, 10)

    const result = await invokeGraph(orchestrator, 'sweep everything')
    clearInterval(cancelSoon)

    const final = result.messages[result.messages.length - 1]
    expect(String(final.content)).toBe('summary of both')

    // Lifecycle: both agents ran; one cancelled, one done.
    const settled = new Map(
      agentStatuses
        .filter((s) => s.status !== 'running')
        .map((s) => [s.task, s.status])
    )
    expect(settled.get('slow sweep')).toBe('cancelled')
    expect(settled.get('fast sweep')).toBe('done')

    // The supervisor's tool result reflects the cancellation.
    const toolMsg = result.messages.find((m) => m.getType?.() === 'tool')
    expect(String(toolMsg?.content)).toContain('cancelled by the writer')
    expect(String(toolMsg?.content)).toContain('fast result')
  })

  it('tally/preview helpers behave', () => {
    expect(extractUsage(new AIMessage('no usage'))).toBeNull()
    expect(extractUsage(withUsage(new AIMessage('x'), 5, 7))).toEqual({
      inputTokens: 5,
      outputTokens: 7
    })
    const tally = emptyTally()
    addToTally(tally, 'drafter', { inputTokens: 10, outputTokens: 2 })
    addToTally(tally, 'drafter', { inputTokens: 5, outputTokens: 1 })
    expect(tally).toMatchObject({ inputTokens: 15, outputTokens: 3, calls: 2 })
    expect(tally.byRole.drafter.calls).toBe(2)
    expect(previewArgs({ query: 'x'.repeat(200) }).length).toBeLessThanOrEqual(81)
  })

  it('reports an unknown-role spawn as invalid instead of crashing', async() => {
    const model = new ScriptedModel([
      spawnCall([{ role: 'wizard', task: 'Cast spells.' }]),
      new AIMessage('No valid agents, adjusting.')
    ])
    const orchestrator = makeOrchestrator(model)
    orchestrator.setMode('auto')

    const result = await invokeGraph(orchestrator, 'do magic')
    const toolMsg = result.messages.find((m) => m.getType?.() === 'tool')
    expect(String(toolMsg?.content)).toContain('No valid agents')
  })
})

describe('supervisor tool binding', () => {
  const namedTools = [
    'propose_new_unit',
    'propose_new_file',
    'propose_project_file_edit',
    'list_structure'
  ].map((name) =>
    tool(async() => 'ok', { name, description: name, schema: z.object({}) })
  )

  const buildAndCapture = (mode: 'plan' | 'ask' | 'auto'): string[] => {
    let bound: string[] = []
    const model = {
      bindTools(tools: Array<{ name: string }>) {
        bound = tools.map((t) => t.name)
        return this
      },
      async invoke(): Promise<AIMessage> {
        return new AIMessage('unused')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: namedTools as never,
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode(mode)
    orchestrator.buildGraph()
    return bound
  }

  it('binds review-gated write tools directly in execution modes', () => {
    for (const mode of ['ask', 'auto'] as const) {
      const bound = buildAndCapture(mode)
      expect(bound).toContain('spawn_agents')
      expect(bound).toContain('propose_new_unit')
      expect(bound).toContain('propose_new_file')
      expect(bound).toContain('propose_project_file_edit')
    }
  })

  it('plan mode binds NO write tools and no spawning — mechanically, not just by prompt', () => {
    const bound = buildAndCapture('plan')
    expect(bound).not.toContain('spawn_agents')
    expect(bound).not.toContain('propose_new_unit')
    expect(bound).not.toContain('propose_new_file')
    expect(bound).not.toContain('propose_project_file_edit')
    expect(bound).toContain('list_structure')
  })
})

describe('supervisor blueprint', () => {
  it('the supervisor system prompt carries conventions, playbooks, and spawn heuristics', async() => {
    const model = new ScriptedModel([new AIMessage('hello')])
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode('auto')
    await invokeGraph(orchestrator, 'hi')

    const system = String(model.calls[0][0].content)
    expect(system).toContain('PROJECT LAYOUT & CONVENTIONS')
    expect(system).toContain('PLAYBOOKS')
    expect(system).toContain('EMPTY / NEW PROJECT')
    expect(system).toContain('AFTERCARE')
    expect(system).toContain('SPAWN AGENTS')
  })
})
