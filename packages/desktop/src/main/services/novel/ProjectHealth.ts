/**
 * ProjectHealth — the deterministic half of the overseeing layer.
 *
 * After agents (or the writer) change a project, these checks answer
 * "is everything around the prose still in sync?" WITHOUT an LLM:
 * missing per-scene metadata (exactly what the corkboard/outline/
 * timeline render), stale summaries, characters that appear in prose
 * but have no bible page, binder-vs-disk drift, and hygiene counts.
 * The steward role starts from this report and fixes what it can; the
 * brief carries a one-line digest until the project is clean.
 *
 * Cached on an mtime/size signature (EntityIndex pattern) so per-turn
 * brief builds stay cheap.
 */

import fs from 'fs'
import path from 'path'
import { structureService, collectLeaves } from './StructureService'
import { continuityService } from './ContinuityService'
import { factService } from './FactService'
import { getEntityIndex } from './EntityIndex'
import type { INovelUnit } from '../../../shared/types/novel'

export interface HealthFinding {
  id: string
  severity: 'warn' | 'info'
  category:
    | 'missing-meta'
    | 'stale-summary'
    | 'unlisted-entity'
    | 'binder-drift'
    | 'empty-final'
    | 'plans'
    | 'hygiene'
  message: string
  /** Affected unit ids / files, when the finding is about specific items. */
  items?: string[]
  suggestion?: string
}

export interface HealthReport {
  generatedAt: number
  signature: string
  /** True when no warn-severity findings exist. */
  clean: boolean
  findings: HealthFinding[]
}

const META_FIELDS = ['synopsis', 'status', 'pov', 'when', 'thread'] as const

/** Words that start sentences constantly and capitalize regardless. */
const NAME_STOPWORDS = new Set(
  (
    'The A An And But Or So Then When While After Before As If It He She They We You I ' +
    'His Her Their Its My Your Our This That These Those There Here Not No Yes Now Once ' +
    'What Why How Where Who Which Chapter Scene Part Mr Mrs Ms Dr'
  )
    .split(' ')
    .map((w) => w.toLowerCase())
)

const MAX_PROSE_BYTES = 512 * 1024

/** Signature over everything the checks read — cache invalidation key. */
const computeSignature = (root: string): string => {
  const parts: string[] = []
  const statOne = (p: string): void => {
    try {
      const st = fs.statSync(p)
      parts.push(`${p}:${st.mtimeMs}:${st.size}`)
    } catch {
      parts.push(`${p}:gone`)
    }
  }
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.wordbird') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.wordbird') {
          // structure.json is rewritten on every reconcile — key on its
          // CONTENT, not its mtime, or the cache can never hit.
          try {
            parts.push(`structure:${hashish(fs.readFileSync(path.join(full, 'structure.json'), 'utf8'))}`)
          } catch {
            parts.push('structure:gone')
          }
          walk(path.join(full, 'summaries'), depth + 1)
          statOne(path.join(full, 'continuity', 'issues.json'))
          statOne(path.join(full, 'continuity', 'facts.json'))
          continue
        }
        if (['manuscript', 'scenes', 'bible', 'plans'].includes(entry.name) || depth > 0) {
          walk(full, depth + 1)
        }
        continue
      }
      if (/\.(md|markdown|json)$/i.test(entry.name)) statOne(full)
    }
  }
  walk(root, 0)
  return `${parts.length}:${parts.join('|').length}:${hashish(parts.join('|'))}`
}

const hashish = (text: string): string => {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return String(h)
}

