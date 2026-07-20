import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * "Something changed in there since you last looked" markers for the
 * sidebar rail.
 *
 * The agents icon already shows a LIVE (pulsing) dot while a run is in
 * flight. This is the complement: after Biscuit works, the views whose
 * contents went stale carry a STEADY dot so the writer can see WHERE the
 * work landed — and in what key.
 *
 *   error (red)    something needs a decision — a high-severity
 *                  continuity issue was logged
 *   warn  (yellow) worth a look — a low/medium continuity issue
 *   info  (green)  routine progress — files, structure, entities, a new
 *                  snapshot
 *
 * Deliberately narrow: a view is only marked when a signal genuinely
 * invalidates it, and severity comes from real data (the issue's own
 * severity), never a guess. A dot that appears for everything, or that
 * cries red for routine work, teaches writers to ignore dots.
 */
export type ActivitySeverity = 'info' | 'warn' | 'error'

const RANK: Record<ActivitySeverity, number> = { info: 0, warn: 1, error: 2 }

export const useSidebarActivityStore = defineStore('sidebarActivity', () => {
  /** View id → highest unseen severity. */
  const unseen = ref<Map<string, ActivitySeverity>>(new Map())

  /**
   * Flag views as changed. The view being looked at is never flagged — it
   * re-renders live, so a dot there would be noise. A louder severity
   * upgrades an existing mark; a quieter one never downgrades it.
   */
  const mark = (
    viewIds: string[],
    severity: ActivitySeverity = 'info',
    activeViewId?: string | null
  ): void => {
    const next = new Map(unseen.value)
    let changed = false
    for (const id of viewIds) {
      if (id === activeViewId) continue
      const current = next.get(id)
      if (current && RANK[current] >= RANK[severity]) continue
      next.set(id, severity)
      changed = true
    }
    // Replace the Map so Vue sees it (Map mutation is not reactive).
    if (changed) unseen.value = next
  }

  /** The writer opened this view — its changes have now been seen. */
  const clear = (viewId: string): void => {
    if (!unseen.value.has(viewId)) return
    const next = new Map(unseen.value)
    next.delete(viewId)
    unseen.value = next
  }

  /** Switching projects starts a clean slate. */
  const clearAll = (): void => {
    if (unseen.value.size === 0) return
    unseen.value = new Map()
  }

  const severityOf = (viewId: string): ActivitySeverity | null =>
    unseen.value.get(viewId) ?? null

  const hasUnseen = (viewId: string): boolean => unseen.value.has(viewId)

  return { unseen, mark, clear, clearAll, hasUnseen, severityOf }
})

/**
 * Views invalidated when an agent changes project files. These are exactly
 * the ones that re-fetch on `mt::novel:project-changed` today: the binder
 * (structure.json), the file tree, and the entity index.
 */
export const PROJECT_CHANGE_VIEWS = ['binder', 'files', 'entities']

/** A continuity issue's own severity decides the dot's colour. */
export const severityForIssue = (issueSeverity: string): ActivitySeverity =>
  issueSeverity === 'high' ? 'error' : 'warn'
