/**
 * Which open tabs belong to the project the writer currently has open.
 *
 * The editor deliberately keeps unsaved buffers across restarts and across
 * project switches — losing a writer's unsaved work would be far worse than
 * showing it. But those buffers are NOT part of the project that happens to
 * be open now, and the WRITER'S VANTAGE block reported them to Biscuit with
 * no scope check at all. On a brand-new project that produced a confident
 * summary of another project's files as this book's work in progress
 * (writer-reported: tabs from a since-deleted project).
 *
 * Untitled buffers (no pathname) belong to no project on disk, but they ARE
 * the writer's live work in this window, so they stay in scope.
 */

/**
 * Containment is computed with pure string logic rather than reusing
 * `common/filesystem/paths`: that module imports `./index`, which imports
 * `fs/promises`, and pulling it into the RENDERER bundle breaks the build
 * ("access is not exported by __vite-browser-external"). This is also why it
 * takes no dependency on `window.path` — it stays unit-testable in plain Node
 * and identical in both processes.
 */
const normalizePath = (value: string): string => {
  const segments = value.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  // Keep the leading slash of an absolute path; both inputs are absolute.
  return (value.startsWith('/') || value.startsWith('\\') ? '/' : '') + out.join('/')
}

/** True when `child` is the same as, or nested inside, `dir`. */
const isInside = (dir: string, child: string): boolean => {
  const root = normalizePath(dir)
  const target = normalizePath(child)
  if (!root || !target) return false
  // The trailing separator is what stops `/w/novel-a-old` matching `/w/novel-a`.
  return target === root || target.startsWith(`${root}/`)
}

export interface ScopedTab {
  filename?: string
  pathname?: string
  isSaved?: boolean
}

/**
 * True when a tab belongs to the open project: an untitled buffer, or a file
 * inside the project root. With no project open every tab is in scope —
 * there is nothing to be outside of.
 */
export const isTabInProject = (tab: ScopedTab, root: string | null | undefined): boolean => {
  if (!tab.pathname) return true
  if (!root) return true
  return isInside(root, tab.pathname)
}

/** Split tabs into the current project's and everything else. */
export const partitionTabs = (
  tabs: ScopedTab[],
  root: string | null | undefined
): { inProject: ScopedTab[]; foreign: ScopedTab[] } => {
  const inProject: ScopedTab[] = []
  const foreign: ScopedTab[] = []
  for (const tab of tabs) {
    ;(isTabInProject(tab, root) ? inProject : foreign).push(tab)
  }
  return { inProject, foreign }
}
