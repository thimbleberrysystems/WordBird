/**
 * StructureService — owns `.wordbird/structure.json`, the ordered tree of
 * prose units behind the binder, and manuscript compilation.
 *
 * Pure tree helpers are exported separately from the fs-bound service so
 * they can be unit-tested without a project on disk.
 */

import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import crypto from 'crypto'
import log from 'electron-log'
import type {
  INovelStructure,
  INovelUnit,
  INovelSeparators,
  INovelCreateUnitPayload,
  INovelUnitUpdate,
  INovelCompileOptions,
  INovelCompileResult,
  ProjectFlavor
} from '../../../shared/types/novel'

const STRUCTURE_RELATIVE_PATH = path.join('.wordbird', 'structure.json')

const DEFAULT_SEPARATORS: Required<INovelSeparators> = {
  scene: '\n\n* * *\n\n',
  chapterHeadingLevel: 2,
  partHeadingLevel: 1
}

const MARKDOWN_RE = /\.(?:markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|mdx)$/i

// =====================================================================
// Pure helpers (exported for unit tests)
// =====================================================================

export const countWords = (markdown: string): number => {
  // Strip fenced code, inline code, front matter, and markdown syntax
  // punctuation, then count whitespace-separated tokens.
  const withoutFrontMatter = markdown.replace(/^---\n[\s\S]*?\n---\n/, '')
  const withoutCode = withoutFrontMatter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
  const plain = withoutCode
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-|]+/g, ' ')
  const tokens = plain.split(/\s+/).filter((t) => /\S/.test(t))
  return tokens.length
}

export const slugify = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'untitled'
}

export const generateUnitId = (): string => crypto.randomUUID()

/** Sum of leaf word counts across the whole binder tree. */
export const totalWords = (units: INovelUnit[]): number => {
  let total = 0
  for (const unit of units) {
    if (unit.children) total += totalWords(unit.children)
    else if (unit.wordCount) total += unit.wordCount
  }
  return total
}

const localDateKey = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface IDailyStats {
  days: Record<string, { start: number; last: number }>
}

/**
 * Session progress: `.wordbird/stats.json` records the manuscript total at
 * the first sighting of each (local) day, so the binder can show "words
 * written today". Best-effort — a stats failure never blocks the binder.
 */
export const updateDailyWordStats = async(
  root: string,
  currentTotal: number
): Promise<number | undefined> => {
  const statsPath = path.join(root, '.wordbird', 'stats.json')
  const today = localDateKey(new Date())
  let stats: IDailyStats = { days: {} }
  try {
    const parsed = JSON.parse(await fsPromises.readFile(statsPath, 'utf8')) as IDailyStats
    if (parsed && typeof parsed.days === 'object' && parsed.days) stats = parsed
  } catch {
    // First run — start fresh.
  }
  let day = stats.days[today]
  if (!day) {
    day = { start: currentTotal, last: currentTotal }
    stats.days[today] = day
  }
  day.last = currentTotal
  try {
    await fsPromises.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf8')
  } catch {
    return undefined
  }
  return day.start
}

export interface UnitLookup {
  unit: INovelUnit
  parent: INovelUnit | null
  siblings: INovelUnit[]
  index: number
}

export const findUnit = (units: INovelUnit[], id: string): UnitLookup | null => {
  const walk = (list: INovelUnit[], parent: INovelUnit | null): UnitLookup | null => {
    for (let i = 0; i < list.length; i++) {
      const unit = list[i]
      if (unit.id === id) {
        return { unit, parent, siblings: list, index: i }
      }
      if (unit.children) {
        const found = walk(unit.children, unit)
        if (found) return found
      }
    }
    return null
  }
  return walk(units, null)
}

export const collectLeaves = (units: INovelUnit[]): INovelUnit[] => {
  const leaves: INovelUnit[] = []
  const walk = (list: INovelUnit[]): void => {
    for (const unit of list) {
      if (unit.children && unit.children.length > 0) {
        walk(unit.children)
      } else if (unit.path) {
        leaves.push(unit)
      }
    }
  }
  walk(units)
  return leaves
}

