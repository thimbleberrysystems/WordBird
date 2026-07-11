import { describe, it, expect, beforeEach } from 'vitest'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import {
  Orchestrator,
  splitForCompaction,
  historyChars,
  COMPACT_MARKER
} from '../../../src/main/services/ai/orchestrator/Orchestrator'
import type { IContextUsage } from '../../../src/shared/types/langgraph'

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

let usages: IContextUsage[]

const makeOrchestrator = (model: ScriptedModel, saver?: MemorySaver): Orchestrator => {
  const orchestrator = new Orchestrator({
    modelFactory: () => model as never,
    tools: [],
    callbacks: {
      emitActivity: () => {},
      requestApproval: async() => true,
      emitContextUsage: (usage) => usages.push(usage)
    },
    checkpointer: saver
  })
  orchestrator.setMode('auto')
  return orchestrator
}

beforeEach(() => {
  usages = []
})

describe('splitForCompaction', () => {
  it('returns null when everything fits in the retained tail', () => {
    const messages = [new HumanMessage('short'), new AIMessage('reply')]
    expect(splitForCompaction(messages, 1000)).toBeNull()
  })

  it('splits old from tail and keeps the tail off tool results', () => {
    const messages = [
      new HumanMessage('a'.repeat(3000)),
      new AIMessage({ content: '', tool_calls: [{ id: 't', name: 'x', args: {} }] }),
      new ToolMessage({ content: 'b'.repeat(3000), tool_call_id: 't' }),
      new AIMessage('c'.repeat(100)),
      new HumanMessage('d'.repeat(100))
    ]
    const split = splitForCompaction(messages, 300)
    expect(split).not.toBeNull()
    expect(split!.tail[0]).not.toBeInstanceOf(ToolMessage)
    expect(split!.old.length + split!.tail.length).toBe(messages.length)
    expect(historyChars(split!.old)).toBeGreaterThan(historyChars(split!.tail))
  })
})

describe('Orchestrator compaction', () => {
  it('reports context usage on every turn without compacting when small', async() => {
    const model = new ScriptedModel([new AIMessage('hello there')])
    const graph = makeOrchestrator(model, new MemorySaver()).buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 't1' }, recursionLimit: 10 }
    )
    expect(usages.length).toBeGreaterThan(0)
    expect(usages[0].compacting).toBe(false)
    expect(usages[0].ratio).toBeLessThan(0.1)
    // No summarization call happened: only the supervisor reply.
    expect(model.calls).toHaveLength(1)
  })

  it('durably compacts a bloated thread into [summary, ...tail]', async() => {
    const saver = new MemorySaver()
    const model = new ScriptedModel([
      // call 1: the compaction summarizer
      new AIMessage('Decisions: renamed Elara to Sera. Pending: draft ch2.'),
      // call 2: the supervisor answering the new user turn
      new AIMessage('Picking up where we left off.')
    ])
    const orchestrator = makeOrchestrator(model, saver)
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
      getState: (c: unknown) => Promise<{ values: { messages: BaseMessage[] } }>
    }
    const config = { configurable: { thread_id: 'big' }, recursionLimit: 10 }

    // Seed a thread well over the 80% trigger (budget 60k chars): many
    // sizeable turns, each small enough to survive per-message clipping.
    const bloat: BaseMessage[] = []
    for (let i = 0; i < 10; i++) {
      bloat.push(new HumanMessage(`turn ${i}: ` + 'x'.repeat(6000)))
      bloat.push(new AIMessage(`reply ${i}: ` + 'y'.repeat(1000)))
    }
    const result = await graph.invoke(
      { messages: [...bloat, new HumanMessage('what were we doing?')] },
      config
    )

    // The persisted thread was rewritten: summary marker first, tail after.
    const state = await graph.getState(config)
    const persisted = state.values.messages
    expect(String(persisted[0].content)).toContain(COMPACT_MARKER)
    expect(String(persisted[0].content)).toContain('renamed Elara')
    expect(persisted.length).toBeLessThan(bloat.length)
    expect(historyChars(persisted)).toBeLessThan(historyChars(bloat))

    // Both model calls happened: summarizer then supervisor.
    expect(model.calls).toHaveLength(2)
    // The usage feed marked the compaction and then the relief.
    expect(usages.some((u) => u.compacting)).toBe(true)
    const last = usages[usages.length - 1]
    expect(last.compacting).toBe(false)

    // The final reply still came through.
    const final = result.messages[result.messages.length - 1]
    expect(String(final.content)).toContain('Picking up')
  })

  it('falls back to trimming when the summarizer fails', async() => {
    const saver = new MemorySaver()
    const failing = {
      bindTools() {
        return this
      },
      calls: 0,
      async invoke() {
        this.calls += 1
        if (this.calls === 1) throw new Error('summarizer down')
        return new AIMessage('answered anyway')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => failing as never,
      tools: [],
      callbacks: {
        emitActivity: () => {},
        requestApproval: async() => true,
        emitContextUsage: (usage) => usages.push(usage)
      },
      checkpointer: saver
    })
    orchestrator.setMode('auto')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
    }

    const bloat: BaseMessage[] = []
    for (let i = 0; i < 10; i++) {
      bloat.push(new HumanMessage('x'.repeat(7000)))
    }
    const result = await graph.invoke(
      { messages: [...bloat, new HumanMessage('still there?')] },
      { configurable: { thread_id: 'fail' }, recursionLimit: 10 }
    )
    const final = result.messages[result.messages.length - 1]
    expect(String(final.content)).toContain('answered anyway')
  })
})
