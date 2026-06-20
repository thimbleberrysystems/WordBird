import { describe, it, expect } from 'vitest'
import {
  buildHunkLines,
  normalizeForMatch,
  planInlineDiff,
  generateDiffLines
} from '../../../src/renderer/src/services/agentDiff'

describe('normalizeForMatch', () => {
  it('strips ATX heading markers', () => {
    expect(normalizeForMatch('# Chapter One')).toBe('Chapter One')
    expect(normalizeForMatch('### A deeper heading')).toBe('A deeper heading')
  })

  it('strips list markers and checkboxes', () => {
    expect(normalizeForMatch('- a bullet')).toBe('a bullet')
    expect(normalizeForMatch('1. first item')).toBe('first item')
    expect(normalizeForMatch('- [ ] todo')).toBe('todo')
  })

  it('strips inline emphasis and code markers', () => {
    expect(normalizeForMatch('a **bold** word')).toBe('a bold word')
    expect(normalizeForMatch('some `code` here')).toBe('some code here')
    expect(normalizeForMatch('~~struck~~ out')).toBe('struck out')
  })

  it('collapses whitespace and trims', () => {
    expect(normalizeForMatch('  spaced   out  ')).toBe('spaced out')
  })

  it('matches a rendered block to its markdown source line', () => {
    // markdown source line vs what Muya renders as textContent
    expect(normalizeForMatch('## The Title')).toBe(normalizeForMatch('The Title'))
    expect(normalizeForMatch('He said **hello**.')).toBe(normalizeForMatch('He said hello.'))
  })
})

describe('buildHunkLines', () => {
  it('returns empty when there is no change', () => {
    const lines = generateDiffLines('same\ntext', 'same\ntext')
    expect(buildHunkLines(lines)).toEqual([])
  })

  it('includes removed and added lines with surrounding context', () => {
    const oldC = 'l1\nl2\nl3\nl4\nl5'
    const newC = 'l1\nl2\nCHANGED\nl4\nl5'
    const hunk = buildHunkLines(generateDiffLines(oldC, newC))
    const types = hunk.map((l) => (l === null ? 'gap' : l.type))
    expect(types).toContain('removed')
    expect(types).toContain('added')
    // context lines preserved
    expect(types).toContain('equal')
  })

  it('inserts a gap marker between non-adjacent hunks', () => {
    const oldC = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n')
    const newLines = oldC.split('\n')
    newLines[1] = 'EDIT-A'
    newLines[18] = 'EDIT-B'
    const hunk = buildHunkLines(generateDiffLines(oldC, newLines.join('\n')))
    expect(hunk).toContain(null) // collapsed gap between the two far-apart edits
  })
})

describe('planInlineDiff', () => {
  it('hides the changed block and anchors the hunk at it (paragraph edit)', () => {
    const oldC = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const newC = 'First paragraph.\n\nSecond paragraph EDITED.\n\nThird paragraph.'
    // Rendered Muya blocks: blank lines are NOT blocks
    const blockTexts = ['First paragraph.', 'Second paragraph.', 'Third paragraph.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    // The old "Second paragraph." block (index 1) must be hidden
    expect(plan.hiddenBlockIndices).toContain(1)
    // Hunk anchors before that block
    expect(plan.anchorIndex).toBe(1)
    // Hunk shows both the removed and added line
    const texts = plan.hunk.filter(Boolean).map((l) => l!.value)
    expect(texts).toContain('Second paragraph.')
    expect(texts).toContain('Second paragraph EDITED.')
  })

  it('matches a heading block despite the markdown # prefix', () => {
    const oldC = '# Old Title\n\nBody text.'
    const newC = '# New Title\n\nBody text.'
    // Muya renders the heading as plain "Old Title" (no #)
    const blockTexts = ['Old Title', 'Body text.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    expect(plan.hiddenBlockIndices).toContain(0)
    expect(plan.anchorIndex).toBe(0)
  })

  it('matches a block containing bold markdown', () => {
    const oldC = 'He said **hello** to her.'
    const newC = 'He said **goodbye** to her.'
    const blockTexts = ['He said hello to her.'] // rendered text, no asterisks

    const plan = planInlineDiff(oldC, newC, blockTexts)

    expect(plan.hiddenBlockIndices).toContain(0)
  })

  it('handles a pure addition by anchoring after the preceding block', () => {
    const oldC = 'Para one.\n\nPara two.'
    const newC = 'Para one.\n\nInserted para.\n\nPara two.'
    const blockTexts = ['Para one.', 'Para two.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    // Nothing removed
    expect(plan.hiddenBlockIndices).toEqual([])
    // Anchor after "Para one." (index 0) => before index 1
    expect(plan.anchorIndex).toBe(1)
    const texts = plan.hunk.filter(Boolean).map((l) => l!.value)
    expect(texts).toContain('Inserted para.')
  })

  it('handles a pure deletion by hiding the removed block', () => {
    const oldC = 'Keep me.\n\nDelete me.\n\nKeep me too.'
    const newC = 'Keep me.\n\nKeep me too.'
    const blockTexts = ['Keep me.', 'Delete me.', 'Keep me too.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    expect(plan.hiddenBlockIndices).toContain(1)
    expect(plan.anchorIndex).toBe(1)
    const texts = plan.hunk.filter(Boolean).map((l) => l!.value)
    expect(texts).toContain('Delete me.')
  })

  it('hides multiple consecutive changed blocks', () => {
    const oldC = 'A.\n\nB.\n\nC.\n\nD.'
    const newC = 'A.\n\nB EDITED.\n\nC EDITED.\n\nD.'
    const blockTexts = ['A.', 'B.', 'C.', 'D.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    expect(plan.hiddenBlockIndices).toEqual([1, 2])
    expect(plan.anchorIndex).toBe(1)
  })

  it('does not hide unchanged blocks', () => {
    const oldC = 'Alpha.\n\nBeta.\n\nGamma.'
    const newC = 'Alpha.\n\nBeta CHANGED.\n\nGamma.'
    const blockTexts = ['Alpha.', 'Beta.', 'Gamma.']

    const plan = planInlineDiff(oldC, newC, blockTexts)

    expect(plan.hiddenBlockIndices).not.toContain(0)
    expect(plan.hiddenBlockIndices).not.toContain(2)
  })
})
