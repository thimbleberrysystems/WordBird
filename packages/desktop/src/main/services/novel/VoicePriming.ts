/**
 * VoicePriming — few-shot voice exemplars for the drafting agents.
 *
 * SOTA gap (AUDIT-SOTA-2026-07): voice retention is the #1 universal
 * complaint about AI fiction tools ("sounds like a clean stranger").
 * Sudowrite ("Style Examples" / "My Voice") and NovelCrafter (Personas)
 * prime generation with the writer's OWN prose. WordBird had only
 * "obey bible/style.md" rules — no concrete prose to emulate.
 *
 * The writer keeps exemplar passages in `bible/voice/*.md` (front matter
 * stripped). This module concatenates them, capped for context, into a
 * VOICE EXEMPLARS brief section that drafters/line-editors are told to
 * match. The steward can harvest the writer's best approved passages
 * into `bible/voice/` (doctrine in roles.ts).
 *
 * Caps are CONTEXT budgets, not disk limits. The section is neutralized
 * with the rest of the brief by ContextBuilder (prompt trust model).
 */

import fs from 'fs'
import path from 'path'
import { stripFrontMatter } from './markdownText'

export const VOICE_SECTION_HEADER = 'VOICE EXEMPLARS'
/** Total characters of exemplar prose carried into the brief (~1000 words). */
export const VOICE_SECTION_BUDGET = 6000
/** Per-file cap so one long exemplar cannot crowd out the others. */
export const VOICE_FILE_BUDGET = 2500
export const MAX_VOICE_FILES = 6

const listVoiceFiles = (dir: string): string[] => {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => n.endsWith('.md'))
    .sort()
    .slice(0, MAX_VOICE_FILES)
    .map((n) => path.join(dir, n))
}

/**
 * Build the VOICE EXEMPLARS section from `bible/voice/*.md`, or '' when
 * the writer has provided no exemplars.
 */
export const buildVoiceSection = (root: string): string => {
  const files = listVoiceFiles(path.join(root, 'bible', 'voice'))
  if (files.length === 0) return ''

  const passages: string[] = []
  let used = 0
  for (const file of files) {
    let raw: string
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const body = stripFrontMatter(raw)
    if (!body) continue
    const clipped =
      body.length > VOICE_FILE_BUDGET ? `${body.slice(0, VOICE_FILE_BUDGET)}…` : body
    // `continue`, not `break`: one oversized exemplar must not suppress
    // every smaller one that follows — keep filling the remaining budget.
    if (used + clipped.length > VOICE_SECTION_BUDGET) continue
    passages.push(clipped)
    used += clipped.length
  }
  if (passages.length === 0) return ''

  return (
    `${VOICE_SECTION_HEADER} — the writer's own prose. Match this VOICE (rhythm, ` +
    'diction, sentence shape, imagery) when drafting or polishing; these are style, ' +
    'not story facts:\n\n' +
    passages.map((p, i) => `--- exemplar ${i + 1} ---\n${p}`).join('\n\n')
  )
}
