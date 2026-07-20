import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * "Something changed in there since you last looked" markers for the
 * sidebar rail.
 *
 * The agents icon already shows a LIVE dot while a run is in flight. This
 * is the complement: after Biscuit edits the project, the views whose
 * contents just went stale (binder, files, entities) carry a steady dot so
 * the writer can see WHERE the work landed without opening each one.
 *
 * Deliberately narrow: a view is only marked when a signal genuinely
 * invalidates it. A dot that appears for everything on every event teaches
 * writers to ignore dots.
 */
export const useSidebarActivityStore = defineStore('sidebarActivity', () => {
  /** View ids with changes the writer has not looked at yet. */
  const unseen = ref<Set<string>>(new Set())

  /** Flag views as changed. The view being looked at is never flagged —
   * it re-renders live, so a dot there would be noise. */
  const mark = (viewIds: string[], activeViewId?: string | null): void => {
    const next = new Set(unseen.value)
    let changed = false
    for (const id of viewIds) {
      if (id === activeViewId || next.has(id)) continue
      next.add(id)
      changed = true
    }
    // Replace the Set so Vue sees the change (Set mutation is not reactive).
    if (changed) unseen.value = next
  }

  /** The writer opened this view — its changes have now been seen. */
  const clear = (viewId: string): void => {
    if (!unseen.value.has(viewId)) return
    const next = new Set(unseen.value)
    next.delete(viewId)
    unseen.value = next
  }

  /** Switching projects starts a clean slate. */
  const clearAll = (): void => {
    if (unseen.value.size === 0) return
    unseen.value = new Set()
  }

  const hasUnseen = (viewId: string): boolean => unseen.value.has(viewId)

  return { unseen, mark, clear, clearAll, hasUnseen }
})

/**
 * Views invalidated when an agent changes project files. These are exactly
 * the ones that re-fetch on `mt::ai:project-changed` today: the binder
 * (structure.json), the file tree, and the entity index.
 */
export const PROJECT_CHANGE_VIEWS = ['binder', 'files', 'entities']
