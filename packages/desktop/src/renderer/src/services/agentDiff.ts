import * as Diff from 'diff'

export type DiffTokenType = 'equal' | 'added' | 'removed'

export interface DiffToken {
  type: DiffTokenType
  value: string
}

export interface DiffLine {
  type: DiffTokenType
  value: string
}

export const MAX_INLINE_DIFF_LINES = 200

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

export function generateInlineDiffTokens(oldContent: string, newContent: string): DiffToken[] {
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

/**
 * Maps a line range to Muya block keys.
 * This is used to apply diff highlighting to specific blocks in the editor.
 */
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

    // Check if this block overlaps with the target range
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
