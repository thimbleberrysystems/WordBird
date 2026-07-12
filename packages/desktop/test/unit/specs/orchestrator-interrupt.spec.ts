import { describe, it, expect } from 'vitest'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import {
  Orchestrator,
  PauseGate,
  repairDanglingToolCalls,
  INTERRUPTED_TOOL_NOTE,
  COMPACT_MARKER,
  historyChars
} from '../../../src/main/services/ai/orchestrator/Orchestrator'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('repairDanglingToolCalls', () => {
  it('is a no-op on a clean thread', () => {
    const messages = [
      new HumanMessage('hi'),
      new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'x', args: {} }] }),
      new ToolMessage({ content: 'ok', tool_call_id: 't1' }),
      new AIMessage('done')
    ]
    const result = repairDanglingToolCalls(messages)
    expect(result.repaired).toBe(0)
    expect(result.messages).toHaveLength(4)
  })

  it('repairs a dangling tail call (the Stop-mid-wave case)', () => {
    const messages = [
      new HumanMessage('remove Marcus'),
      new AIMessage({ content: '', tool_calls: [{ id: 'spawn-1', name: 'spawn_agents', args: {} }] })
      // aborted before the actions superstep committed — no ToolMessage
    ]
    const result = repairDanglingToolCalls(messages)
    expect(result.repaired).toBe(1)
    const last = result.messages[result.messages.length - 1] as ToolMessage
    expect(last).toBeInstanceOf(ToolMessage)
    expect(last.tool_call_id).toBe('spawn-1')
    expect(String(last.content)).toBe(INTERRUPTED_TOOL_NOTE)
  })

  it('repairs partially answered parallel calls, inserting after real results', () => {
    const messages = [
      new AIMessage({
        content: '',
        tool_calls: [
          { id: 'a', name: 'x', args: {} },
          { id: 'b', name: 'y', args: {} }
        ]
      }),
      new ToolMessage({ content: 'a done', tool_call_id: 'a' }),
      new HumanMessage('next question')
    ]
    const result = repairDanglingToolCalls(messages)
    expect(result.repaired).toBe(1)
    // Order: AIMessage, real result a, synthetic b, then the human turn.
    expect(result.messages.map((m) => m.getType())).toEqual(['ai', 'tool', 'tool', 'human'])
    expect((result.messages[2] as ToolMessage).tool_call_id).toBe('b')
  })

  it('repairs orphans mid-history, not just the tail', () => {
    const messages = [
      new AIMessage({ content: '', tool_calls: [{ id: 'old', name: 'x', args: {} }] }),
      new HumanMessage('a later turn'),
      new AIMessage('a later reply')
    ]
    const result = repairDanglingToolCalls(messages)
    expect(result.repaired).toBe(1)
    expect(result.messages.map((m) => m.getType())).toEqual(['ai', 'tool', 'human', 'ai'])
  })
})

describe('PauseGate', () => {
  it('passes through when not paused and blocks until resume when paused', async() => {
    const gate = new PauseGate()
    await gate.wait() // immediate

    gate.pause()
    let released = false
    const waiting = gate.wait().then(() => {
      released = true
    })
    await sleep(30)
    expect(released).toBe(false)

    gate.resume()
    await waiting
    expect(released).toBe(true)
  })

  it('rejects promptly on abort while paused (Stop beats Pause)', async() => {
    const gate = new PauseGate()
    gate.pause()
    const controller = new AbortController()
    const waiting = gate.wait(controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow(/Aborted while paused/)
  })
})

// ---- Graph-level integration -------------------------------------------

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
    return this.responses.shift() ?? new AIMessage('script exhausted')
  }
}

const makeOrchestrator = (
  model: ScriptedModel,
  saver?: MemorySaver,
  drainSteering?: () => string[]
): Orchestrator => {
  const orchestrator = new Orchestrator({
    modelFactory: () => model as never,
    tools: [],
    callbacks: {
      emitActivity: () => {},
      requestApproval: async() => true,
      drainSteering
    },
    checkpointer: saver
  })
  orchestrator.setMode('auto')
  return orchestrator
}

type InvokableGraph = {
  invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
  getState: (c: unknown) => Promise<{ values: { messages: BaseMessage[] } }>
}

