import type { AgentEditReview } from '@/store/agent'

/**
 * Absolute disk path an edit targets. Proposals carry the absolute path in
 * `originalPath` (the relative project path lives in `filePath`).
 */
export function editDiskPath(edit: AgentEditReview): string {
  return edit.originalPath || edit.filePath || ''
}

export interface MultiFileApplyPlan {
  /** The edit for the file currently open in the editor, if any. */
  currentEdit: AgentEditReview | null
  /** Edits for every other file — written straight to disk. */
  diskEdits: AgentEditReview[]
  /** Edits that cannot be located (no path) — reported, never silently dropped. */
  unresolved: AgentEditReview[]
}

function samePath(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Tolerate separator/basename differences between the proposal path and the
  // open file's pathname.
  const norm = (p: string): string => p.replace(/\\/g, '/')
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  return na.split('/').pop() === nb.split('/').pop() && na.split('/').pop() !== ''
}

/**
 * Split the pending edits into the one that belongs to the open editor (applied
 * in-memory + saved) and the rest (written directly to disk). Pure so the
 * routing is unit-tested without Electron.
 */
export function planMultiFileApply(
  edits: AgentEditReview[],
  currentFilePath: string | null
): MultiFileApplyPlan {
  const pending = edits.filter((e) => e.status === 'pending')

  let currentEdit: AgentEditReview | null = null
  const diskEdits: AgentEditReview[] = []
  const unresolved: AgentEditReview[] = []

  for (const edit of pending) {
    const disk = editDiskPath(edit)
    if (!disk) {
      unresolved.push(edit)
      continue
    }
    if (!currentEdit && currentFilePath && samePath(disk, currentFilePath)) {
      currentEdit = edit
    } else {
      diskEdits.push(edit)
    }
  }

  return { currentEdit, diskEdits, unresolved }
}

export interface MultiFileApplyHandlers {
  /** Apply the open file's edit through the editor (in-memory + save). */
  applyCurrent: (edit: AgentEditReview) => void
  /** Apply a closed file's edit on disk (main validates + writes by id). */
  applyToDisk: (edit: AgentEditReview) => Promise<{ ok: boolean; error?: string }>
  /** Mark an edit resolved in the store. */
  markApplied: (id: string) => void
}

export interface MultiFileApplyResult {
  applied: number
  failed: Array<{ id: string; path: string; error: string }>
}

/**
 * Apply every pending edit: the open file through the editor, all others by
 * writing their new content to disk. Returns a summary so the caller can
 * surface failures instead of silently dropping them.
 */
export async function applyAllPendingEdits(
  edits: AgentEditReview[],
  currentFilePath: string | null,
  handlers: MultiFileApplyHandlers
): Promise<MultiFileApplyResult> {
  const { currentEdit, diskEdits, unresolved } = planMultiFileApply(edits, currentFilePath)

  let applied = 0
  const failed: MultiFileApplyResult['failed'] = []

  if (currentEdit) {
    handlers.applyCurrent(currentEdit)
    handlers.markApplied(currentEdit.id)
    applied += 1
  }

  for (const edit of diskEdits) {
    const path = editDiskPath(edit)
    try {
      const res = await handlers.applyToDisk(edit)
      if (res.ok) {
        handlers.markApplied(edit.id)
        applied += 1
      } else {
        failed.push({ id: edit.id, path, error: res.error || 'write failed' })
      }
    } catch (err) {
      failed.push({ id: edit.id, path, error: err instanceof Error ? err.message : String(err) })
    }
  }

  for (const edit of unresolved) {
    failed.push({ id: edit.id, path: '', error: 'no file path' })
  }

  return { applied, failed }
}
