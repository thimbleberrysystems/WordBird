/**
 * EntityIndex — the deterministic "who's where" index (no LLM involved).
 *
 * Scans the story bible for entity pages (name + aliases) and counts their
 * appearances across the manuscript's prose units. The result makes
 * orientation one glance instead of N tool calls: the project brief shows a
 * compact WHO'S WHERE block, and the where_appears tool answers the detailed
 * query. Rebuilt lazily on a cheap mtime/size signature, so it is always
 * fresh without file watchers, and stays instant at 100k words.
 *
 * Persisted at `.wordbird/index/entities.json` (derived data — safe to
 * delete any time).
 */

import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { structureService, collectLeaves } from './StructureService'

export interface IEntityAppearance {
  unitId: string
  title: string
  path: string
  count: number
}

export interface IEntityEntry {
  name: string
  aliases: string[]
  /** Bible page, project-relative. */
  page: string
  appearances: IEntityAppearance[]
}

export interface IEntityIndex {
  builtAt: number
  signature: string
  entities: IEntityEntry[]
}

/** Bible files that describe craft/structure, not story entities. */
const NON_ENTITY_PAGES = new Set(['structure.md', 'style.md', 'book.md'])

const indexPath = (root: string): string =>
  path.join(root, '.wordbird', 'index', 'entities.json')

export const listBiblePages = (root: string): string[] => {
  const pages: string[] = []
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md') && !NON_ENTITY_PAGES.has(entry.name)) {
        pages.push(path.relative(root, full))
      }
    }
  }
  walk(path.join(root, 'bible'))
  return pages
}

/** Same front-matter alias syntax read_bible/search_manuscript understand. */
export const parsePageAliases = (content: string): string[] => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!fm) return []
  const yaml = fm[1]
  const inline = /^\s*aliases\s*:\s*\[([^\]]*)\]\s*$/m.exec(yaml)
  if (inline) {
    return inline[1]
      .split(',')
      .map((a) => a.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  const block = /^\s*aliases\s*:\s*$/m.exec(yaml)
  if (block) {
    const after = yaml.slice(block.index + block[0].length).replace(/^\n/, '')
    const aliases: string[] = []
    for (const line of after.split('\n')) {
      const item = /^\s+-\s+(.+?)\s*$/.exec(line)
      if (!item) break
      aliases.push(item[1].trim().replace(/^['"]|['"]$/g, ''))
    }
    return aliases.filter(Boolean)
  }
  return []
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const countOccurrences = (haystack: string, term: string): number => {
  if (!term) return 0
  const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi')
  return (haystack.match(re) ?? []).length
}

/**
 * Cheap change fingerprint over the inputs (bible pages + prose files):
 * count + total size + newest mtime. Any edit anywhere moves it.
 */
export const computeEntityInputsSignature = (root: string, files: string[]): string => {
  let count = 0
  let bytes = 0
  let newest = 0
  for (const relative of files) {
    try {
      const stat = fs.statSync(path.join(root, relative))
      count += 1
      bytes += stat.size
      if (stat.mtimeMs > newest) newest = stat.mtimeMs
    } catch {
      // Vanished — the changed count covers it.
    }
  }
  return `${count}:${bytes}:${Math.round(newest)}`
}

export const buildEntityIndex = async(root: string): Promise<IEntityIndex> => {
  const structure = await structureService.loadReconciled(root)
  const leaves = collectLeaves(structure.units).filter((leaf) => !!leaf.path)
  const pages = listBiblePages(root)
  const signature = computeEntityInputsSignature(root, [
    ...pages,
    ...leaves.map((l) => l.path as string)
  ])

  // Read every prose unit once; scan it for every entity.
  const proseByLeaf = await Promise.all(
    leaves.map(async(leaf) => {
      try {
        return {
          leaf,
          text: await fsPromises.readFile(path.join(root, leaf.path as string), 'utf8')
        }
      } catch {
        return { leaf, text: '' }
      }
    })
  )

  const entities: IEntityEntry[] = []
  for (const page of pages) {
    let content: string
    try {
      content = await fsPromises.readFile(path.join(root, page), 'utf8')
    } catch {
      continue
    }
    const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
    const basename = path
      .basename(page)
      .replace(/\.md$/i, '')
      .replace(/[-_]+/g, ' ')
    const name = heading || basename
    const aliases = parsePageAliases(content)
    const terms = [...new Set([name, ...aliases].map((t) => t.trim()).filter(Boolean))]

    const appearances: IEntityAppearance[] = []
    for (const { leaf, text } of proseByLeaf) {
      let count = 0
      for (const term of terms) count += countOccurrences(text, term)
      if (count > 0) {
        appearances.push({
          unitId: leaf.id,
          title: leaf.title,
          path: leaf.path as string,
          count
        })
      }
    }
    appearances.sort((a, b) => b.count - a.count)
    entities.push({ name, aliases, page, appearances })
  }

  const index: IEntityIndex = { builtAt: Date.now(), signature, entities }
  try {
    const target = indexPath(root)
    await fsPromises.mkdir(path.dirname(target), { recursive: true })
    await fsPromises.writeFile(target, JSON.stringify(index), 'utf8')
  } catch {
    // Persisting is an optimization — the in-memory result still serves.
  }
  return index
}

/**
 * The index, rebuilt only when bible/manuscript inputs changed since the
 * persisted copy was made.
 */
export const getEntityIndex = async(root: string): Promise<IEntityIndex> => {
  let cached: IEntityIndex | null = null
  try {
    cached = JSON.parse(fs.readFileSync(indexPath(root), 'utf8')) as IEntityIndex
  } catch {
    // No cache yet.
  }
  if (cached?.signature) {
    const structure = await structureService.loadReconciled(root)
    const leaves = collectLeaves(structure.units).filter((leaf) => !!leaf.path)
    const current = computeEntityInputsSignature(root, [
      ...listBiblePages(root),
      ...leaves.map((l) => l.path as string)
    ])
    if (current === cached.signature) return cached
  }
  return buildEntityIndex(root)
}