describe('interrupted-thread recovery through the graph', () => {
  it('a thread corrupted by Stop is repaired on the next turn (no dangling tool_use)', async() => {
    const saver = new MemorySaver()
    const model = new ScriptedModel([new AIMessage('picking up where we left off')])
    const orchestrator = makeOrchestrator(model, saver)
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph
    const config = { configurable: { thread_id: 'crashed' }, recursionLimit: 12 }

    // Simulate the corrupted state a mid-wave Stop leaves behind.
    const seeded = [
      new HumanMessage('sweep the manuscript'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'spawn-x', name: 'spawn_agents', args: { agents: [] } }]
      })
    ]

    const result = await graph.invoke(
      { messages: [...seeded, new HumanMessage('are you still there?')] },
      config
    )

    // The supervisor saw a legal thread: every tool_call answered.
    const supervisorInput = model.calls[0]
    const aiWithCalls = supervisorInput.filter(
      (m) => m instanceof AIMessage && (m as AIMessage).tool_calls?.length
    )
    for (const ai of aiWithCalls) {
      for (const call of (ai as AIMessage).tool_calls ?? []) {
        const answered = supervisorInput.some(
          (m) => m instanceof ToolMessage && (m as ToolMessage).tool_call_id === call.id
        )
        expect(answered, `call ${call.id} answered`).toBe(true)
      }
    }

    // The persisted thread is repaired too.
    const state = await graph.getState(config)
    const repairedNote = state.values.messages.find(
      (m) => m instanceof ToolMessage && String(m.content) === INTERRUPTED_TOOL_NOTE
    )
    expect(repairedNote).toBeDefined()

    const final = result.messages[result.messages.length - 1]
    expect(String(final.content)).toContain('picking up')
  })
})

describe('pause/resume through the graph', () => {
  it('holds progression at the next boundary and completes after resume', async() => {
    const model = new ScriptedModel([new AIMessage('answered after resume')])
    const orchestrator = makeOrchestrator(model, new MemorySaver())
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph

    orchestrator.pause()
    let settled = false
    const running = graph
      .invoke(
        { messages: [new HumanMessage('hello')] },
        { configurable: { thread_id: 'p1' }, recursionLimit: 12 }
      )
      .then((r) => {
        settled = true
        return r
      })

    await sleep(50)
    expect(settled).toBe(false)
    expect(model.calls).toHaveLength(0) // no tokens spent while paused

    orchestrator.resumeFromPause()
    const result = await running
    expect(settled).toBe(true)
    expect(String(result.messages[result.messages.length - 1].content)).toContain(
      'after resume'
    )
  })

  it('abort wins over pause: a paused turn rejects immediately on Stop', async() => {
    const model = new ScriptedModel([new AIMessage('never reached')])
    const orchestrator = makeOrchestrator(model, new MemorySaver())
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph

    orchestrator.pause()
    const controller = new AbortController()
    const running = graph.invoke(
      { messages: [new HumanMessage('hello')] },
      { configurable: { thread_id: 'p2' }, recursionLimit: 12, signal: controller.signal }
    )
    await sleep(20)
    controller.abort()
    await expect(running).rejects.toThrow()
    expect(model.calls).toHaveLength(0)
  })
})

describe('mid-run steering', () => {
  it('drained notes reach the model input and persist in the thread', async() => {
    const queue: string[] = ['actually make the tone darker']
    const model = new ScriptedModel([new AIMessage('noted — going darker')])
    const saver = new MemorySaver()
    const orchestrator = makeOrchestrator(model, saver, () => queue.splice(0))
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph
    const config = { configurable: { thread_id: 's1' }, recursionLimit: 12 }

    await graph.invoke({ messages: [new HumanMessage('draft the scene')] }, config)

    // Model saw the steering note appended after the original ask.
    const input = model.calls[0]
    const steeringIdx = input.findIndex((m) =>
      String(m.content).includes('[Writer, mid-run]: actually make the tone darker')
    )
    expect(steeringIdx).toBeGreaterThan(-1)
    expect(steeringIdx).toBeGreaterThan(
      input.findIndex((m) => String(m.content).includes('draft the scene'))
    )

    // And it persisted into the thread BEFORE the response.
    const state = await graph.getState(config)
    const persisted = state.values.messages.map((m) => String(m.content))
    const noteIdx = persisted.findIndex((c) => c.includes('[Writer, mid-run]'))
    const replyIdx = persisted.findIndex((c) => c.includes('going darker'))
    expect(noteIdx).toBeGreaterThan(-1)
    expect(noteIdx).toBeLessThan(replyIdx)
    expect(queue).toHaveLength(0)
  })
})

describe('per-agent pause/resume', () => {
  it('freezes one worker at its boundary; resume releases it to finish', async() => {
    let calls = 0
    const model = {
      bindTools() {
        return this
      },
      async invoke(): Promise<AIMessage> {
        calls += 1
        if (calls === 1) {
          return new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'w1',
                name: 'spawn_agents',
                args: { agents: [{ role: 'explorer', task: 'look around' }] }
              }
            ]
          })
        }
        if (calls === 2) return new AIMessage('worker findings')
        return new AIMessage('final answer')
      }
    }

    let pausedAgentId: string | null = null
    const orchestrator: Orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: {
        emitActivity: () => {},
        requestApproval: async() => true,
        emitAgentStatus: (status) => {
          // Freeze the worker the moment it registers as running.
          if (status.status === 'running' && !pausedAgentId) {
            pausedAgentId = status.agentId
            orchestrator.pauseAgent(status.agentId)
          }
        }
      }
    })
    orchestrator.setMode('auto')
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph

    const turn = graph.invoke(
      { messages: [new HumanMessage('go')] },
      { configurable: { thread_id: 'pa1' }, recursionLimit: 12 }
    )

    // The worker's own gate holds it before its first model call.
    await sleep(40)
    expect(calls).toBe(1)
    expect(pausedAgentId).not.toBeNull()

    expect(orchestrator.resumeAgent(pausedAgentId as unknown as string)).toBe(true)
    const result = await turn
    const toolMsg = result.messages.find((m) => m.getType() === 'tool')
    expect(String(toolMsg?.content)).toContain('worker findings')
  })

  it('returns false for unknown agent ids', () => {
    const orchestrator = makeOrchestrator(new ScriptedModel([]))
    expect(orchestrator.pauseAgent('nope')).toBe(false)
    expect(orchestrator.resumeAgent('nope')).toBe(false)
  })
})

