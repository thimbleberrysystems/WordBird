/**
 * P0.3 — model-aware context budgeting: budgets derive from the connected
 * model's context window, compaction triggers on the provider-reported
 * prompt size (not just the chars/4 estimate), and the emitted usage event
 * carries real token numbers for the context ring.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { Orchestrator, COMPACT_MARKER } from '../../../src/main/services/ai/orchestrator/Orchestrator'
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

describe('setContextBudget', () => {
  it('derives budgets from the model window (200k model gets real room)', () => {
    const orchestrator = makeOrchestrator(new ScriptedModel([]))
    orchestrator.setContextBudget(200000, 2048)
    const budget = orchestrator.contextBudget
    expect(budget.contextWindow).toBe(200000)
    expect(budget.usableInputTokens).toBe(200000 - 2048 - 8000)
    // ~13× the legacy 60k-char budget.
    expect(budget.historyCharBudget).toBeGreaterThan(400000)
  })

  it('clamps small local models instead of overflowing them', () => {
    const orchestrator = makeOrchestrator(new ScriptedModel([]))
    orchestrator.setContextBudget(8192, 2048)
    const budget = orchestrator.contextBudget
    // 8192 − 2048 − 8000 is negative — the floor keeps a workable minimum.
    expect(budget.usableInputTokens).toBe(4000)
    // History budget shrinks BELOW the legacy default — no overflow.
    expect(budget.historyCharBudget).toBeLessThan(60000)
  })

  it('ignores nonsense windows and keeps defaults', () => {
    const orchestrator = makeOrchestrator(new ScriptedModel([]))
    orchestrator.setContextBudget(-5, 2048)
    expect(orchestrator.contextBudget.contextWindow).toBe(0)
    expect(orchestrator.contextBudget.historyCharBudget).toBe(60000)
  })
})

describe('usage-driven compaction trigger', () => {
  const bigInput = (tokens: number): AIMessage =>
    new AIMessage({
      content: 'ok',
      usage_metadata: { input_tokens: tokens, output_tokens: 5, total_tokens: tokens + 5 }
    })

  it('compacts when the provider-reported prompt crosses 80% of usable input', async() => {
    // 30k chars: UNDER the 48k char trigger, but the provider says the real
    // prompt was 30k tokens — way over the default ~25k usable input.
    const model = new ScriptedModel([
      bigInput(30000),
      new AIMessage('a condensed summary of the earlier turns'),
      new AIMessage('second reply')
    ])
    const saver = new MemorySaver()
    const graph = makeOrchestrator(model, saver).buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
    }
    const config = { configurable: { thread_id: 'usage-trigger' }, recursionLimit: 10 }
    await graph.invoke({ messages: [new HumanMessage('x'.repeat(30000))] }, config)
    const result = await graph.invoke({ messages: [new HumanMessage('next')] }, config)

    expect(usages.some((u) => u.compacting)).toBe(true)
    const contents = result.messages.map((m) =>
      typeof m.content === 'string' ? m.content : ''
    )
    expect(contents.some((c) => c.startsWith(COMPACT_MARKER))).toBe(true)
  })

  it('does not compact the same thread when the reported prompt is small', async() => {
    const model = new ScriptedModel([
      bigInput(100),
      new AIMessage('second reply')
    ])
    const saver = new MemorySaver()
    const graph = makeOrchestrator(model, saver).buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
    }
    const config = { configurable: { thread_id: 'no-trigger' }, recursionLimit: 10 }
    await graph.invoke({ messages: [new HumanMessage('x'.repeat(30000))] }, config)
    await graph.invoke({ messages: [new HumanMessage('next')] }, config)
    expect(usages.every((u) => !u.compacting)).toBe(true)
    // Exactly two supervisor calls — no summarization call in between.
    expect(model.calls).toHaveLength(2)
  })

  it('a 200k-window model is NOT compacted at legacy thresholds', async() => {
    const model = new ScriptedModel([
      bigInput(30000),
      new AIMessage('second reply')
    ])
    const saver = new MemorySaver()
    const orchestrator = makeOrchestrator(model, saver)
    orchestrator.setContextBudget(200000, 2048)
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<{ messages: BaseMessage[] }>
    }
    const config = { configurable: { thread_id: 'big-window' }, recursionLimit: 10 }
    // 30k chars + 30k reported tokens: over the LEGACY triggers, far under
    // the real ones for a 200k model.
    await graph.invoke({ messages: [new HumanMessage('x'.repeat(30000))] }, config)
    await graph.invoke({ messages: [new HumanMessage('next')] }, config)
    expect(usages.every((u) => !u.compacting)).toBe(true)
    expect(model.calls).toHaveLength(2)
  })
})

describe('context ring gets honest numbers', () => {
  it('usage events carry tokens and the resolved window', async() => {
    const model = new ScriptedModel([
      new AIMessage({
        content: 'ok',
        usage_metadata: { input_tokens: 5000, output_tokens: 10, total_tokens: 5010 }
      }),
      new AIMessage('again')
    ])
    const saver = new MemorySaver()
    const orchestrator = makeOrchestrator(model, saver)
    orchestrator.setContextBudget(128000, 2048)
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    const config = { configurable: { thread_id: 'ring' }, recursionLimit: 10 }
    await graph.invoke({ messages: [new HumanMessage('hello')] }, config)
    await graph.invoke({ messages: [new HumanMessage('again')] }, config)

    const last = usages[usages.length - 1]
    expect(last.contextWindow).toBe(128000)
    expect(last.budgetTokens).toBe(128000 - 2048 - 8000)
    // The provider-reported 5000 replaces the chars/4 estimate.
    expect(last.usedTokens).toBe(5000)
    expect(last.budgetChars).not.toBe(60000)
  })
})
