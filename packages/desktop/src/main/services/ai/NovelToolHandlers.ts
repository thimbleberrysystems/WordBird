/**
 * Novel-aware agent tools: manuscript search (ripgrep), structure
 * navigation, story-bible access, agent-maintained summaries, continuity
 * notes, and snapshots.
 *
 * Read/query tools return plain JSON. Anything that changes PROSE or the
 * BIBLE returns the `{ edit, oldContent, originalPath }` payload so it
 * flows through the user's review pipeline. Structural operations
 * (create/move units) and machine-state files (summaries, continuity
 * notes) act directly — they are snapshot-protected, not review-gated.
 */

import crypto from 'crypto'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveRgPath } from '../../ipc/ripgrep'
import { structureService, collectLeaves, findUnit } from '../novel/StructureService'
import { snapshotService } from '../novel/SnapshotService'
import { continuityService } from '../novel/ContinuityService'
import type { AgentToolContext, AgentToolService } from './AgentToolService'
import type { INovelUnit, IContinuityIssue } from '../../../shared/types/novel'

const execFileAsync = promisify(execFile)

const MAX_SEARCH_MATCHES = 200
const MAX_FILE_BYTES = 2 * 1024 * 1024

// ---- shared arg helpers (kept local to avoid circular imports) ----

const str = (args: Record<string, unknown>, key: string): string => {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Agent tool argument '${key}' must be a non-empty string.`)
  }
  return value.trim()
}

const optStr = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Agent tool argument '${key}' must be a string when provided.`)
  }
  return value
}

const optInt = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Agent tool argument '${key}' must be a non-negative integer when provided.`)
  }
  return value
}

const optBool = (args: Record<string, unknown>, key: string): boolean | undefined => {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Agent tool argument '${key}' must be a boolean when provided.`)
  }
  return value
}

const requireRoot = (context: AgentToolContext): string => {
  const root = context.projectRoot ? path.resolve(context.projectRoot) : ''
  if (!root) {
    throw new Error('No active WordBird project is open.')
  }
  return root
}

const resolveInside = (root: string, relative: string, mustBeUnder?: string): string => {
  if (relative.includes('\0')) throw new Error('Path contains a NUL byte.')
  const resolved = path.isAbsolute(relative)
    ? path.resolve(relative)
    : path.resolve(root, relative)
  const rel = path.relative(root, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path is outside the active WordBird project.')
  }
  if (mustBeUnder && !rel.split(path.sep)[0].startsWith(mustBeUnder)) {
    throw new Error(`Path must be inside the ${mustBeUnder}/ directory.`)
  }
  return resolved
}

