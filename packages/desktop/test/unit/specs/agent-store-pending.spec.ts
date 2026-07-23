import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAgentStore } from '../../../src/renderer/src/store/agent'
import type { IAgentEditProposal } from '@shared/types/langgraph'

// agentDiff -> diff package is fine in node; no DOM needed. But the store
// imports generateUnifiedDiff which uses the `diff` package only — safe.
vi.mock('../../../src/renderer/src/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

function proposal(id: string, newContent = 'new'): IAgentEditProposal {
  return {
    id,
    filePath: `/docs/${id}.md`,
    newContent,
    reason: 'because'
  } as IAgentEditProposal
}

describe('agent store pendingCount', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is zero with no edits', () => {
    expect(useAgentStore().pendingCount).toBe(0)
  })

  it('counts pending edits across multiple files', () => {
    const store = useAgentStore()
    store.addPendingEdit(proposal('a'), 'old a', '/docs/a.md')
    store.addPendingEdit(proposal('b'), 'old b', '/docs/b.md')
    expect(store.pendingCount).toBe(2)
  })

  it('excludes applied and rejected edits from the count', () => {
    const store = useAgentStore()
    store.addPendingEdit(proposal('a'), 'old a', '/docs/a.md')
    store.addPendingEdit(proposal('b'), 'old b', '/docs/b.md')
    store.addPendingEdit(proposal('c'), 'old c', '/docs/c.md')

    store.updateEditStatus('a', 'applied')
    store.updateEditStatus('b', 'rejected')

    expect(store.pendingCount).toBe(1)
  })

  it('drops to zero after clearing', () => {
    const store = useAgentStore()
    store.addPendingEdit(proposal('a'), 'old a', '/docs/a.md')
    expect(store.pendingCount).toBe(1)
    store.clearPendingEdits()
    expect(store.pendingCount).toBe(0)
  })

  it('pruneResolved drops applied/rejected edits but keeps a pending one', () => {
    // Auto-apply prunes instead of clearing so a proposal that arrives WHILE a
    // batch is being written is not wiped along with the batch (the lost-edit
    // race behind the prj3 report).
    const store = useAgentStore()
    store.addPendingEdit(proposal('a'), 'old a', '/docs/a.md')
    store.addPendingEdit(proposal('b'), 'old b', '/docs/b.md')
    store.addPendingEdit(proposal('c'), 'old c', '/docs/c.md')

    // The batch being applied resolves a and b; c arrived mid-run and is still
    // pending.
    store.updateEditStatus('a', 'applied')
    store.updateEditStatus('b', 'rejected')

    store.pruneResolved()

    // Only the still-pending c survives — a and b are gone, c is not lost.
    expect(store.pendingEdits.map((e) => e.id)).toEqual(['c'])
    expect(store.pendingCount).toBe(1)
  })
})
