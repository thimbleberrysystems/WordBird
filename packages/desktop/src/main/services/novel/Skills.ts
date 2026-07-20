/**
 * Skills — writer-authored, on-demand technique files (the Claude Code
 * skills pattern for prose). One markdown file per skill in `skills/`,
 * optional YAML front matter (`name:`, `description:`); the body is the
 * instruction text.
 *
 * Loading model, cheapest-first:
 *  - the brief carries a one-line CATALOG (names + descriptions),
 *  - the model pulls a body on demand with `use_skill`,
 *  - the writer can PIN up to MAX_PINNED_SKILLS — pinned bodies ride
 *    every brief in full (that is what "loaded" means, and why it's
 *    capped: pins cost context on every turn).
 *
 * biscuit.md stays the always-on standing-instructions channel; skills
 * are the on-demand one.
 */

import fs from 'fs'
import path from 'path'
import { stripFrontMatter } from './markdownText'

export interface SkillMeta {
  /** Display/lookup name (front matter `name:` → filename stem fallback). */
  name: string
  description: string
  /** Filename inside skills/ (the stable id used for pinning). */
  file: string
}

export const MAX_PINNED_SKILLS = 3
/** Per-skill body cap when a pinned skill rides the brief. */
export const MAX_SKILL_BODY_CHARS = 2000

const SKILL_FILE_RE = /\.(md|markdown)$/i

/** Tolerant front-matter parse: name/description when present, filename
 * stem otherwise; a fenceless file's first heading doubles as the name. */
export const parseSkillMeta = (content: string, fname: string): SkillMeta => {
  const stem = (fname.split('/').pop() ?? fname).replace(SKILL_FILE_RE, '')
  let name = ''
  let description = ''
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)
  if (fm) {
    const nameMatch = /^\s*name\s*:\s*(.+)$/m.exec(fm[1])
    const descMatch = /^\s*description\s*:\s*(.+)$/m.exec(fm[1])
    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '')
    if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '')
  }
  if (!name) {
    const heading = /^#\s+(.+)$/m.exec(content)
    name = heading ? heading[1].trim() : stem
  }
  if (!description) {
    // First non-empty prose line after front matter / heading.
    const body = skillBody(content)
    const line = body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'))
    description = (line ?? '').slice(0, 160)
  }
  return { name, description, file: fname }
}

/** The instruction text: content minus front matter. */
export const skillBody = (content: string): string => stripFrontMatter(content)

const MAX_SKILL_DEPTH = 3

export const listSkills = (projectRoot: string): SkillMeta[] => {
  const base = path.join(projectRoot, 'skills')
  const skills: SkillMeta[] = []
  // Writers may organize skills into subfolders (combat/, dialogue/, …) —
  // the catalog walks them; `file` is the relative posix path (stable id
  // for pinning and lookup).
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_SKILL_DEPTH) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !SKILL_FILE_RE.test(entry.name)) continue
      try {
        const content = fs.readFileSync(full, 'utf8')
        const rel = path.relative(base, full).split(path.sep).join('/')
        skills.push(parseSkillMeta(content, rel))
      } catch {
        // Unreadable skill file — skip rather than break the catalog.
      }
    }
  }
  walk(base, 0)
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/** Find a skill by name (case-insensitive) or by its filename. */
export const readSkill = (
  projectRoot: string,
  nameOrFile: string
): { meta: SkillMeta; body: string } | null => {
  const wanted = nameOrFile.trim().toLowerCase()
  for (const meta of listSkills(projectRoot)) {
    if (meta.name.toLowerCase() === wanted || meta.file.toLowerCase() === wanted) {
      try {
        const content = fs.readFileSync(path.join(projectRoot, 'skills', meta.file), 'utf8')
        return { meta, body: skillBody(content) }
      } catch {
        return null
      }
    }
  }
  return null
}

/** Writer-pinned skill FILES from the per-project session state. */
export const readPinnedSkills = (projectRoot: string): string[] => {
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, '.wordbird', 'agent-state', 'session.json'),
        'utf8'
      )
    ) as { pinnedSkills?: unknown }
    if (!Array.isArray(raw.pinnedSkills)) return []
    return raw.pinnedSkills
      .filter((f): f is string => typeof f === 'string')
      .slice(0, MAX_PINNED_SKILLS)
  } catch {
    return []
  }
}
