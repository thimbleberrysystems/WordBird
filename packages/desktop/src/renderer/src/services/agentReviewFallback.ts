/**
 * Window-level agent-review plumbing — proposal ingestion and review
 * actions that do NOT depend on the editor being mounted.
 *
 * THE BUG THIS FIXES (found by the LIVE_APP golden path, 2026-07-18):
 * proposal ingestion and the apply/discard bus handlers lived only in
 * editor.vue, which mounts v-if="hasCurrentFile". On a fresh project
 * (ProjectHome showing, no tabs — exactly where a writer first asks
 * Biscuit to write something) and in the detached Biscuit window, every
 * edit proposal was broadcast into a window with NO subscriber: the
 * agent reported "waiting in your review queue" while the queue stayed
 * empty. Main had recorded the proposal (it rehydrated once a file was
 * opened), but the writer saw nothing.
 *
 * Design: INGESTION lives here, always on (idempotent init per window).
 * REVIEW ACTIONS have two tiers: while the editor is mounted it handles
 * the bus events (inline diff, current-file apply, its own snapshots) and
 * this module stays out of the way; without an editor the fallback
 * handles the same events disk-only via the main-side apply gate
 * (mt::ai:apply-edit validates and writes by proposal id — the renderer
 * never supplies paths or content).
 */

import { ElMessage } from 'element-plus'
import bus from '../bus'
import { useAgentStore } from '../store/agent'
import { useProjectStore } from '../store/project'
import { modeKey } from '../util/projectStorageKeys'

let editorReviewActive = false
/** editor.vue marks itself active on mount so the fallback stands down. */
export const setEditorReviewActive = (active: boolean): void => {
  editorReviewActive = active
}

let initialized = false
let autoApplyTimer: ReturnType<typeof setTimeout> | null = null

const takeProtectiveSnapshot = async(label: string): Promise<void> => {
  try {
    const projectStore = useProjectStore()
    const root = projectStore.projectTree?.pathname
    if (root) await window.electron.novel.snapshot(root, label)
  } catch {
    // Snapshot is protection, never a blocker.
  }
}

/** Disk-only apply of every pending edit (no editor in this window). */
// Serialized + coalesced for the same reason editor.vue's apply-all is: two
// overlapping runs re-apply the same proposal, main answers "already-settled",
// and the writer sees a false save failure. A request during a run re-runs
// once on completion so mid-run proposals are still applied.
let fallbackApplyInFlight = false
let fallbackApplyAgainQueued = false

const fallbackApplyAll = async(): Promise<void> => {
  if (fallbackApplyInFlight) {
    fallbackApplyAgainQueued = true
    return
  }
  fallbackApplyInFlight = true
  try {
    do {
      fallbackApplyAgainQueued = false
      await runFallbackApplyOnce()
    } while (fallbackApplyAgainQueued)
  } finally {
    fallbackApplyInFlight = false
  }
}

const runFallbackApplyOnce = async(): Promise<void> => {
  const agentStore = useAgentStore()
  const pending = agentStore.pendingEdits.filter((edit) => edit.status === 'pending')
  if (pending.length === 0) return
  await takeProtectiveSnapshot("Before applying Biscuit's edits")
  const failed: string[] = []
  for (const edit of pending) {
    try {
      const result = await window.electron.ai.applyEdit(edit.id)
      if (result.ok || result.alreadySettled) {
        // alreadySettled = another cycle applied it; resolve, don't fail.
        agentStore.updateEditStatus(edit.id, 'applied')
      } else {
        failed.push(edit.filePath)
      }
    } catch {
      failed.push(edit.filePath)
    }
  }
  if (failed.length > 0) {
    ElMessage.error(`${failed.length} file(s) could not be applied: ${failed.join(', ')}`)
  }
  // Keep proposals that arrived mid-run; drop only what we resolved.
  agentStore.pruneResolved()
}

