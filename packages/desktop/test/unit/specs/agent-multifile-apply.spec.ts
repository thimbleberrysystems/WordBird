import { describe, it, expect, vi } from 'vitest'
import {
  planMultiFileApply,
  applyAllPendingEdits,
  editDiskPath
} from '../../../src/renderer/src/services/agentMultiFileApply'
import type { AgentEditReview } from '../../../src/renderer/src/store/agent'

function edit(overrides: Partial<AgentEditReview>): AgentEditReview {
  return {
    id: 'e',
    filePath: 'rel.md',
    originalPath: '/abs/rel.md',
    newContent: 'new',
    oldContent: 'old',
    diff: '',
    status: 'pending',
    ...overrides
  } as AgentEditReview
}

describe('editDiskPath', () => {
  it('prefers the absolute originalPath', () => {
    expect(editDiskPath(edit({ originalPath: '/abs/a.md', filePath: 'a.md' }))).toBe('/abs/a.md')
  })
  it('falls back to filePath when originalPath is empty', () => {
    expect(editDiskPath(edit({ originalPath: '', filePath: 'a.md' }))).toBe('a.md')
  })
})

describe('planMultiFileApply', () => {
  it('routes the open file to currentEdit and the rest to disk', () => {
    const edits = [
      edit({ id: 'a', originalPath: '/p/a.md' }),
      edit({ id: 'b', originalPath: '/p/b.md' }),
      edit({ id: 'c', originalPath: '/p/c.md' })
    ]
    const plan = planMultiFileApply(edits, '/p/b.md')
    expect(plan.currentEdit?.id).toBe('b')
    expect(plan.diskEdits.map((e) => e.id)).toEqual(['a', 'c'])
    expect(plan.unresolved).toEqual([])
  })

  it('writes everything to disk when no file is open', () => {
    const edits = [edit({ id: 'a', originalPath: '/p/a.md' }), edit({ id: 'b', originalPath: '/p/b.md' })]
    const plan = planMultiFileApply(edits, null)
    expect(plan.currentEdit).toBeNull()
    expect(plan.diskEdits.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('matches the open file by basename when separators differ', () => {
    const plan = planMultiFileApply([edit({ id: 'a', originalPath: '/proj/notes/a.md' })], 'a.md')
    expect(plan.currentEdit?.id).toBe('a')
  })

  it('ignores non-pending edits', () => {
    const edits = [
      edit({ id: 'a', status: 'applied', originalPath: '/p/a.md' }),
      edit({ id: 'b', status: 'pending', originalPath: '/p/b.md' })
    ]
    const plan = planMultiFileApply(edits, null)
    expect(plan.diskEdits.map((e) => e.id)).toEqual(['b'])
  })

  it('reports edits with no path as unresolved', () => {
    const plan = planMultiFileApply([edit({ id: 'x', originalPath: '', filePath: '' })], null)
    expect(plan.unresolved.map((e) => e.id)).toEqual(['x'])
  })
})

describe('applyAllPendingEdits', () => {
  it('applies the open file via editor and writes the others to disk', async() => {
    const applyCurrent = vi.fn()
    const writeToDisk = vi.fn().mockResolvedValue({ ok: true })
    const markApplied = vi.fn()

    const edits = [
      edit({ id: 'a', originalPath: '/p/a.md', newContent: 'A' }),
      edit({ id: 'b', originalPath: '/p/b.md', newContent: 'B' }),
      edit({ id: 'c', originalPath: '/p/c.md', newContent: 'C' })
    ]

    const res = await applyAllPendingEdits(edits, '/p/b.md', {
      applyCurrent,
      writeToDisk,
      markApplied
    })

    expect(applyCurrent).toHaveBeenCalledOnce()
    expect(applyCurrent).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    expect(writeToDisk).toHaveBeenCalledTimes(2)
    expect(writeToDisk).toHaveBeenCalledWith('/p/a.md', 'A')
    expect(writeToDisk).toHaveBeenCalledWith('/p/c.md', 'C')
    expect(markApplied).toHaveBeenCalledTimes(3)
    expect(res.applied).toBe(3)
    expect(res.failed).toEqual([])
  })

  it('reports disk write failures without marking them applied', async() => {
    const markApplied = vi.fn()
    const writeToDisk = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'EACCES' })
      .mockResolvedValueOnce({ ok: true })

    const edits = [
      edit({ id: 'a', originalPath: '/p/a.md' }),
      edit({ id: 'b', originalPath: '/p/b.md' })
    ]

    const res = await applyAllPendingEdits(edits, null, {
      applyCurrent: vi.fn(),
      writeToDisk,
      markApplied
    })

    expect(res.applied).toBe(1)
    expect(res.failed).toEqual([{ id: 'a', path: '/p/a.md', error: 'EACCES' }])
    expect(markApplied).toHaveBeenCalledOnce()
    expect(markApplied).toHaveBeenCalledWith('b')
  })

  it('captures thrown errors from the disk writer', async() => {
    const res = await applyAllPendingEdits([edit({ id: 'a', originalPath: '/p/a.md' })], null, {
      applyCurrent: vi.fn(),
      writeToDisk: vi.fn().mockRejectedValue(new Error('disk gone')),
      markApplied: vi.fn()
    })
    expect(res.applied).toBe(0)
    expect(res.failed[0]).toMatchObject({ id: 'a', error: 'disk gone' })
  })
})
