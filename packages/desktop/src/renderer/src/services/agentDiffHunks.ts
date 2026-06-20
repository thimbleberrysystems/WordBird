import * as Diff from 'diff'
import type { DiffLine } from './agentDiff'

/**
 * A segment of the diff between old and new content. `equal` segments are
 * unchanged; `change` segments are a contiguous run of removed and/or added
 * lines. A file's content can be reconstructed from its segments plus the set
 * of accepted change-segment indices — this is what powers per-hunk apply.
 */
export interface DiffSegment {
  type: 'equal' | 'change'
  oldLines: string[]
  newLines: string[]
}

/** A renderable hunk: one change segment plus surrounding context lines. */
export interface DiffHunk {
  /** Index of this hunk's segment within the segments array. */
  segmentIndex: number
  /** 0-based position among change segments (the "Nth diff" in the file). */
  hunkIndex: number
  /** Context + removed + added lines, ready to render. */
  lines: DiffLine[]
}

function splitLines(value: string): string[] {
  return value.replace(/\n$/, '').split('\n')
}

/**
 * Break the diff between two documents into ordered equal/change segments.
 */
export function computeDiffSegments(oldContent: string, newContent: string): DiffSegment[] {
  const parts = Diff.diffLines(oldContent, newContent)
  const segments: DiffSegment[] = []
  let pendingOld: string[] = []
  let pendingNew: string[] = []

  const flushChange = (): void => {
    if (pendingOld.length || pendingNew.length) {
      segments.push({ type: 'change', oldLines: pendingOld, newLines: pendingNew })
      pendingOld = []
      pendingNew = []
    }
  }

  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.added) {
      pendingNew.push(...lines)
    } else if (part.removed) {
      pendingOld.push(...lines)
    } else {
      flushChange()
      segments.push({ type: 'equal', oldLines: lines, newLines: lines })
    }
  }
  flushChange()

  return segments
}

/**
 * Build renderable hunks (one per change segment) with up to `context` lines of
 * surrounding context drawn from the adjacent equal segments.
 */
export function buildHunks(segments: DiffSegment[], context = 3): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let hunkIndex = 0

  segments.forEach((seg, i) => {
    if (seg.type !== 'change') return

    const lines: DiffLine[] = []

    const before = segments[i - 1]
    if (before?.type === 'equal') {
      for (const value of before.oldLines.slice(-context)) {
        lines.push({ type: 'equal', value })
      }
    }
    for (const value of seg.oldLines) lines.push({ type: 'removed', value })
    for (const value of seg.newLines) lines.push({ type: 'added', value })

    const after = segments[i + 1]
    if (after?.type === 'equal') {
      for (const value of after.oldLines.slice(0, context)) {
        lines.push({ type: 'equal', value })
      }
    }

    hunks.push({ segmentIndex: i, hunkIndex: hunkIndex++, lines })
  })

  return hunks
}

/**
 * Reconstruct document content from segments: equal segments emit their text,
 * change segments emit the NEW text when their index is in `acceptedSegments`,
 * otherwise the OLD (original) text. With every change accepted this yields the
 * full new content; with none it yields the original.
 */
export function reconstructContent(
  segments: DiffSegment[],
  acceptedSegments: Set<number>
): string {
  const out: string[] = []
  segments.forEach((seg, i) => {
    if (seg.type === 'equal') {
      out.push(...seg.oldLines)
    } else {
      out.push(...(acceptedSegments.has(i) ? seg.newLines : seg.oldLines))
    }
  })
  return out.join('\n')
}

/** Count of change hunks between two documents. */
export function countHunks(oldContent: string, newContent: string): number {
  return computeDiffSegments(oldContent, newContent).filter((s) => s.type === 'change').length
}

function changeSegmentIndices(segments: DiffSegment[]): number[] {
  return segments.map((s, i) => (s.type === 'change' ? i : -1)).filter((i) => i >= 0)
}

/**
 * The inline diff between a file's current content (`base`) and its proposed
 * content (`target`) is a list of hunks. Accepting or discarding a single hunk
 * is modeled as a transition of (base, target):
 *
 *  - acceptHunk advances `base` by applying just that hunk → it disappears from
 *    the diff because base now matches target there. `target` is unchanged.
 *  - discardHunk drops that hunk from `target` (reverts it to the base text) so
 *    it disappears without touching the file. `base` is unchanged.
 *
 * When `base === target` there are no hunks left and the review is complete.
 */
export function acceptHunk(
  base: string,
  target: string,
  hunkIndex: number
): { base: string; target: string } {
  const segments = computeDiffSegments(base, target)
  const indices = changeSegmentIndices(segments)
  const segIndex = indices[hunkIndex]
  if (segIndex == null) return { base, target }
  return { base: reconstructContent(segments, new Set([segIndex])), target }
}

export function discardHunk(
  base: string,
  target: string,
  hunkIndex: number
): { base: string; target: string } {
  const segments = computeDiffSegments(base, target)
  const indices = changeSegmentIndices(segments)
  if (hunkIndex < 0 || hunkIndex >= indices.length) return { base, target }
  // Keep every change EXCEPT the discarded one on the target side.
  const keep = new Set(indices.filter((_, k) => k !== hunkIndex))
  return { base, target: reconstructContent(segments, keep) }
}