/** Remove a unit from the tree in place. Returns the removed unit or null. */
export const removeUnit = (units: INovelUnit[], id: string): INovelUnit | null => {
  const found = findUnit(units, id)
  if (!found) return null
  found.siblings.splice(found.index, 1)
  return found.unit
}

/**
 * Move a unit under a new parent (null = top level) at the given index.
 * Rejects moves that would place a unit inside its own subtree.
 */
export const moveUnit = (
  structure: INovelStructure,
  unitId: string,
  newParentId: string | null,
  index: number
): boolean => {
  const found = findUnit(structure.units, unitId)
  if (!found) return false

  if (newParentId) {
    // Guard: target parent must exist and must not be inside the moved subtree.
    const inSubtree = findUnit(found.unit.children ?? [], newParentId)
    if (inSubtree || newParentId === unitId) return false
    if (!findUnit(structure.units, newParentId)) return false
  }

  found.siblings.splice(found.index, 1)

  let targetList: INovelUnit[]
  if (newParentId === null) {
    targetList = structure.units
  } else {
    const parent = findUnit(structure.units, newParentId)
    if (!parent) return false
    if (!parent.unit.children) parent.unit.children = []
    targetList = parent.unit.children
  }

  const clamped = Math.max(0, Math.min(index, targetList.length))
  targetList.splice(clamped, 0, found.unit)
  return true
}

const headingPrefix = (level: number): string => (level > 0 ? '#'.repeat(level) + ' ' : '')

/**
 * Assemble the manuscript from the structure tree and a content loader.
 * Pure with respect to the filesystem — the loader supplies file contents.
 */
export const assembleManuscript = (
  structure: INovelStructure,
  loadContent: (relativePath: string) => string,
  options: INovelCompileOptions = {}
): string => {
  const sep: Required<INovelSeparators> = {
    ...DEFAULT_SEPARATORS,
    ...structure.separators,
    ...options.separators
  }
  const parts: string[] = []

  const emitLeafGroup = (leaves: INovelUnit[]): void => {
    const texts = leaves.map((leaf) => {
      const raw = loadContent(leaf.path as string).trim()
      if (options.includeSceneTitles && leaf.type === 'scene') {
        return `${headingPrefix(sep.chapterHeadingLevel + 1)}${leaf.title}\n\n${raw}`
      }
      return raw
    })
    parts.push(texts.filter((t) => t.length > 0).join(sep.scene))
  }

  const walk = (units: INovelUnit[]): void => {
    // Consecutive leaf scenes are grouped so the scene separator applies
    // between them; containers emit their heading then recurse.
    let leafRun: INovelUnit[] = []
    const flushRun = (): void => {
      if (leafRun.length > 0) {
        emitLeafGroup(leafRun)
        leafRun = []
      }
    }

    for (const unit of units) {
      const isContainer = !!unit.children && unit.children.length > 0
      const isLeafFile = !isContainer && !!unit.path

      if (isLeafFile && unit.type === 'scene') {
        leafRun.push(unit)
        continue
      }
      flushRun()

      if (unit.type === 'part') {
        const h = headingPrefix(sep.partHeadingLevel)
        if (h) parts.push(`${h}${unit.title}`)
        if (isContainer) walk(unit.children as INovelUnit[])
      } else if (unit.type === 'chapter') {
        const h = headingPrefix(sep.chapterHeadingLevel)
        if (h) parts.push(`${h}${unit.title}`)
        if (isContainer) {
          walk(unit.children as INovelUnit[])
        } else if (unit.path) {
          const raw = loadContent(unit.path).trim()
          if (raw) parts.push(raw)
        }
      } else if (isLeafFile) {
        // Non-scene leaf with a file (rare) — emit as-is.
        const raw = loadContent(unit.path as string).trim()
        if (raw) parts.push(raw)
      }
    }
    flushRun()
  }

  walk(structure.units)
  return parts.filter((p) => p.length > 0).join('\n\n') + '\n'
}

// =====================================================================
// Filesystem-bound service
// =====================================================================