/** Mine capitalized name candidates from prose (conservative). */
export const mineNameCandidates = (
  files: Array<{ file: string; text: string }>,
  knownNames: Set<string>
): string[] => {
  // candidate -> set of files, total count. Multi-word candidates
  // ("Ilsabet Crane") are strong name signals ANYWHERE, sentence-start
  // included; single capitalized words only count mid-sentence (else
  // every "Suddenly" would qualify).
  const seen = new Map<string, { files: Set<string>; count: number }>()
  const anyPos = /([A-Z][a-z]{2,}\s[A-Z][a-z]{2,})/g
  const midSentence = /[^.!?"'\n]\s([A-Z][a-z]{2,})(?!\s[A-Z])/g
  for (const { file, text } of files) {
    // Lowercase-word inventory: a "name" that also appears lowercased is
    // an ordinary word, not a character.
    const lowerWords = new Set(
      (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).map((w) => w)
    )
    const consider = (candidate: string): void => {
      const parts = candidate.split(/\s+/)
      if (parts.some((p) => NAME_STOPWORDS.has(p.toLowerCase()))) return
      if (parts.length === 1 && lowerWords.has(candidate.toLowerCase())) return
      if (knownNames.has(candidate.toLowerCase())) return
      if (parts.some((p) => knownNames.has(p.toLowerCase()))) return
      const entry = seen.get(candidate) ?? { files: new Set<string>(), count: 0 }
      entry.files.add(file)
      entry.count += 1
      seen.set(candidate, entry)
    }
    for (const match of text.matchAll(anyPos)) consider(match[1].trim())
    for (const match of text.matchAll(midSentence)) consider(match[1].trim())
  }
  return [...seen.entries()]
    .filter(([, v]) => v.count >= 3 && v.files.size >= 2)
    .map(([name]) => name)
    .sort()
    .slice(0, 12)
}

const cache = new Map<string, HealthReport>()

export const checkProjectHealth = async(root: string): Promise<HealthReport> => {
  // Reconcile FIRST: loadReconciled may rewrite structure.json (pruning
  // vanished units, appending new files) — the signature must be taken
  // over the settled state or the cache can never hit.
  // Raw manifest read BEFORE reconciliation: this is the only view that
  // still shows units whose prose files vanished.
  let rawLeafPaths: Array<{ id: string; path?: string }> = []
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    ) as { units?: INovelUnit[] }
    rawLeafPaths = collectLeaves(raw.units ?? []).map((u) => ({ id: u.id, path: u.path }))
  } catch {
    // No manifest yet — reconciliation will create one.
  }
  const structure = await structureService.loadReconciled(root)
  const signature = computeSignature(root)
  const cached = cache.get(root)
  if (cached && cached.signature === signature) return cached

  const findings: HealthFinding[] = []
  const leaves = collectLeaves(structure.units)

  // ---- missing-meta: what the corkboard/outline/timeline render ----
  for (const field of META_FIELDS) {
    const missing = leaves.filter((u) => {
      const value = (u as unknown as Record<string, unknown>)[field]
      return value === undefined || value === null || String(value).trim() === ''
    })
    if (missing.length > 0) {
      findings.push({
        id: `missing-${field}`,
        severity: field === 'thread' ? 'info' : 'warn',
        category: 'missing-meta',
        message: `${missing.length} scene${missing.length === 1 ? '' : 's'} missing ${field}`,
        items: missing.map((u) => u.id),
        suggestion:
          'update_unit_meta fills these — infer from the prose (a steward reads the scene and sets it).'
      })
    }
  }

  // ---- stale-summaries ----
  const staleSummaries: string[] = []
  let newestProse = 0
  for (const unit of leaves) {
    if (!unit.path) continue
    let proseM = 0
    try {
      proseM = fs.statSync(path.join(root, unit.path)).mtimeMs
    } catch {
      continue
    }
    newestProse = Math.max(newestProse, proseM)
    try {
      const sumM = fs.statSync(path.join(root, '.wordbird', 'summaries', `${unit.id}.md`)).mtimeMs
      if (sumM < proseM) staleSummaries.push(unit.id)
    } catch {
      if ((unit.wordCount ?? 0) > 0) staleSummaries.push(unit.id)
    }
  }
  if (staleSummaries.length > 0) {
    findings.push({
      id: 'stale-summaries',
      severity: 'warn',
      category: 'stale-summary',
      message: `${staleSummaries.length} summar${staleSummaries.length === 1 ? 'y is' : 'ies are'} missing or older than the prose`,
      items: staleSummaries,
      suggestion: 'update_summary after reading each unit.'
    })
  }
  try {
    const bookM = fs.statSync(path.join(root, '.wordbird', 'summaries', 'book.md')).mtimeMs
    if (newestProse > 0 && bookM < newestProse) {
      findings.push({
        id: 'stale-book-summary',
        severity: 'info',
        category: 'stale-summary',
        message: 'book.md is older than the newest prose',
        suggestion: 'refresh the whole-book summary after unit summaries.'
      })
    }
  } catch {
    // No book summary yet — the per-unit finding already covers young projects.
  }

  // ---- unlisted entities (prose names without bible pages) ----
  try {
    const index = await getEntityIndex(root)
    const known = new Set<string>()
    for (const entity of index.entities) {
      known.add(entity.name.toLowerCase())
      for (const alias of entity.aliases) known.add(alias.toLowerCase())
    }
    const proseTexts: Array<{ file: string; text: string }> = []
    for (const unit of leaves) {
      if (!unit.path) continue
      try {
        const full = path.join(root, unit.path)
        if (fs.statSync(full).size > MAX_PROSE_BYTES) continue
        proseTexts.push({ file: unit.path, text: fs.readFileSync(full, 'utf8') })
      } catch {
        // handled by binder-drift below
      }
    }
    const candidates = mineNameCandidates(proseTexts, known)
    if (candidates.length > 0) {
      findings.push({
        id: 'unlisted-entities',
        severity: 'warn',
        category: 'unlisted-entity',
        message:
          `${candidates.length} recurring name${candidates.length === 1 ? '' : 's'} with no bible page: ` +
          candidates.join(', '),
        items: candidates,
        suggestion:
          'Verify each in the prose; real characters/places get a bible page via propose_new_file (with aliases).'
      })
    }
  } catch {
    // Entity index unavailable — skip, never break the report.
  }

  // ---- binder-vs-disk drift ----
  const missingFiles = rawLeafPaths.filter(
    (u) => u.path && !fs.existsSync(path.join(root, u.path))
  )
  if (missingFiles.length > 0) {
    findings.push({
      id: 'binder-missing-files',
      severity: 'warn',
      category: 'binder-drift',
      message: `${missingFiles.length} binder unit${missingFiles.length === 1 ? "'s file is" : "s' files are"} missing on disk`,
      items: missingFiles.map((u) => `${u.id} → ${u.path}`),
      suggestion: 'Restore from History or remove the unit (writer decision — log it).'
    })
  }
  const knownPaths = new Set(rawLeafPaths.map((u) => u.path).filter(Boolean))
  const proseDirs = ['manuscript', 'scenes']
  const orphans: string[] = []
  for (const dirName of proseDirs) {
    const walk = (dir: string): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.(md|markdown|txt)$/i.test(entry.name)) {
          const rel = path.relative(root, full).split(path.sep).join('/')
          if (!knownPaths.has(rel)) orphans.push(rel)
        }
      }
    }
    walk(path.join(root, dirName))
  }
  if (orphans.length > 0) {
    findings.push({
      id: 'orphan-files',
      severity: 'warn',
      category: 'binder-drift',
      message: `${orphans.length} prose file${orphans.length === 1 ? '' : 's'} were outside the binder (auto-adopted at the top level — verify placement)`,
      items: orphans,
      suggestion: 'restructure_unit them into the right chapter, or ask the writer.'
    })
  }

  // ---- empty-final ----
  const emptyFinal = leaves.filter((u) => u.status === 'final' && (u.wordCount ?? 0) === 0)
  if (emptyFinal.length > 0) {
    findings.push({
      id: 'empty-final',
      severity: 'warn',
      category: 'empty-final',
      message: `${emptyFinal.length} unit${emptyFinal.length === 1 ? ' is' : 's are'} marked final with zero words`,
      items: emptyFinal.map((u) => u.id)
    })
  }

  // ---- plans with open items ----
  try {
    const plansDir = path.join(root, 'plans')
    let unchecked = 0
    let planCount = 0
    for (const entry of fs.readdirSync(plansDir)) {
      if (!/\.(md|markdown|txt)$/i.test(entry)) continue
      planCount += 1
      const text = fs.readFileSync(path.join(plansDir, entry), 'utf8')
      unchecked += (text.match(/^\s*[-*] \[ \]/gm) ?? []).length
    }
    if (unchecked > 0) {
      findings.push({
        id: 'open-plan-items',
        severity: 'info',
        category: 'plans',
        message: `${unchecked} unchecked item${unchecked === 1 ? '' : 's'} across ${planCount} plan${planCount === 1 ? '' : 's'}`
      })
    }
  } catch {
    // No plans dir.
  }

  // ---- hygiene counts (info) ----
  try {
    const openIssues = (await continuityService.list(root)).filter((i) => i.status === 'open')
    if (openIssues.length > 0) {
      findings.push({
        id: 'open-continuity',
        severity: 'info',
        category: 'hygiene',
        message: `${openIssues.length} open continuity issue${openIssues.length === 1 ? '' : 's'}`
      })
    }
  } catch {
    /* none */
  }
  try {
    const facts = await factService.list(root)
    if (leaves.some((u) => (u.wordCount ?? 0) > 0) && facts.length === 0) {
      findings.push({
        id: 'no-facts',
        severity: 'info',
        category: 'hygiene',
        message: 'Prose exists but the fact ledger is empty',
        suggestion: 'record_fact durable canon during the next audit/steward pass.'
      })
    }
  } catch {
    /* none */
  }

  const report: HealthReport = {
    generatedAt: Date.now(),
    signature,
    clean: !findings.some((f) => f.severity === 'warn'),
    findings
  }
  cache.set(root, report)
  return report
}

/** One compact line for the brief ('' when clean of warnings). */
export const healthBriefLine = (report: HealthReport): string => {
  const warns = report.findings.filter((f) => f.severity === 'warn')
  if (warns.length === 0) return ''
  return (
    'PROJECT HEALTH: ' +
    warns.map((f) => f.message).join(' · ') +
    ' (project_health for details — a steward pass fixes these)'
  )
}

export const clearHealthCache = (): void => {
  cache.clear()
}

export type { INovelUnit }
