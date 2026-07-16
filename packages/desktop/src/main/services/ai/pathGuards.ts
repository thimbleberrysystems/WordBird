/**
 * Path guards shared by EVERY layer that touches project files on an
 * agent's behalf — tool handlers (proposal creation) AND the apply gate
 * (final disk write). One law, enforced twice:
 *
 * - `.wordbird/` and `.git/` are untouchable (structure.json, the fact
 *   ledger, snapshots, and agent state must never be agent-writable).
 * - Containment is judged on REAL paths, not just lexical ones, so a
 *   symlink inside the project cannot smuggle reads/writes outside it.
 * - `locked: true` bible pages are immutable to agents on every edit
 *   route, not just propose_bible_update.
 */

import fs from 'fs'
import path from 'path'

export const INTERNAL_TOP_DIRS = new Set(['.wordbird', '.git'])

/** Throw when absPath's top-level segment is an internal directory. */
export const assertNotInternalPath = (root: string, absPath: string): string => {
  const rel = path.relative(path.resolve(root), path.resolve(absPath))
  if (INTERNAL_TOP_DIRS.has(rel.split(path.sep)[0])) {
    throw new Error(
      'Internal directories (.wordbird, .git) are off limits to agent tools.'
    )
  }
  return rel
}

/** Deepest existing ancestor of a path (the path itself when it exists). */
const deepestExisting = (absPath: string): string => {
  let current = absPath
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

/**
 * Real (symlink-resolved) containment: the deepest EXISTING ancestor of
 * the target must resolve inside the resolved project root. Lexical
 * checks alone pass `project/link-to-elsewhere/file.md`.
 */
export const assertRealInside = (root: string, absPath: string): void => {
  let realRoot: string
  try {
    realRoot = fs.realpathSync(path.resolve(root))
  } catch {
    throw new Error('The active project root does not exist.')
  }
  const anchor = deepestExisting(path.resolve(absPath))
  let realAnchor: string
  try {
    realAnchor = fs.realpathSync(anchor)
  } catch {
    throw new Error('Agent tool file path could not be resolved.')
  }
  const rel = path.relative(realRoot, realAnchor)
  if (rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) {
    throw new Error(
      'Agent tool file path escapes the project (symlinks resolve outside the root).'
    )
  }
}

/**
 * A bible page is locked canon when its YAML front matter contains
 * `locked: true`. Locked pages are read-only for the agent — only the
 * writer may change them (directly in the editor).
 */
export const isLockedCanon = (content: string): boolean => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!fm) return false
  return /^\s*locked\s*:\s*true\s*$/m.test(fm[1])
}

/** Throw when the target exists and carries locked front matter. */
export const assertNotLockedCanon = (absPath: string): void => {
  if (!fs.existsSync(absPath)) return
  if (!/\.(md|markdown)$/i.test(absPath)) return
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf8')
  } catch {
    return
  }
  if (isLockedCanon(content)) {
    throw new Error(
      `${path.basename(absPath)} is LOCKED canon (locked: true) — only the writer can ` +
      'change it. Treat its facts as immutable; if prose conflicts with it, fix the ' +
      'prose or log a continuity issue for the writer to decide.'
    )
  }
}

/** File types the apply gate will ever write for an agent. */
export const WRITABLE_EXT_RE = /\.(md|markdown|txt)$/i

/**
 * The apply gate's validator (pure; unit-tested): given a pending
 * proposal's target and roots, return the absolute path the write may go
 * to — or throw. Rules: a root must exist; a recorded root must match the
 * active one (no cross-project applies); real containment; no internals;
 * markdown/text only; never locked canon.
 */
export const validateAgentApply = (options: {
  originalPath: string
  recordedRoot: string | null
  activeRoot: string | null
}): string => {
  const { originalPath, recordedRoot, activeRoot } = options
  const root = recordedRoot ?? activeRoot
  if (!root) {
    throw new Error('This proposal has no project scope — nothing safe to write to.')
  }
  if (recordedRoot && activeRoot && path.resolve(recordedRoot) !== path.resolve(activeRoot)) {
    throw new Error('This proposal belongs to a different project than the one open now.')
  }
  const target = path.isAbsolute(originalPath)
    ? path.resolve(originalPath)
    : path.resolve(root, originalPath)
  assertRealInside(root, target)
  assertNotInternalPath(root, target)
  if (!WRITABLE_EXT_RE.test(target)) {
    throw new Error('Agent applies may only write .md, .markdown, or .txt files.')
  }
  assertNotLockedCanon(target)
  return target
}