const readTextSafe = async(filePath: string): Promise<string> => {
  const stat = await fsPromises.stat(filePath)
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`)
  if (stat.size > MAX_FILE_BYTES) throw new Error('File too large for agent tools (2 MB max).')
  const buffer = await fsPromises.readFile(filePath)
  if (buffer.includes(0)) throw new Error('Cannot read binary files.')
  return buffer.toString('utf8')
}

// ---- structure / manuscript tools ----

interface UnitSummaryNode {
  id: string
  type: string
  title: string
  path?: string
  status?: string
  pov?: string
  synopsis?: string
  wordCount?: number
  children?: UnitSummaryNode[]
}

const toSummaryNode = (unit: INovelUnit): UnitSummaryNode => ({
  id: unit.id,
  type: unit.type,
  title: unit.title,
  path: unit.path,
  status: unit.status,
  pov: unit.pov,
  synopsis: unit.synopsis,
  wordCount: unit.wordCount,
  children: unit.children?.map(toSummaryNode)
})

const listStructure = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const structure = await structureService.loadReconciled(root)
  return {
    flavor: structure.flavor,
    units: structure.units.map(toSummaryNode)
  }
}

const readUnit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = str(args, 'unitId')
  const structure = await structureService.loadReconciled(root)
  const found = findUnit(structure.units, unitId)
  if (!found) throw new Error(`No unit with id ${unitId}. Use list_structure to see ids.`)

  const leaves = found.unit.path ? [found.unit] : collectLeaves(found.unit.children ?? [])
  const parts: string[] = []
  for (const leaf of leaves) {
    const content = await readTextSafe(resolveInside(root, leaf.path as string))
    parts.push(leaves.length > 1 ? `<<scene: ${leaf.title}>>\n${content}` : content)
  }
  return {
    unitId,
    title: found.unit.title,
    type: found.unit.type,
    paths: leaves.map((l) => l.path),
    content: parts.join('\n\n')
  }
}

const searchManuscript = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const query = str(args, 'query')
  const isRegex = optBool(args, 'regex') ?? false
  const caseSensitive = optBool(args, 'caseSensitive') ?? false
  const contextLines = Math.min(optInt(args, 'contextLines') ?? 1, 5)
  const maxResults = Math.min(optInt(args, 'maxResults') ?? 50, MAX_SEARCH_MATCHES)

  const rgArgs = [
    '--json',
    '--max-count',
    String(maxResults),
    '--context',
    String(contextLines),
    caseSensitive ? '--case-sensitive' : '--ignore-case',
    '--glob',
    '!.wordbird/agent-state/**',
    '--glob',
    '!exports/**'
  ]
  if (!isRegex) rgArgs.push('--fixed-strings')
  rgArgs.push('--', query, '.')

  let stdout = ''
  try {
    const result = await execFileAsync(resolveRgPath(), rgArgs, {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 20000
    })
    stdout = result.stdout
  } catch (error) {
    // ripgrep exits 1 on "no matches" — treat as empty, rethrow real errors.
    const e = error as { code?: number; stdout?: string }
    if (e.code === 1 && !e.stdout) return { query, matches: [] }
    if (e.stdout) stdout = e.stdout
    else throw error
  }

  const matches: Array<{ file: string; line: number; text: string }> = []
  for (const line of stdout.split('\n')) {
    if (!line.trim() || matches.length >= maxResults) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'match') {
        matches.push({
          file: String(event.data.path?.text ?? ''),
          line: Number(event.data.line_number ?? 0),
          text: String(event.data.lines?.text ?? '').trimEnd().slice(0, 500)
        })
      }
    } catch {
      // Skip malformed JSON lines.
    }
  }
  return { query, matches, truncated: matches.length >= maxResults }
}

const proposeNewUnit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const type = str(args, 'type')
  if (type !== 'part' && type !== 'chapter' && type !== 'scene') {
    throw new Error("Agent tool argument 'type' must be one of part | chapter | scene.")
  }
  const title = str(args, 'title')
  const parentId = optStr(args, 'parentId') ?? null
  const synopsis = optStr(args, 'synopsis')
  const content = optStr(args, 'content')
  const index = optInt(args, 'index')

  const structure = await structureService.loadReconciled(root)
  const unit = await structureService.createUnit(root, structure, {
    parentId,
    type,
    title,
    index
  })
  if (synopsis) {
    await structureService.updateUnit(root, structure, unit.id, { synopsis })
  }

  // The unit shell is structural; its PROSE still goes through review.
  if (content && unit.path) {
    const absolute = resolveInside(root, unit.path)
    return {
      edit: {
        id: crypto.randomUUID(),
        filePath: unit.path,
        newContent: content,
        reason: `New ${type}: ${title}`
      },
      oldContent: '',
      originalPath: absolute
    }
  }
  return { created: true, unitId: unit.id, path: unit.path ?? null, title }
}

const restructureUnit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = str(args, 'unitId')
  const newParentId = optStr(args, 'newParentId') ?? null
  const index = optInt(args, 'index') ?? 0

  const structure = await structureService.loadReconciled(root)
  await structureService.moveUnit(root, structure, unitId, newParentId, index)
  return { moved: true, unitId, newParentId, index }
}

const updateUnitMeta = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = str(args, 'unitId')
  const update: Record<string, string> = {}
  for (const key of ['title', 'status', 'pov', 'location', 'synopsis', 'when'] as const) {
    const value = optStr(args, key)
    if (value !== undefined) update[key] = value
  }
  if (Object.keys(update).length === 0) {
    throw new Error('Provide at least one of title/status/pov/location/synopsis/when.')
  }
  const structure = await structureService.loadReconciled(root)
  await structureService.updateUnit(root, structure, unitId, update)
  return { updated: true, unitId, ...update }
}

// ---- story bible tools ----

const listFilesRecursive = async(dir: string, base: string): Promise<string[]> => {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = await fsPromises.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    const rel = path.join(base, entry.name)
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full, rel)))
    else if (/\.(md|markdown|txt)$/i.test(entry.name)) out.push(rel)
  }
  return out
}

const readBible = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = optStr(args, 'path')

  if (target) {
    const filePath = resolveInside(root, target, 'bible')
    return { path: target, content: await readTextSafe(filePath) }
  }

  const files = await listFilesRecursive(path.join(root, 'bible'), 'bible')
  const entries: Array<{ path: string; firstLine: string }> = []
  for (const file of files) {
    try {
      const content = await readTextSafe(path.join(root, file))
      const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
      entries.push({ path: file, firstLine: firstLine.slice(0, 160) })
    } catch {
      entries.push({ path: file, firstLine: '' })
    }
  }
  return { entries }
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

const proposeBibleUpdate = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = str(args, 'path')
  const newContent = str(args, 'newContent')
  const reason = optStr(args, 'reason')

  const filePath = resolveInside(root, target, 'bible')
  let oldContent = ''
  if (fs.existsSync(filePath)) {
    oldContent = await readTextSafe(filePath)
    if (isLockedCanon(oldContent)) {
      throw new Error(
        `This bible page is LOCKED canon (${target}). You must not change it — ` +
        'treat its facts as immutable. If prose conflicts with it, fix the prose, ' +
        'or log a continuity issue for the writer to decide.'
      )
    }
  } else {
    // New bible page: make sure the parent directory will exist on apply.
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  }

  return {
    edit: {
      id: crypto.randomUUID(),
      filePath: path.relative(root, filePath),
      newContent,
      reason: reason ?? 'Story bible update'
    },
    oldContent,
    originalPath: filePath
  }
}

// ---- summaries / continuity (machine-maintained state) ----

const summaryPath = (root: string, targetId: string | undefined): string => {
  const name = targetId ? targetId.replace(/[^a-zA-Z0-9-]/g, '_') : 'book'
  return path.join(root, '.wordbird', 'summaries', `${name}.md`)
}

const updateSummary = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const targetId = optStr(args, 'unitId')
  const content = str(args, 'content')
  const target = summaryPath(root, targetId)
  await fsPromises.mkdir(path.dirname(target), { recursive: true })
  await fsPromises.writeFile(target, content, 'utf8')
  return { updated: true, target: path.relative(root, target) }
}

/** Newest mtime among the leaf files the summary covers. */
const latestProseMtime = async(root: string, targetId: string | undefined): Promise<number> => {
  const structure = await structureService.loadReconciled(root)
  const scope = targetId
    ? (() => {
      const found = findUnit(structure.units, targetId)
      if (!found) return []
      return found.unit.path ? [found.unit] : collectLeaves(found.unit.children ?? [])
    })()
    : collectLeaves(structure.units)
  let latest = 0
  for (const leaf of scope) {
    try {
      const stat = await fsPromises.stat(path.join(root, leaf.path as string))
      latest = Math.max(latest, stat.mtimeMs)
    } catch {
      // Missing file — reconcile will drop it.
    }
  }
  return latest
}

const readSummary = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const targetId = optStr(args, 'unitId')
  const target = summaryPath(root, targetId)
  if (!fs.existsSync(target)) {
    return { unitId: targetId ?? 'book', content: '', exists: false, stale: true }
  }
  const summaryStat = await fsPromises.stat(target)
  const proseMtime = await latestProseMtime(root, targetId)
  return {
    unitId: targetId ?? 'book',
    content: await readTextSafe(target),
    exists: true,
    // Stale = prose changed after the summary was last written; the agent
    // should re-read the prose and refresh via update_summary.
    stale: proseMtime > summaryStat.mtimeMs
  }
}

const logContinuityIssue = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const title = str(args, 'title')
  const description = str(args, 'description')
  const severityArg = optStr(args, 'severity') ?? 'medium'
  const severity: IContinuityIssue['severity'] =
    severityArg === 'low' || severityArg === 'high' ? severityArg : 'medium'
  const relatedRaw = args.relatedPaths
  const relatedPaths = Array.isArray(relatedRaw)
    ? relatedRaw.filter((p): p is string => typeof p === 'string').slice(0, 20)
    : []

  const issue: IContinuityIssue = {
    id: crypto.randomUUID(),
    title,
    description,
    severity,
    relatedPaths,
    status: 'open',
    createdAt: new Date().toISOString()
  }
  const openIssues = await continuityService.add(root, issue)
  return { logged: true, issueId: issue.id, openIssues }
}

// ---- snapshots ----

const snapshotProject = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const message = str(args, 'message')
  const id = await snapshotService.snapshot(root, message, true)
  return { snapshot: id ?? null, changed: id !== null }
}

export const registerNovelAgentToolHandlers = (service: AgentToolService): void => {
  service.registerHandler('list_structure', listStructure)
  service.registerHandler('read_unit', readUnit)
  service.registerHandler('search_manuscript', searchManuscript)
  service.registerHandler('propose_new_unit', proposeNewUnit)
  service.registerHandler('restructure_unit', restructureUnit)
  service.registerHandler('update_unit_meta', updateUnitMeta)
  service.registerHandler('read_bible', readBible)
  service.registerHandler('propose_bible_update', proposeBibleUpdate)
  service.registerHandler('update_summary', updateSummary)
  service.registerHandler('read_summary', readSummary)
  service.registerHandler('log_continuity_issue', logContinuityIssue)
  service.registerHandler('snapshot_project', snapshotProject)
}