const fallbackApplyOne = async(editId: string): Promise<void> => {
  const agentStore = useAgentStore()
  const edit = agentStore.getPendingEdit(editId)
  if (!edit || edit.status !== 'pending') return
  await takeProtectiveSnapshot("Before applying Biscuit's edit")
  try {
    const result = await window.electron.ai.applyEdit(edit.id)
    if (result.ok || result.alreadySettled) {
      agentStore.updateEditStatus(edit.id, 'applied')
    } else {
      ElMessage.error(`Could not apply ${edit.filePath}: ${result.error ?? 'write failed'}`)
    }
  } catch (err) {
    ElMessage.error(`Could not apply ${edit.filePath}: ${err instanceof Error ? err.message : err}`)
  }
}

const fallbackDiscardOne = (editId: string): void => {
  const agentStore = useAgentStore()
  const edit = agentStore.getPendingEdit(editId)
  if (edit && edit.status === 'pending') agentStore.updateEditStatus(editId, 'rejected')
}

const fallbackDiscardAll = (): void => {
  const agentStore = useAgentStore()
  for (const edit of agentStore.pendingEdits) {
    if (edit.status === 'pending') agentStore.updateEditStatus(edit.id, 'rejected')
  }
  agentStore.clearPendingEdits()
}

const scheduleFallbackAutoApply = (): void => {
  if (autoApplyTimer) clearTimeout(autoApplyTimer)
  // Small debounce so a burst of proposals applies as one snapshot+batch.
  autoApplyTimer = setTimeout(() => {
    autoApplyTimer = null
    if (!editorReviewActive) fallbackApplyAll().catch(() => {})
  }, 400)
}

/**
 * Subscribe this WINDOW to the proposal stream + review bus. Idempotent;
 * call from every page that can show the review queue (app + detached
 * Biscuit). The editor's own richer handlers take precedence whenever it
 * is mounted.
 */
export const initAgentReviewFallback = (): void => {
  if (initialized) return
  initialized = true

  const agentStore = useAgentStore()
  const projectStore = useProjectStore()

  const ingest = (proposal: {
    edit: { id: string; filePath: string; newContent: string; reason?: string }
    oldContent: string
    originalPath: string
  }): void => {
    if (agentStore.getPendingEdit(proposal.edit.id)) return
    agentStore.addPendingEdit(proposal.edit as never, proposal.oldContent, proposal.originalPath)
    // Auto mode with no editor mounted: the writer chose speed — apply
    // from here (snapshot first), or these proposals would sit forever.
    // Per-project key: another project's cached mode must never authorize
    // auto-apply here (see util/projectStorageKeys).
    const mode = localStorage.getItem(modeKey(projectStore.currentProjectPath))
    if (!editorReviewActive && mode === 'auto') {
      scheduleFallbackAutoApply()
    }
  }

  window.electron.ai.onEditProposal(ingest)
  window.electron.ai.onPendingEditsCleared?.(() => {
    if (!editorReviewActive) agentStore.clearPendingEdits()
  })
  // Rehydrate proposals that were pending before a reload/restart.
  window.electron.ai
    .getPendingEdits?.()
    .then((persisted) => {
      for (const proposal of persisted) ingest(proposal)
    })
    .catch(() => {
      /* fresh session */
    })

  // Review actions: stand down whenever the editor's handlers are live.
  bus.on('agent-apply-all', () => {
    if (!editorReviewActive) fallbackApplyAll().catch(() => {})
  })
  bus.on('agent-apply-one', (editId: unknown) => {
    if (!editorReviewActive) fallbackApplyOne(String(editId)).catch(() => {})
  })
  bus.on('agent-discard-one', (editId: unknown) => {
    if (!editorReviewActive) fallbackDiscardOne(String(editId))
  })
  bus.on('agent-discard-all', () => {
    if (!editorReviewActive) fallbackDiscardAll()
  })
}