const isSafeRelative = (root: string, relative: string): boolean => {
  const resolved = path.resolve(root, relative)
  const rel = path.relative(path.resolve(root), resolved)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export class StructureService {
  structurePath(root: string): string {
    return path.join(root, STRUCTURE_RELATIVE_PATH)
  }

  async load(root: string): Promise<INovelStructure | null> {
    try {
      const raw = await fsPromises.readFile(this.structurePath(root), 'utf8')
      const parsed = JSON.parse(raw) as INovelStructure
      if (parsed.version !== 1 || !Array.isArray(parsed.units)) {
        log.warn('[novel] Invalid structure manifest at', root)
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  async save(root: string, structure: INovelStructure): Promise<void> {
    const target = this.structurePath(root)
    await fsPromises.mkdir(path.dirname(target), { recursive: true })
    await fsPromises.writeFile(target, JSON.stringify(structure, null, 2), 'utf8')
  }

  /** Read the project's flavor from `.wordbird/project.json` (if recorded). */
  async readProjectFlavor(root: string): Promise<ProjectFlavor | null> {
    try {
      const raw = await fsPromises.readFile(
        path.join(root, '.wordbird', 'project.json'),
        'utf8'
      )
      const parsed = JSON.parse(raw) as { flavor?: unknown }
      const flavor = parsed.flavor
      if (flavor === 'chapters-scenes' || flavor === 'scene-pool' || flavor === 'flat') {
        return flavor
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Load the manifest, reconciling it against the files on disk:
   * units whose backing file vanished are dropped; markdown files found in
   * the flavor's manuscript area but missing from the manifest are appended.
   * Creates a manifest by scanning when none exists (imported projects).
   */
  async loadReconciled(root: string, fallbackFlavor?: ProjectFlavor): Promise<INovelStructure> {
    let structure = await this.load(root)
    if (!structure) {
      const flavor =
        fallbackFlavor ??
        (await this.readProjectFlavor(root)) ??
        // Imported/legacy projects: chapters-scenes if a manuscript/ tree
        // exists, scene-pool if scenes/, otherwise flat.
        (fs.existsSync(path.join(root, 'manuscript'))
          ? 'chapters-scenes'
          : fs.existsSync(path.join(root, 'scenes'))
            ? 'scene-pool'
            : 'flat')
      structure = await this.scan(root, flavor)
      await this.save(root, structure)
      return structure
    }

    const knownPaths = new Set(collectLeaves(structure.units).map((u) => u.path))

    // Drop units whose backing file no longer exists.
    const prune = (units: INovelUnit[]): INovelUnit[] =>
      units.filter((unit) => {
        if (unit.children) {
          unit.children = prune(unit.children)
        }
        if (unit.path && !fs.existsSync(path.join(root, unit.path))) {
          return false
        }
        return true
      })
    structure.units = prune(structure.units)

    // Discover new files and append them (top level, sorted by name).
    const discovered = await this.scan(root, structure.flavor)
    const reconciled = structure
    const appendNew = (units: INovelUnit[]): void => {
      for (const unit of units) {
        if (unit.path && !knownPaths.has(unit.path)) {
          reconciled.units.push({ ...unit, children: undefined })
        }
        if (unit.children) appendNew(unit.children)
      }
    }
    appendNew(discovered.units)

    await this.refreshWordCounts(root, structure)
    await this.save(root, structure)
    return structure
  }

  /** Build a structure by scanning the project directory for the given flavor. */
  async scan(root: string, flavor: ProjectFlavor): Promise<INovelStructure> {
    const units: INovelUnit[] = []

    const listMarkdown = async(dir: string): Promise<string[]> => {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true })
        return entries
          .filter((e) => e.isFile() && MARKDOWN_RE.test(e.name))
          .map((e) => e.name)
          .sort()
      } catch {
        return []
      }
    }
    const listDirs = async(dir: string): Promise<string[]> => {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true })
        return entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => e.name)
          .sort()
      } catch {
        return []
      }
    }
    const titleFromFilename = (filename: string): string =>
      filename
        .replace(MARKDOWN_RE, '')
        .replace(/^[0-9]+[-_. ]*/, '')
        .replace(/[-_]+/g, ' ')
        .trim() || filename

    if (flavor === 'chapters-scenes') {
      const manuscriptDir = path.join(root, 'manuscript')
      const sceneUnitsOf = async(dir: string, relDir: string): Promise<INovelUnit[]> =>
        (await listMarkdown(dir)).map((f) => ({
          id: generateUnitId(),
          type: 'scene' as const,
          title: titleFromFilename(f),
          path: path.join(relDir, f)
        }))

      for (const top of await listDirs(manuscriptDir)) {
        const topDir = path.join(manuscriptDir, top)
        const topRel = path.join('manuscript', top)
        const subDirs = await listDirs(topDir)

        if (subDirs.length > 0) {
          // top = part containing chapters
          const partChildren: INovelUnit[] = []
          const part: INovelUnit = {
            id: generateUnitId(),
            type: 'part',
            title: titleFromFilename(top),
            children: partChildren
          }
          for (const sub of subDirs) {
            partChildren.push({
              id: generateUnitId(),
              type: 'chapter',
              title: titleFromFilename(sub),
              children: await sceneUnitsOf(path.join(topDir, sub), path.join(topRel, sub))
            })
          }
          // Loose scenes directly under a part directory
          partChildren.push(...(await sceneUnitsOf(topDir, topRel)))
          units.push(part)
        } else {
          // top = chapter containing scenes
          units.push({
            id: generateUnitId(),
            type: 'chapter',
            title: titleFromFilename(top),
            children: await sceneUnitsOf(topDir, topRel)
          })
        }
      }
      // Loose scenes directly under manuscript/
      for (const f of await listMarkdown(manuscriptDir)) {
        units.push({
          id: generateUnitId(),
          type: 'scene',
          title: titleFromFilename(f),
          path: path.join('manuscript', f)
        })
      }
    } else if (flavor === 'scene-pool') {
      const scenesDir = path.join(root, 'scenes')
      for (const f of await listMarkdown(scenesDir)) {
        units.push({
          id: generateUnitId(),
          type: 'scene',
          title: titleFromFilename(f),
          path: path.join('scenes', f)
        })
      }
    } else {
      // flat: one file per chapter at the project root (and manuscript/ if present)
      for (const f of await listMarkdown(root)) {
        if (f.toLowerCase() === 'readme.md') continue
        units.push({
          id: generateUnitId(),
          type: 'chapter',
          title: titleFromFilename(f),
          path: f
        })
      }
      for (const f of await listMarkdown(path.join(root, 'manuscript'))) {
        units.push({
          id: generateUnitId(),
          type: 'chapter',
          title: titleFromFilename(f),
          path: path.join('manuscript', f)
        })
      }
    }

    const structure: INovelStructure = { version: 1, flavor, units }
    await this.refreshWordCounts(root, structure)
    return structure
  }

  async refreshWordCounts(root: string, structure: INovelStructure): Promise<void> {
    const leaves = collectLeaves(structure.units)
    await Promise.all(
      leaves.map(async(leaf) => {
        try {
          const content = await fsPromises.readFile(path.join(root, leaf.path as string), 'utf8')
          leaf.wordCount = countWords(content)
        } catch {
          leaf.wordCount = 0
        }
      })
    )
  }

  /** Directory that new leaf files belong in, per flavor and parent chain. */
  private _leafDirectory(structure: INovelStructure, parentChain: INovelUnit[]): string {
    if (structure.flavor === 'scene-pool') return 'scenes'
    if (structure.flavor === 'flat') return '.'
    const dirs = ['manuscript', ...parentChain.map((p) => slugify(p.title))]
    return path.join(...dirs)
  }

  private _parentChain(units: INovelUnit[], parentId: string | null): INovelUnit[] {
    if (!parentId) return []
    const chain: INovelUnit[] = []
    const walk = (list: INovelUnit[], trail: INovelUnit[]): boolean => {
      for (const unit of list) {
        const next = [...trail, unit]
        if (unit.id === parentId) {
          chain.push(...next)
          return true
        }
        if (unit.children && walk(unit.children, next)) return true
      }
      return false
    }
    walk(units, [])
    return chain
  }

  async createUnit(
    root: string,
    structure: INovelStructure,
    payload: INovelCreateUnitPayload
  ): Promise<INovelUnit> {
    const { parentId, type, title, index } = payload
    const unit: INovelUnit = { id: generateUnitId(), type, title }

    const isLeaf =
      type === 'scene' || (type === 'chapter' && structure.flavor === 'flat')

    if (isLeaf) {
      const chain = this._parentChain(structure.units, parentId)
      const dir = this._leafDirectory(structure, chain)
      let filename = `${slugify(title)}.md`
      let relative = dir === '.' ? filename : path.join(dir, filename)
      // Keep names stable and unique — suffix with a short id on collision.
      if (fs.existsSync(path.join(root, relative))) {
        filename = `${slugify(title)}-${unit.id.slice(0, 8)}.md`
        relative = dir === '.' ? filename : path.join(dir, filename)
      }
      if (!isSafeRelative(root, relative)) {
        throw new Error(`Unsafe unit path: ${relative}`)
      }
      await fsPromises.mkdir(path.dirname(path.join(root, relative)), { recursive: true })
      await fsPromises.writeFile(path.join(root, relative), '', 'utf8')
      unit.path = relative
      unit.status = 'idea'
      unit.wordCount = 0
    } else {
      unit.children = []
    }

    let targetList = structure.units
    if (parentId) {
      const parent = findUnit(structure.units, parentId)
      if (!parent) throw new Error(`Parent unit not found: ${parentId}`)
      if (!parent.unit.children) parent.unit.children = []
      targetList = parent.unit.children
    }
    const clamped = index === undefined
      ? targetList.length
      : Math.max(0, Math.min(index, targetList.length))
    targetList.splice(clamped, 0, unit)

    await this.save(root, structure)
    return unit
  }

  async updateUnit(
    root: string,
    structure: INovelStructure,
    unitId: string,
    update: INovelUnitUpdate
  ): Promise<void> {
    const found = findUnit(structure.units, unitId)
    if (!found) throw new Error(`Unit not found: ${unitId}`)
    Object.assign(found.unit, update)
    await this.save(root, structure)
  }

  async moveUnit(
    root: string,
    structure: INovelStructure,
    unitId: string,
    newParentId: string | null,
    index: number
  ): Promise<void> {
    if (!moveUnit(structure, unitId, newParentId, index)) {
      throw new Error(`Cannot move unit ${unitId}`)
    }
    await this.save(root, structure)
  }

  async deleteUnit(
    root: string,
    structure: INovelStructure,
    unitId: string,
    deleteFiles: boolean
  ): Promise<void> {
    const removed = removeUnit(structure.units, unitId)
    if (!removed) throw new Error(`Unit not found: ${unitId}`)

    if (deleteFiles) {
      const leaves = removed.path ? [removed] : collectLeaves(removed.children ?? [])
      for (const leaf of leaves) {
        const target = path.join(root, leaf.path as string)
        if (isSafeRelative(root, leaf.path as string) && fs.existsSync(target)) {
          await fsPromises.unlink(target)
        }
      }
    }
    await this.save(root, structure)
  }

  async compile(
    root: string,
    structure: INovelStructure,
    options: INovelCompileOptions = {}
  ): Promise<INovelCompileResult> {
    try {
      const content = assembleManuscript(
        structure,
        (relative) => {
          if (!isSafeRelative(root, relative)) return ''
          try {
            return fs.readFileSync(path.join(root, relative), 'utf8')
          } catch {
            return ''
          }
        },
        options
      )

      const outputPath = options.outputPath
      if (outputPath) {
        await fsPromises.mkdir(path.dirname(outputPath), { recursive: true })
        await fsPromises.writeFile(outputPath, content, 'utf8')
      }
      return { ok: true, content, outputPath, wordCount: countWords(content) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[novel] Compile failed:', error)
      return { ok: false, error: message }
    }
  }
}

export const structureService = new StructureService()
