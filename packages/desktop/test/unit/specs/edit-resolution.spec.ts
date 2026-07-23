/**
 * P0.1 — the acceptance feedback loop: proposals are tracked, the writer's
 * accept/reject decisions become a review note for the next model turn, the
 * brief carries review status, and the queue survives a restart.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { EditResolutionTracker } from '../../../src/main/services/ai/EditResolutionTracker'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import type { IAgentEditProposalPayload } from '../../../src/shared/types/langgraph'

let dir: string
let tracker: EditResolutionTracker

const proposal = (id: string, filePath: string): IAgentEditProposalPayload => ({
  edit: { id, filePath, newContent: 'new text' },
  oldContent: 'old text',
  originalPath: filePath
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-editres-'))
  tracker = new EditResolutionTracker(() => dir)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('EditResolutionTracker', () => {
  it('tracks proposals per thread and resolves them out of the queue', () => {
    tracker.recordProposal(proposal('e1', 'manuscript/ch1/opening.md'), 'thread-a')
    tracker.recordProposal(proposal('e2', 'bible/hero.md'), 'thread-a')
    expect(tracker.pendingCount()).toBe(2)
    expect(tracker.pendingForThread('thread-a')).toHaveLength(2)
    expect(tracker.pendingForThread('thread-b')).toHaveLength(0)

    tracker.resolve({ id: 'e1', filePath: 'manuscript/ch1/opening.md', accepted: true })
    expect(tracker.pendingCount()).toBe(1)
    expect(tracker.pendingForThread('thread-a')[0].edit.id).toBe('e2')
  })

  it('re-emitted proposal ids replace their earlier entry', () => {
    tracker.recordProposal(proposal('e1', 'a.md'), 't')
    tracker.recordProposal(proposal('e1', 'a.md'), 't')
    expect(tracker.pendingCount()).toBe(1)
  })

  it('wasResolved distinguishes an already-resolved id from a never-seen one', () => {
    // The apply route relies on this: a resolved id = benign duplicate apply
    // (the file is on disk); a never-recorded id = a genuine unknown to report.
    tracker.recordProposal(proposal('e1', 'a.md'), 't')
    expect(tracker.wasResolved('e1')).toBe(false) // pending, not yet resolved
    expect(tracker.wasResolved('never')).toBe(false) // never recorded

    tracker.resolve({ id: 'e1', filePath: 'a.md', accepted: true })
    expect(tracker.wasResolved('e1')).toBe(true) // now resolved → benign
    expect(tracker.wasResolved('never')).toBe(false) // still unknown → error
  })

  it('drains a review note naming accepted and rejected files, exactly once', () => {
    tracker.recordProposal(proposal('e1', 'manuscript/ch1/opening.md'), 't')
    tracker.recordProposal(proposal('e2', 'manuscript/ch1/opening.md'), 't')
    tracker.recordProposal(proposal('e3', 'bible/hero.md'), 't')
    tracker.resolve({ id: 'e1', filePath: 'manuscript/ch1/opening.md', accepted: true })
    tracker.resolve({ id: 'e2', filePath: 'manuscript/ch1/opening.md', accepted: true })
    tracker.resolve({ id: 'e3', filePath: 'bible/hero.md', accepted: false })

    const note = tracker.drainNote()
    expect(note).toBeTruthy()
    expect(note).toContain('[EDIT REVIEW')
    expect(note).toContain('ACCEPTED')
    expect(note).toContain('opening.md (×2)')
    expect(note).toContain('REJECTED')
    expect(note).toContain('hero.md')
    expect(note).toContain('do not assume this content exists')

    // Already reported — nothing new to say.
    expect(tracker.drainNote()).toBeNull()
  })

  it('persists the pending queue across a restart (flush + new instance)', () => {
    tracker.recordProposal(proposal('e1', 'a.md'), 'thread-a')
    tracker.flush()

    const reborn = new EditResolutionTracker(() => dir)
    const pending = reborn.pendingForThread('thread-a')
    expect(pending).toHaveLength(1)
    expect(pending[0].edit.newContent).toBe('new text')
  })

  it('clearPending drops the queue but keeps the resolution history', () => {
    tracker.recordProposal(proposal('e1', 'a.md'), 't')
    tracker.resolve({ id: 'e0', filePath: 'b.md', accepted: false })
    tracker.clearPending()
    expect(tracker.pendingCount()).toBe(0)
    expect(tracker.drainNote()).toContain('b.md')
  })

  it('briefSummary reports recent outcomes and edits still awaiting review', () => {
    expect(tracker.briefSummary()).toBe('')
    tracker.recordProposal(proposal('e1', 'a.md'), 't')
    tracker.resolve({ id: 'e0', filePath: 'b.md', accepted: true })
    const summary = tracker.briefSummary()
    expect(summary).toContain('1 accepted / 0 rejected')
    expect(summary).toContain('1 edit still awaiting')
    expect(summary).toContain('do NOT assume')
  })
})

describe('supervisor prompt carries the review-loop contract', () => {
  it('teaches review outcomes: aftercare on accept, no silent re-proposals', async() => {
    const model = {
      calls: [] as BaseMessage[][],
      bindTools() {
        return this
      },
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        this.calls.push(messages)
        return new AIMessage('ok')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode('approvals')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'rev1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('REVIEW OUTCOMES')
    expect(system).toContain('[EDIT REVIEW]')
    expect(system).toContain('aftercare only for ACCEPTED')
    expect(system).toContain('do not silently re-propose')
  })
})
