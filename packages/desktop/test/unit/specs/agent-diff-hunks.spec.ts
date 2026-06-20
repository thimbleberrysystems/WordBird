import { describe, it, expect } from 'vitest'
import {
  computeDiffSegments,
  buildHunks,
  reconstructContent,
  countHunks,
  acceptHunk,
  discardHunk
} from '../../../src/renderer/src/services/agentDiffHunks'

describe('computeDiffSegments', () => {
  it('returns a single equal segment when nothing changed', () => {
    const segs = computeDiffSegments('A\nB\nC', 'A\nB\nC')
    expect(segs).toHaveLength(1)
    expect(segs[0].type).toBe('equal')
  })

  it('splits a single-line change into equal/change/equal', () => {
    const segs = computeDiffSegments('A\nB\nC', 'A\nB2\nC')
    expect(segs.map((s) => s.type)).toEqual(['equal', 'change', 'equal'])
    const change = segs[1]
    expect(change.oldLines).toEqual(['B'])
    expect(change.newLines).toEqual(['B2'])
  })

  it('produces two change segments for two separate edits', () => {
    const segs = computeDiffSegments('A\nB\nC\nD\nE', 'A\nB2\nC\nD2\nE')
    expect(segs.filter((s) => s.type === 'change')).toHaveLength(2)
  })
})

describe('countHunks', () => {
  it('counts the number of distinct changed regions', () => {
    expect(countHunks('A\nB\nC', 'A\nB\nC')).toBe(0)
    expect(countHunks('A\nB\nC', 'A\nB2\nC')).toBe(1)
    expect(countHunks('A\nB\nC\nD\nE', 'A\nB2\nC\nD2\nE')).toBe(2)
  })
})

describe('buildHunks', () => {
  it('builds one hunk per change with context lines', () => {
    const segs = computeDiffSegments('A\nB\nC', 'A\nB2\nC')
    const hunks = buildHunks(segs)
    expect(hunks).toHaveLength(1)
    const types = hunks[0].lines.map((l) => l.type)
    expect(types).toContain('removed')
    expect(types).toContain('added')
    expect(types).toContain('equal') // context A and C
  })

  it('assigns sequential hunkIndex values', () => {
    const segs = computeDiffSegments('A\nB\nC\nD\nE', 'A\nB2\nC\nD2\nE')
    const hunks = buildHunks(segs)
    expect(hunks.map((h) => h.hunkIndex)).toEqual([0, 1])
  })

  it('limits context to the requested number of lines', () => {
    const oldC = 'c1\nc2\nc3\nc4\nc5\nTARGET\nc6\nc7\nc8\nc9'
    const newC = oldC.replace('TARGET', 'CHANGED')
    const hunks = buildHunks(computeDiffSegments(oldC, newC), 2)
    const equalCount = hunks[0].lines.filter((l) => l.type === 'equal').length
    expect(equalCount).toBeLessThanOrEqual(4) // 2 before + 2 after
  })
})

describe('reconstructContent', () => {
  const oldC = 'A\nB\nC\nD\nE'
  const newC = 'A\nB2\nC\nD2\nE'
  const segs = computeDiffSegments(oldC, newC)
  // change segment indices in [equal, change, equal, change, equal]
  const changeIndices = segs
    .map((s, i) => (s.type === 'change' ? i : -1))
    .filter((i) => i >= 0)

  it('returns the original when no hunk is accepted', () => {
    expect(reconstructContent(segs, new Set())).toBe(oldC)
  })

  it('returns the full new content when every hunk is accepted', () => {
    expect(reconstructContent(segs, new Set(changeIndices))).toBe(newC)
  })

  it('applies only the first hunk when only it is accepted', () => {
    expect(reconstructContent(segs, new Set([changeIndices[0]]))).toBe('A\nB2\nC\nD\nE')
  })

  it('applies only the second hunk when only it is accepted', () => {
    expect(reconstructContent(segs, new Set([changeIndices[1]]))).toBe('A\nB\nC\nD2\nE')
  })

  it('round-trips a pure addition', () => {
    const o = 'one\ntwo'
    const n = 'one\ninserted\ntwo'
    const s = computeDiffSegments(o, n)
    const ci = s.map((seg, i) => (seg.type === 'change' ? i : -1)).filter((i) => i >= 0)
    expect(reconstructContent(s, new Set())).toBe(o)
    expect(reconstructContent(s, new Set(ci))).toBe(n)
  })

  it('round-trips a pure deletion', () => {
    const o = 'keep\ndrop\nkeep2'
    const n = 'keep\nkeep2'
    const s = computeDiffSegments(o, n)
    const ci = s.map((seg, i) => (seg.type === 'change' ? i : -1)).filter((i) => i >= 0)
    expect(reconstructContent(s, new Set())).toBe(o)
    expect(reconstructContent(s, new Set(ci))).toBe(n)
  })
})

describe('acceptHunk / discardHunk transitions', () => {
  const base = 'A\nB\nC\nD\nE'
  const target = 'A\nB2\nC\nD2\nE'

  it('accepting the first hunk advances base by just that change', () => {
    const next = acceptHunk(base, target, 0)
    expect(next.base).toBe('A\nB2\nC\nD\nE') // only first change applied
    expect(next.target).toBe(target) // target unchanged
    // one hunk left
    expect(countHunks(next.base, next.target)).toBe(1)
  })

  it('accepting both hunks one at a time ends with base === target', () => {
    let state = acceptHunk(base, target, 0)
    // after first accept, the remaining hunk is index 0 again
    state = acceptHunk(state.base, state.target, 0)
    expect(state.base).toBe(target)
    expect(countHunks(state.base, state.target)).toBe(0)
  })

  it('discarding a hunk removes it from target without touching base', () => {
    const next = discardHunk(base, target, 0)
    expect(next.base).toBe(base) // file untouched
    expect(next.target).toBe('A\nB\nC\nD2\nE') // first change reverted, second kept
    expect(countHunks(next.base, next.target)).toBe(1)
  })

  it('discarding every hunk ends with base === target (no changes applied)', () => {
    let state = discardHunk(base, target, 0)
    state = discardHunk(state.base, state.target, 0)
    expect(state.base).toBe(base)
    expect(state.target).toBe(base)
    expect(countHunks(state.base, state.target)).toBe(0)
  })

  it('mixing accept and discard applies only the accepted hunk', () => {
    // discard hunk 0, then accept the remaining hunk (was hunk 1, now index 0)
    let state = discardHunk(base, target, 0)
    state = acceptHunk(state.base, state.target, 0)
    expect(state.base).toBe('A\nB\nC\nD2\nE') // only second change applied
    expect(state.base).toBe(state.target)
  })

  it('is a no-op for an out-of-range hunk index', () => {
    expect(acceptHunk(base, target, 9)).toEqual({ base, target })
    expect(discardHunk(base, target, 9)).toEqual({ base, target })
  })
})