describe('supervisor step budget', () => {
  it('every mode leaves headroom for direct tool rounds (plan mode included)', () => {
    const orchestrator = makeOrchestrator(new ScriptedModel([]))
    for (const mode of ['ask', 'approvals', 'auto'] as const) {
      orchestrator.setMode(mode)
      expect(orchestrator.recursionLimit(), mode).toBeGreaterThanOrEqual(24)
    }
  })
})

describe('in-wave worker resurrection', () => {
  const failingThenGoodModel = (approvalLog: string[], mode: 'auto' | 'approvals', approve: boolean) => {
    let calls = 0
    const model = {
      bindTools() {
        return this
      },
      async invoke(): Promise<AIMessage> {
        calls += 1
        if (calls === 1) {
          return new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'w1',
                name: 'spawn_agents',
                args: { agents: [{ role: 'explorer', task: 'find the letters' }] }
              }
            ]
          })
        }
        if (calls === 2) throw new Error('provider hiccup')
        if (calls === 3) return new AIMessage('second attempt worked')
        return new AIMessage('final answer')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: {
        emitActivity: () => {},
        requestApproval: async(req) => {
          approvalLog.push(req.summary)
          // Approve spawn waves; apply the scripted decision only to retries.
          if (!req.summary.includes('failed and can be retried')) return true
          return approve
        }
      }
    })
    orchestrator.setMode(mode)
    return orchestrator
  }

  it('auto mode retries a failed worker once, inside the wave', async() => {
    const approvals: string[] = []
    const orchestrator = failingThenGoodModel(approvals, 'auto', true)
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph
    const result = await graph.invoke(
      { messages: [new HumanMessage('go')] },
      { configurable: { thread_id: 'r1' }, recursionLimit: 12 }
    )
    const toolMsg = result.messages.find((m) => m.getType() === 'tool')
    expect(String(toolMsg?.content)).toContain('second attempt worked')
    // Auto mode never asks.
    expect(approvals).toHaveLength(0)
  })

  it('approvals mode retries automatically too — no approval card involved', async() => {
    const approvals: string[] = []
    const orchestrator = failingThenGoodModel(approvals, 'approvals', true)
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph
    const result = await graph.invoke(
      { messages: [new HumanMessage('go')] },
      { configurable: { thread_id: 'r2' }, recursionLimit: 12 }
    )
    expect(approvals).toHaveLength(0)
    const toolMsg = result.messages.find((m) => m.getType() === 'tool')
    expect(String(toolMsg?.content)).toContain('second attempt worked')
  })
})

describe('manual compactThread', () => {
  it('condenses an idle thread below the auto threshold via updateState', async() => {
    const saver = new MemorySaver()
    const model = new ScriptedModel([
      new AIMessage('seeded'),
      // compactThread's summarizer call
      new AIMessage('Summary: much was discussed.')
    ])
    const orchestrator = makeOrchestrator(model, saver)
    const graph = orchestrator.buildGraph() as unknown as InvokableGraph
    const config = { configurable: { thread_id: 'c1' }, recursionLimit: 12 }

    // Seed ~28k chars: UNDER the 48k auto-compaction trigger (so seeding
    // does not compact) but over the 24k retained tail (so the manual
    // trigger has old material to condense).
    const bloat: BaseMessage[] = []
    for (let i = 0; i < 4; i++) {
      bloat.push(new HumanMessage(`turn ${i}: ` + 'x'.repeat(6000)))
      bloat.push(new AIMessage(`reply ${i}: ` + 'y'.repeat(1000)))
    }
    await graph.invoke({ messages: bloat }, config)

    const before = await graph.getState(config)
    expect(before.values.messages.some((m) => String(m.content).includes(COMPACT_MARKER))).toBe(
      false
    )

    const result = await orchestrator.compactThread(graph as never, 'c1')
    expect(result.compacted).toBe(true)

    const after = await graph.getState(config)
    expect(historyChars(after.values.messages)).toBeLessThan(
      historyChars(before.values.messages)
    )
    expect(String(after.values.messages[0].content)).toContain(COMPACT_MARKER)
    // The tail (most recent messages) survives verbatim.
    const last = after.values.messages[after.values.messages.length - 1]
    expect(String(last.content)).toBe('seeded')
  })
})
