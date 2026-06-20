import * as Diff from 'diff'

export type DiffTokenType = 'equal' | 'added' | 'removed'

export interface DiffLine {
  type: DiffTokenType
  value: string
}

export const MAX_INLINE_DIFF_LINES = 200

export const DIFF_CONTEXT_LINES = 3

/**
 * Reduce a full line diff to git-style hunks: every changed line plus
 * `context` lines around it. `null` entries mark a collapsed gap ("⋯")
 * between two non-adjacent hunks.
 */
export function buildHunkLines(
  lines: DiffLine[],
  context = DIFF_CONTEXT_LINES
): Array<DiffLine | null> {
  const keep = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'equal') {
      const lo = Math.max(0, i - context)
      const hi = Math.min(lines.length - 1, i + context)
      for (let j = lo; j <= hi; j++) keep.add(j)
    }
  }
  if (keep.size === 0) return []

  const result: Array<DiffLine | null> = []
  let prev = -1
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (prev >= 0 && i > prev + 1) result.push(null)
    result.push(lines[i])
    prev = i
  }
  return result
}

/**
 * Normalize a line of markdown (or rendered block text) to a comparable plain
 * string so a raw-markdown diff line can be matched against the text content
 * of a rendered Muya block. Strips block prefixes (heading #, blockquote >,
 * list markers) and inline emphasis/code markers, then collapses whitespace.
 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/, '') // ATX heading
    .replace(/^\s*>\s?/, '') // blockquote
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '') // list marker
    .replace(/^\s*(?:- )?\[[ xX]\]\s+/, '') // task list checkbox
    .replace(/\*\*|__|~~|`/g, '') // bold / strike / code fences
    .replace(/(^|[^\\])[*_]/g, '$1') // single emphasis (not escaped)
    .replace(/\\([*_`~#>[\]])/g, '$1') // unescape
    .replace(/\s+/g, ' ')
    .trim()
}

export interface InlineDiffPlan {
  /** Hunk lines to render (with `null` gaps). */
  hunk: Array<DiffLine | null>
  /** Indices into `blockTexts` of blocks to hide (the old content). */
  hiddenBlockIndices: number[]
  /**
   * Index into `blockTexts` to insert the hunk *before*. `null` means append
   * after the last block (used for pure additions with no locatable anchor).
   */
  anchorIndex: number | null
}

/**
 * Decide how to present an inline diff against a list of rendered top-level
 * block texts. Pure and DOM-free so it can be unit-tested: the component maps
 * the returned indices back to real elements.
 */
export function planInlineDiff(
  oldContent: string,
  newContent: string,
  blockTexts: string[]
): InlineDiffPlan {
  const allLines = generateDiffLines(oldContent, newContent)
  const hunk = buildHunkLines(allLines)

  const normalizedBlocks = blockTexts.map(normalizeForMatch)
  const removedSet = new Set(
    allLines
      .filter((l) => l.type === 'removed')
      .map((l) => normalizeForMatch(l.value))
      .filter(Boolean)
  )

  const hiddenBlockIndices: number[] = []
  normalizedBlocks.forEach((text, i) => {
    if (text && removedSet.has(text)) hiddenBlockIndices.push(i)
  })

  let anchorIndex: number | null = hiddenBlockIndices.length ? hiddenBlockIndices[0] : null

  if (anchorIndex === null) {
    // Pure addition: anchor after the nearest unchanged context line that maps
    // to a real block, so new content lands where it belongs.
    const firstChangeIdx = allLines.findIndex((l) => l.type !== 'equal')
    for (let i = firstChangeIdx - 1; i >= 0; i--) {
      const ctx = normalizeForMatch(allLines[i].value)
      if (!ctx) continue
      const idx = normalizedBlocks.indexOf(ctx)
      if (idx >= 0) {
        anchorIndex = idx + 1
        break
      }
    }
  }

  return { hunk, hiddenBlockIndices, anchorIndex }
}

export function generateUnifiedDiff(oldContent: string, newContent: string): string {
  const diff = Diff.diffLines(oldContent, newContent)
  return diff
    .map((part) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' '
      const lines = part.value.split('\n')
      return lines
        .filter((line) => line.length > 0 || part.added || part.removed)
        .map((line) => prefix + line)
        .join('\n')
    })
    .join('\n')
}

export function generateInlineDiffTokens(oldContent: string, newContent: string): DiffLine[] {
  const diff = Diff.diffChars(oldContent, newContent)
  return diff.map((part) => ({
    type: part.added ? 'added' : part.removed ? 'removed' : 'equal',
    value: part.value
  }))
}

export function generateDiffLines(oldContent: string, newContent: string): DiffLine[] {
  const diff = Diff.diffLines(oldContent, newContent)
  return diff.flatMap((part) => {
    const type: DiffTokenType = part.added ? 'added' : part.removed ? 'removed' : 'equal'
    return part.value.split('\n').map((line) => ({ type, value: line }))
  })
}

export function getChangedLineRange(oldContent: string, newContent: string): { start: number; end: number } {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const maxLines = Math.max(oldLines.length, newLines.length)

  let start = 1
  let end = maxLines

  while (start <= maxLines) {
    const oldLine = oldLines[start - 1] ?? ''
    const newLine = newLines[start - 1] ?? ''
    if (oldLine !== newLine) break
    start += 1
  }

  while (end >= start) {
    const oldLine = oldLines[end - 1] ?? ''
    const newLine = newLines[end - 1] ?? ''
    if (oldLine !== newLine) break
    end -= 1
  }

  return { start, end: Math.max(start, end) }
}

export interface IBlockRange {
  blockKey: string
  startLine: number
  endLine: number
}

export function mapLinesToBlocks(
  blocks: Array<{ key: string; text?: string; functionType?: string }>,
  startLine: number,
  endLine: number
): IBlockRange[] {
  const result: IBlockRange[] = []
  let currentLine = 1

  for (const block of blocks) {
    const blockLines = block.text ? block.text.split('\n').length : 1
    const blockStart = currentLine
    const blockEnd = currentLine + blockLines - 1

    if (blockEnd >= startLine && blockStart <= endLine) {
      result.push({
        blockKey: block.key,
        startLine: Math.max(blockStart, startLine),
        endLine: Math.min(blockEnd, endLine)
      })
    }

    currentLine = blockEnd + 1
  }

  return result
}
