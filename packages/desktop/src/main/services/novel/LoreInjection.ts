/**
 * LoreInjection — Codex-style auto-injection of story-bible pages.
 *
 * SOTA gap #1 (AUDIT-SOTA-2026-07): NovelCrafter's Codex and NovelAI's
 * Lorebook inject the BODIES of relevant lore entries into model context
 * when an entity is mentioned; WordBird only injected appearance counts
 * (WHO'S WHERE), leaving agents to fetch pages by tool — the #1 cause of
 * "the AI forgot her eyes are grey" consistency failures.
 *
 * Mechanics: at TURN START the manager seeds this module with the text
 * that frames the turn (the writer's message + the open scene). Entities
 * whose name or alias appears in the seed (word-boundary, case-
 * insensitive — detection reuses the deterministic EntityIndex) get
 * their bible page bodies inlined into the per-turn brief, budgeted.
 *
 * Page front matter flags (writer-controlled, NovelAI-lorebook style):
 *   always: true     — inject on EVERY turn, mention or not.
 *   budget: <chars>  — per-page character cap (default DEFAULT_PAGE_BUDGET).
 *
 * Section + per-page caps are CONTEXT budgets, not disk limits. The
 * rendered section is neutralized by ContextBuilder with the rest of the
 * brief (prompt trust model).
 */

import fs from 'fs'
import path from 'path'
import { getEntityIndex } from './EntityIndex'
import { frontMatterOf, stripFrontMatter, mentionsTerm } from './markdownText'

// Re-exported: callers and specs have imported it from here since the
// feature landed; the implementation now lives in markdownText.
export { mentionsTerm }

export const LORE_SECTION_HEADER = 'STORY BIBLE — RELEVANT PAGES'
export const DEFAULT_PAGE_BUDGET = 1600
const LORE_SECTION_BUDGET = 7000
export const MAX_INJECTED_PAGES = 8

interface LorePage {
  name: string
  page: string
  body: string
  always: boolean
}

const parseFlags = (frontMatter: string): { always: boolean; budget: number | null } => {
  const always = /^\s*always\s*:\s*true\s*$/m.test(frontMatter)
  const budget = /^\s*budget\s*:\s*(\d+)\s*$/m.exec(frontMatter)
  return { always, budget: budget ? Number(budget[1]) : null }
}

/**
 * Build the injected-lore section for one turn. Detection order: pages
 * flagged `always: true` first, then mentioned entities in index order.
 * Empty string when nothing qualifies.
 */
export const buildLoreSection = async(
  root: string,
  seedText: string
): Promise<string> => {
  let index
  try {
    index = await getEntityIndex(root)
  } catch {
    return ''
  }

  const selected: LorePage[] = []
  const seen = new Set<string>()
  const readPage = (
    entryName: string,
    relative: string
  ): LorePage | null => {
    if (seen.has(relative)) return null
    let raw: string
    try {
      raw = fs.readFileSync(path.join(root, relative), 'utf8')
    } catch {
      return null
    }
    const flags = parseFlags(frontMatterOf(raw))
    const body = stripFrontMatter(raw)
    if (!body) return null
    const cap = Math.max(200, flags.budget ?? DEFAULT_PAGE_BUDGET)
    seen.add(relative)
    return {
      name: entryName,
      page: relative,
      body: body.length > cap ? `${body.slice(0, cap)}\n…[page truncated for context]` : body,
      always: flags.always
    }
  }

  // Partition BEFORE capping: an `always` page must never be crowded out by
  // mentioned ones that happen to sit earlier in the entity index — the
  // whole point of the flag is that it rides every turn.
  const alwaysPages: LorePage[] = []
  const mentionedPages: LorePage[] = []
  for (const entry of index.entities) {
    const terms = [entry.name, ...entry.aliases]
    const mentioned = seedText ? terms.some((term) => mentionsTerm(seedText, term)) : false
    // The `always` flag lives in the page's front matter, so the page has to
    // be read before it can be classified.
    const page = readPage(entry.name, entry.page)
    if (!page) continue
    if (page.always) alwaysPages.push(page)
    else if (mentioned) mentionedPages.push(page)
    else seen.delete(entry.page)
  }
  // always-flagged canon leads and is guaranteed a slot; mentions fill the rest.
  selected.push(...alwaysPages, ...mentionedPages)
  selected.splice(MAX_INJECTED_PAGES)
  if (selected.length === 0) return ''
  const lines: string[] = [
    `${LORE_SECTION_HEADER} (auto-injected for entities in play — canon, verbatim):`
  ]
  let used = lines[0].length
  let included = 0
  for (const page of selected) {
    const block = `\n## ${page.name} (${page.page})\n${page.body}`
    if (used + block.length > LORE_SECTION_BUDGET) break
    lines.push(block)
    used += block.length
    included += 1
  }
  if (included === 0) return ''
  const omitted = selected.length - included
  if (omitted > 0) {
    lines.push(`\n…and ${omitted} more relevant pages — read_bible for the rest.`)
  }
  return lines.join('\n')
}
