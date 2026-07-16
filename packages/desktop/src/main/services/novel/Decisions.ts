/**
 * Decisions log — durable CREATIVE CHOICES with their reasons, so no
 * agent relitigates a settled question or resurrects a direction the
 * writer killed ("the sister stays dead — stop suggesting her return").
 *
 * Deliberately a NORMAL project file (`bible/decisions.md`), not
 * .wordbird-internal state: that way every file mechanism applies for
 * free — the writer edits it directly, turn-scoped freshness flags
 * out-of-band edits, WRITER'S VANTAGE reports it open/selected, agents
 * amend it through the review-gated propose_* tools, and snapshots/
 * search cover it. `record_decision` appends; the format is parseable
 * but tolerant of hand edits. A `locked: true` front matter makes it
 * writer-only, like any bible page.
 */

import fs from 'fs'
import path from 'path'
import { isLockedCanon } from '../ai/pathGuards'

export const DECISIONS_FILE = path.join('bible', 'decisions.md')

export interface DecisionEntry {
  date: string
  decision: string
  reason?: string
}

const HEADER =
  '# Decisions\n\n' +
  'Settled creative choices — Biscuit records them and never relitigates ' +
  'them. Edit or delete freely; this file is yours.\n\n'

const ENTRY_RE = /^- \*\*(\d{4}-\d{2}-\d{2})\*\*\s+—\s+(.+?)(?:\s+_Why:\s*(.+?)_)?\s*$/

export const formatDecision = (entry: DecisionEntry): string =>
  `- **${entry.date}** — ${entry.decision}${entry.reason ? ` _Why: ${entry.reason}_` : ''}`

/** Tolerant parse: only lines matching the entry shape count; everything
 * else (headings, the writer's own prose) is preserved but not listed. */
export const parseDecisions = (content: string): DecisionEntry[] => {
  const entries: DecisionEntry[] = []
  for (const line of content.split('\n')) {
    const match = ENTRY_RE.exec(line.trim())
    if (!match) continue
    entries.push({
      date: match[1],
      decision: match[2].trim(),
      ...(match[3] ? { reason: match[3].trim() } : {})
    })
  }
  return entries
}

export const listDecisions = (projectRoot: string): DecisionEntry[] => {
  try {
    return parseDecisions(fs.readFileSync(path.join(projectRoot, DECISIONS_FILE), 'utf8'))
  } catch {
    return []
  }
}

export const appendDecision = (
  projectRoot: string,
  decision: string,
  reason?: string
): DecisionEntry => {
  const target = path.join(projectRoot, DECISIONS_FILE)
  let content = ''
  try {
    content = fs.readFileSync(target, 'utf8')
  } catch {
    // First decision creates the file.
  }
  if (content && isLockedCanon(content)) {
    throw new Error(
      'bible/decisions.md is LOCKED canon (locked: true) — only the writer can change it.'
    )
  }
  const entry: DecisionEntry = {
    date: new Date().toISOString().slice(0, 10),
    decision: decision.trim(),
    ...(reason?.trim() ? { reason: reason.trim() } : {})
  }
  const base = content ? content.replace(/\s*$/, '') + '\n' : HEADER
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, base + formatDecision(entry) + '\n', 'utf8')
  return entry
}
