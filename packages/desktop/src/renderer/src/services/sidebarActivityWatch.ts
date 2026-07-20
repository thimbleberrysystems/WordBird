/**
 * Turns a project change into HONEST sidebar dots.
 *
 * `mt::novel:project-changed` only says "the project changed" — not what.
 * Rather than guess, this re-reads the two datasets that back the
 * Continuity and Snapshots views and marks those rails only when they
 * genuinely gained something, at the severity the data itself reports.
 *
 * Baselines are per project and re-taken whenever the writer looks, so a
 * dot always means "new since YOU last looked".
 */
import { useProjectStore } from '../store/project'
import {
  useSidebarActivityStore,
  severityForIssue,
  type ActivitySeverity
} from '../store/sidebarActivity'

interface IssueLike {
  id?: string
  severity?: string
  status?: string
}

/** Open-issue ids seen at the last look, per project. */
const seenIssueIds = new Map<string, Set<string>>()
/** Snapshot count seen at the last look, per project. */
const seenSnapshotCount = new Map<string, number>()

const openIssues = async(root: string): Promise<IssueLike[]> => {
  try {
    const result = await window.electron.novel.continuityIssues(root)
    const issues = (result?.issues ?? []) as IssueLike[]
    return issues.filter((issue) => issue.status !== 'resolved')
  } catch {
    return []
  }
}

const snapshotCount = async(root: string): Promise<number | null> => {
  try {
    const result = await window.electron.novel.listSnapshots(root)
    return (result?.snapshots ?? []).length
  } catch {
    return null
  }
}

/**
 * Re-baseline a view without marking it — used when the writer opens it,
 * so what they just saw does not come back as "new".
 */
export const rebaselineView = async(viewId: string): Promise<void> => {
  const root = useProjectStore().currentProjectPath
  if (!root) return
  if (viewId === 'continuity') {
    const issues = await openIssues(root)
    seenIssueIds.set(root, new Set(issues.map((i) => String(i.id ?? ''))))
  } else if (viewId === 'history') {
    const count = await snapshotCount(root)
    if (count !== null) seenSnapshotCount.set(root, count)
  }
}

/** Forget every baseline (project switch). */
export const resetActivityBaselines = (): void => {
  seenIssueIds.clear()
  seenSnapshotCount.clear()
}

/**
 * Compare the live data against the baseline and mark what actually grew.
 * `activeViewId` is never marked — the writer is looking at it.
 */
export const refreshDerivedActivity = async(activeViewId: string | null): Promise<void> => {
  const root = useProjectStore().currentProjectPath
  if (!root) return
  const activity = useSidebarActivityStore()

  // --- Continuity: NEW open issues, at their own severity ---------------
  const issues = await openIssues(root)
  const ids = new Set(issues.map((i) => String(i.id ?? '')))
  const baseline = seenIssueIds.get(root)
  if (baseline === undefined) {
    // First look this session: adopt as the baseline rather than dotting
    // every pre-existing issue.
    seenIssueIds.set(root, ids)
  } else {
    const fresh = issues.filter((issue) => !baseline.has(String(issue.id ?? '')))
    if (fresh.length > 0) {
      const loudest = fresh.reduce<ActivitySeverity>(
        (worst, issue) =>
          severityForIssue(String(issue.severity ?? '')) === 'error' ? 'error' : worst,
        'warn'
      )
      activity.mark(['continuity'], loudest, activeViewId)
    }
  }

  // --- Snapshots: a new one is routine progress -------------------------
  const count = await snapshotCount(root)
  if (count !== null) {
    const previous = seenSnapshotCount.get(root)
    if (previous === undefined) {
      seenSnapshotCount.set(root, count)
    } else if (count > previous) {
      seenSnapshotCount.set(root, count)
      activity.mark(['history'], 'info', activeViewId)
    }
  }
}
