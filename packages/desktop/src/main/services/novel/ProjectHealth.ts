/**
 * ProjectHealth — the deterministic half of the overseeing layer.
 *
 * After agents (or the writer) change a project, these checks answer
 * "is everything around the prose still in sync?" WITHOUT an LLM:
 * missing per-scene metadata (exactly what the corkboard/outline/
 * timeline render), stale summaries, characters that appear in prose
 * but have no bible page, forked canon in the fact ledger, binder-vs-
 * disk drift, dangling references in facts/issues/summaries, silently
 * truncated standing instructions, and knowledge-store hygiene. The
 * steward role starts from this report and fixes what it can; the
 * brief carries a one-line digest until the project is clean.
 *
 * Cached on an mtime/size signature (EntityIndex pattern) so per-turn
 * brief builds stay cheap. A check that errors is REPORTED as a
 * finding (health-check-errors), never silently skipped.
 */

import fs from 'fs'
import path from 'path'
import { structureService, collectLeaves, listFilesRecursive } from './StructureService'
import { continuityService } from './ContinuityService'
import { factService } from './FactService'
import {
  getEntityIndex,
  listBiblePages,
  computeEntityInputsSignature,
  type IEntityIndex
} from './EntityIndex'
import { readProjectMeta } from './ProjectMeta'
import { revisionService } from './RevisionService'
import { listSkills, readPinnedSkills } from './Skills'
import { ENTRY_RE as DECISION_ENTRY_RE } from './Decisions'
import { HARNESS_MARKER_RE } from '../ai/coherencePass'
import { parseBannedTerms } from './ProseLint'
import type { INovelUnit, NovelUnitStatus } from '../../../shared/types/novel'

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
    | 'facts'
    | 'structure'
    | 'instructions'
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

/**
 * biscuit.md rides every brief verbatim up to this cap; past it the tail
 * is silently dropped, so the health engine warns instead. ContextBuilder
 * imports this so the cap and the warning can never drift apart.
 */
export const MAX_INSTRUCTIONS_CHARS = 2000

/** An "active" revision untouched this long is presumed abandoned. */
const STALE_REVISION_MS = 14 * 86_400_000

const VALID_STATUSES: readonly string[] = [
  'idea',
  'draft',
  'revised',
  'final'
] satisfies readonly NovelUnitStatus[]

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

/** Pathological-tree bound for the signature walk (replaces a depth cap). */
const MAX_SIGNATURE_PARTS = 8000

/** Signature over everything the checks read — cache invalidation key. */
const computeSignature = (
  root: string,
  extras: { rawManifest: string; leafPaths: string[] }
): string => {
  const parts: string[] = []
  const visited = new Set<string>()
  const statOne = (p: string): void => {
    visited.add(p)
    try {
      const st = fs.statSync(p)
      parts.push(`${p}:${st.mtimeMs}:${st.size}`)
    } catch {
      parts.push(`${p}:gone`)
    }
  }
  const walk = (dir: string, depth: number): void => {
    if (parts.length > MAX_SIGNATURE_PARTS) return
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
          walk(path.join(full, 'revisions'), depth + 1)
          statOne(path.join(full, 'continuity', 'issues.json'))
          statOne(path.join(full, 'continuity', 'facts.json'))
          statOne(path.join(full, 'project.json'))
          statOne(path.join(full, 'agent-state', 'session.json'))
          continue
        }
        if (
          ['manuscript', 'scenes', 'bible', 'plans', 'skills'].includes(entry.name) ||
          depth > 0
        ) {
          walk(full, depth + 1)
        }
        continue
      }
      if (/\.(md|markdown|txt|json)$/i.test(entry.name)) statOne(full)
    }
  }
  walk(root, 0)
  // Structure leaves can live outside the walked dirs — stat every one
  // the checks will read (stale-summary/name-mining inputs).
  for (const relative of extras.leafPaths) {
    const full = path.join(root, relative)
    if (!visited.has(full)) statOne(full)
  }
  // The binder-missing-files check reads the RAW (pre-reconcile) manifest;
  // hash it so reconcile pruning invalidates the cached finding.
  parts.push(`rawstructure:${hashish(extras.rawManifest)}`)
  // Pin the entity-derived checks to exactly what the index derives from.
  parts.push(
    `entities:${computeEntityInputsSignature(root, [...listBiblePages(root), ...extras.leafPaths])}`
  )
  // Time-based checks (stale revisions) must be able to re-fire without a
  // file changing — one recompute per day is cheap.
  parts.push(`day:${Math.floor(Date.now() / 86_400_000)}`)
  return `${parts.length}:${parts.join('|').length}:${hashish(parts.join('|'))}`
}

const hashish = (text: string): string => {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return String(h)
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
  // "Mr Crane" can never match the patterns above (Mr is 2 letters and a
  // stopword) — mine the surname behind an honorific separately.
  const honorific = /\b(?:Mr|Mrs|Ms|Dr)\.?\s([A-Z][a-z]{2,})\b/g
  for (const { file, text } of files) {
    // Lowercase-word inventory: a "name" that also appears lowercased in
    // the ORIGINAL prose is an ordinary word, not a character. (Building
    // this from text.toLowerCase() would put every name in its own
    // inventory and reject all single-word candidates.)
    const lowerWords = new Set(
      (text.match(/\b[a-z]{3,}\b/g) ?? []).map((w) => w)
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
    for (const match of text.matchAll(honorific)) consider(match[1].trim())
  }
  // Recurrence across files is the usual bar; single-file projects (flat
  // flavor) get coverage at a raised count so one file can't spam names.
  return [...seen.entries()]
    .filter(
      ([, v]) =>
        v.count >= 3 && (v.files.size >= 2 || (files.length === 1 && v.count >= 5))
    )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([name]) => name)
    .sort()
}

const collectAllUnits = (units: INovelUnit[]): INovelUnit[] => {
  const all: INovelUnit[] = []
  const walk = (list: INovelUnit[]): void => {
    for (const unit of list) {
      all.push(unit)
      if (unit.children) walk(unit.children)
    }
  }
  walk(units)
  return all
}

const cache = new Map<string, HealthReport>()

export const checkProjectHealth = async(root: string): Promise<HealthReport> => {
  // Raw manifest read BEFORE reconciliation: this is the only view that
  // still shows units whose prose files vanished.
  let rawManifest = ''
  let rawLeafPaths: Array<{ id: string; path?: string }> = []
  try {
    rawManifest = fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    const raw = JSON.parse(rawManifest) as { units?: INovelUnit[] }
    rawLeafPaths = collectLeaves(raw.units ?? []).map((u) => ({ id: u.id, path: u.path }))
  } catch {
    // No manifest yet — reconciliation will create one.
  }
  // Reconcile FIRST: loadReconciled may rewrite structure.json (pruning
  // vanished units, appending new files) — the signature must be taken
  // over the settled state or the cache can never hit.
  const structure = await structureService.loadReconciled(root)
  const leaves = collectLeaves(structure.units)
  const allUnits = collectAllUnits(structure.units)
  const signature = computeSignature(root, {
    rawManifest,
    leafPaths: leaves.map((u) => u.path).filter((p): p is string => !!p)
  })
  const cached = cache.get(root)
  if (cached && cached.signature === signature) return cached

  const findings: HealthFinding[] = []
  // A check that throws must surface, not vanish — collect and report.
  const failures: string[] = []
  const guarded = async(name: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn()
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

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

  // ---- structure integrity: what the binder/compile rely on ----
  const idCounts = new Map<string, number>()
  const pathCounts = new Map<string, number>()
  for (const unit of allUnits) {
    idCounts.set(unit.id, (idCounts.get(unit.id) ?? 0) + 1)
    if (unit.path) pathCounts.set(unit.path, (pathCounts.get(unit.path) ?? 0) + 1)
  }
  const dupIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  if (dupIds.length > 0) {
    findings.push({
      id: 'duplicate-unit-ids',
      severity: 'warn',
      category: 'structure',
      message: `${dupIds.length} unit id${dupIds.length === 1 ? ' is' : 's are'} duplicated in the binder (id-based tools only ever see the first)`,
      items: dupIds.slice(0, 12)
    })
  }
  const dupPaths = [...pathCounts.entries()].filter(([, n]) => n > 1).map(([p]) => p)
  if (dupPaths.length > 0) {
    findings.push({
      id: 'duplicate-unit-paths',
      severity: 'warn',
      category: 'structure',
      message: `${dupPaths.length} file path${dupPaths.length === 1 ? ' is' : 's are'} claimed by multiple binder units`,
      items: dupPaths.slice(0, 12)
    })
  }
  const invalidStatus = allUnits.filter(
    (u) => u.status !== undefined && !VALID_STATUSES.includes(String(u.status))
  )
  if (invalidStatus.length > 0) {
    findings.push({
      id: 'invalid-unit-status',
      severity: 'warn',
      category: 'structure',
      message:
        `${invalidStatus.length} unit${invalidStatus.length === 1 ? ' has' : 's have'} an invalid status ` +
        `(valid: ${VALID_STATUSES.join('/')})`,
      items: invalidStatus.slice(0, 12).map((u) => `${u.id}: ${String(u.status)}`),
      suggestion: 'update_unit_meta with one of the valid statuses.'
    })
  }
  const emptyContainers = allUnits.filter(
    (u) => !u.path && u.children !== undefined && collectLeaves([u]).length === 0
  )
  if (emptyContainers.length > 0) {
    findings.push({
      id: 'empty-containers',
      severity: 'info',
      category: 'structure',
      message: `${emptyContainers.length} part/chapter container${emptyContainers.length === 1 ? ' has' : 's have'} no scenes beneath`,
      items: emptyContainers.slice(0, 12).map((u) => `${u.title} (${u.id})`)
    })
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

  // ---- orphan summaries (units deleted, summaries left behind) ----
  await guarded('orphan-summaries', () => {
    const summariesDir = path.join(root, '.wordbird', 'summaries')
    let entries: string[]
    try {
      entries = fs.readdirSync(summariesDir)
    } catch {
      return
    }
    const knownIds = new Set(allUnits.map((u) => u.id))
    const orphaned = entries.filter(
      (name) => /\.md$/i.test(name) && name !== 'book.md' && !knownIds.has(name.replace(/\.md$/i, ''))
    )
    if (orphaned.length > 0) {
      findings.push({
        id: 'orphan-summaries',
        severity: 'info',
        category: 'hygiene',
        message: `${orphaned.length} summary file${orphaned.length === 1 ? '' : 's'} belong to deleted units`,
        items: orphaned.slice(0, 12),
        suggestion:
          'Housekeeping — the app removes these when units are deleted; safe to ignore.'
      })
    }
  })

  // ---- entity-derived checks (shared index + shared prose read) ----
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
  const totalWords = leaves.reduce((sum, u) => sum + (u.wordCount ?? 0), 0)
  let entityIndex: IEntityIndex | null = null
  await guarded('entity-index', async() => {
    entityIndex = await getEntityIndex(root)
  })
  await guarded('unlisted-entities', () => {
    if (!entityIndex) return
    const known = new Set<string>()
    for (const entity of entityIndex.entities) {
      known.add(entity.name.toLowerCase())
      for (const alias of entity.aliases) known.add(alias.toLowerCase())
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
  })
  await guarded('bible-page-checks', () => {
    if (!entityIndex) return
    // A term claimed by two pages double-counts in WHO'S WHERE and makes
    // where_appears ambiguous — always drift, never intent.
    const claims = new Map<string, Set<string>>()
    for (const entity of entityIndex.entities) {
      for (const term of [entity.name, ...entity.aliases]) {
        const key = term.trim().toLowerCase()
        if (!key) continue
        const pages = claims.get(key) ?? new Set<string>()
        pages.add(entity.page)
        claims.set(key, pages)
      }
    }
    const duplicated = [...claims.entries()].filter(([, pages]) => pages.size > 1)
    if (duplicated.length > 0) {
      findings.push({
        id: 'duplicate-aliases',
        severity: 'warn',
        category: 'unlisted-entity',
        message: `${duplicated.length} name/alias${duplicated.length === 1 ? ' is' : 'es are'} claimed by multiple bible pages (entity tracking double-counts them)`,
        items: duplicated
          .slice(0, 12)
          .map(([term, pages]) => `${term}: ${[...pages].join(' + ')}`),
        suggestion: 'propose_bible_update on the page that should yield the alias.'
      })
    }
    // Info only: planned-but-unwritten characters are normal workflow.
    if (totalWords > 0) {
      const orphanPages = entityIndex.entities.filter((e) => e.appearances.length === 0)
      if (orphanPages.length > 0) {
        findings.push({
          id: 'orphan-bible-pages',
          severity: 'info',
          category: 'unlisted-entity',
          message: `${orphanPages.length} bible page${orphanPages.length === 1 ? '' : 's'} describe entities that appear in no scene`,
          items: orphanPages.slice(0, 12).map((e) => `${e.name} (${e.page})`)
        })
      }
    }
    const noAliases = entityIndex.entities.filter((e) => e.aliases.length === 0)
    if (noAliases.length > 0) {
      findings.push({
        id: 'missing-aliases',
        severity: 'info',
        category: 'unlisted-entity',
        message: `${noAliases.length} bible page${noAliases.length === 1 ? ' has' : 's have'} no aliases list (degrades entity tracking and WHO'S WHERE)`,
        items: noAliases.slice(0, 12).map((e) => e.page),
        suggestion: 'propose_bible_update adding front-matter aliases.'
      })
    }
  })

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

  // ---- fact-ledger integrity ----
  await guarded('facts', async() => {
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
    // Forked canon: same subject+relation, different object. The ledger's
    // whole promise is that this gets CAUGHT — deterministically.
    const groups = new Map<string, { label: string; objects: Map<string, string> }>()
    for (const fact of facts) {
      const key = `${fact.subject.trim().toLowerCase()}\u0000${fact.relation.trim().toLowerCase()}`
      const group =
        groups.get(key) ?? { label: `${fact.subject} — ${fact.relation}`, objects: new Map() }
      const objKey = fact.object.trim().toLowerCase()
      if (!group.objects.has(objKey)) group.objects.set(objKey, fact.object)
      groups.set(key, group)
    }
    const contradictions = [...groups.values()].filter((g) => g.objects.size > 1)
    if (contradictions.length > 0) {
      findings.push({
        id: 'contradictory-facts',
        severity: 'warn',
        category: 'facts',
        message: `${contradictions.length} fact pair${contradictions.length === 1 ? '' : 's'} contradict each other (forked canon)`,
        items: contradictions
          .slice(0, 12)
          .map((g) => `${g.label}: ${[...g.objects.values()].join(' ≠ ')}`),
        suggestion:
          'Canon question — log_continuity_issue quoting both facts; an auditor (or the writer) resolves which is true.'
      })
    }
    const unitIds = new Set(allUnits.map((u) => u.id))
    const dangling = facts.filter((f) => f.sourceUnitId && !unitIds.has(f.sourceUnitId))
    if (dangling.length > 0) {
      findings.push({
        id: 'orphan-fact-sources',
        severity: 'info',
        category: 'facts',
        message: `${dangling.length} fact${dangling.length === 1 ? '' : 's'} cite a source unit that no longer exists`,
        items: dangling
          .slice(0, 12)
          .map((f) => `${f.subject} ${f.relation} ${f.object} (source ${f.sourceUnitId})`)
      })
    }
  })

  // ---- continuity issues: open count + dangling paths ----
  await guarded('continuity', async() => {
    const issues = await continuityService.list(root)
    const openIssues = issues.filter((i) => i.status === 'open')
    if (openIssues.length > 0) {
      findings.push({
        id: 'open-continuity',
        severity: 'info',
        category: 'hygiene',
        message: `${openIssues.length} open continuity issue${openIssues.length === 1 ? '' : 's'}`
      })
    }
    const danglingIssues: string[] = []
    for (const issue of openIssues) {
      const gone = (issue.relatedPaths ?? []).filter(
        (p) => typeof p === 'string' && p.trim() && !fs.existsSync(path.join(root, p))
      )
      if (gone.length > 0) danglingIssues.push(`${issue.title}: ${gone.join(', ')}`)
    }
    if (danglingIssues.length > 0) {
      findings.push({
        id: 'orphan-issue-paths',
        severity: 'info',
        category: 'hygiene',
        message: `${danglingIssues.length} open issue${danglingIssues.length === 1 ? ' references' : 's reference'} files that no longer exist`,
        items: danglingIssues.slice(0, 10)
      })
    }
  })

  // ---- plans with open items (recursive — plans/done/… count too) ----
  try {
    const plansDir = path.join(root, 'plans')
    let unchecked = 0
    let planCount = 0
    for (const entry of listFilesRecursive(plansDir, /\.(md|markdown|txt)$/i)) {
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

  // ---- standing instructions silently truncated ----
  await guarded('biscuit', () => {
    let instructions = ''
    try {
      instructions = fs.readFileSync(path.join(root, 'biscuit.md'), 'utf8').trim()
    } catch {
      return
    }
    if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
      findings.push({
        id: 'biscuit-overflow',
        severity: 'warn',
        category: 'instructions',
        message:
          `biscuit.md is ${instructions.length} chars — everything past ${MAX_INSTRUCTIONS_CHARS} ` +
          'is silently dropped from every brief',
        suggestion:
          'Report this verbatim to the writer: trim biscuit.md (move detail into skills/) so all standing instructions apply.'
      })
    }
  })

  // ---- stale in-flight revisions ----
  await guarded('revisions', async() => {
    const active = await revisionService.listActive(root)
    const stale = active.filter((r) => {
      const started = Date.parse(r.createdAt)
      return Number.isFinite(started) && Date.now() - started > STALE_REVISION_MS
    })
    if (stale.length > 0) {
      findings.push({
        id: 'stale-revisions',
        severity: 'info',
        category: 'hygiene',
        message: `${stale.length} revision${stale.length === 1 ? '' : 's'} have been "active" for over 14 days`,
        items: stale.slice(0, 6).map((r) => `${r.title} (${r.id})`),
        suggestion: 'complete_revision or ask the writer whether to abandon them.'
      })
    }
  })

  // ---- writing-method contract ----
  await guarded('template', () => {
    const meta = readProjectMeta(root)
    const hasBeatSheet = fs.existsSync(path.join(root, 'bible', 'structure.md'))
    if (meta.structureTemplate !== 'unset' && !hasBeatSheet) {
      findings.push({
        id: 'template-mismatch',
        severity: 'info',
        category: 'hygiene',
        message: `structureTemplate "${meta.structureTemplate}" is set but bible/structure.md (the beat sheet) is missing`
      })
    } else if (meta.structureTemplate === 'unset' && hasBeatSheet) {
      findings.push({
        id: 'template-mismatch',
        severity: 'info',
        category: 'hygiene',
        message: 'bible/structure.md exists but no structureTemplate is recorded in the writing method'
      })
    }
  })

  // ---- banned terms swept project-wide (style.md is canon) ----
  await guarded('banned-terms', () => {
    let style = ''
    try {
      style = fs.readFileSync(path.join(root, 'bible', 'style.md'), 'utf8')
    } catch {
      return
    }
    const terms = parseBannedTerms(style)
    if (terms.length === 0 || proseTexts.length === 0) return
    let total = 0
    const hits: string[] = []
    for (const { file, text } of proseTexts) {
      for (const term of terms) {
        const count = (text.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi')) ?? []).length
        if (count > 0) {
          total += count
          if (hits.length < 10) hits.push(`${file}: ${term} (×${count})`)
        }
      }
    }
    if (total > 0) {
      findings.push({
        id: 'banned-terms',
        severity: 'info',
        category: 'hygiene',
        message: `${total} banned-term hit${total === 1 ? '' : 's'} across the manuscript (style.md list)`,
        items: hits,
        suggestion: 'lint_prose the affected units; line-editors fix via propose_text_edit.'
      })
    }
  })

  // ---- knowledge-store hygiene (skills, pins, decisions) ----
  await guarded('knowledge', () => {
    const issues: string[] = []
    const skills = listSkills(root)
    const byName = new Map<string, string[]>()
    for (const skill of skills) {
      const key = skill.name.trim().toLowerCase()
      byName.set(key, [...(byName.get(key) ?? []), skill.file])
    }
    for (const [name, files] of byName) {
      if (files.length > 1) {
        issues.push(`skill name "${name}" is used by ${files.join(' + ')} (only the first is reachable)`)
      }
    }
    // skills/ and biscuit.md are WRITER-ONLY trust surfaces injected
    // verbatim into every brief — a harness-frame lookalike inside one
    // is a possible instruction injection the writer should review.
    const pinnedFiles = readPinnedSkills(root)
    for (const file of pinnedFiles) {
      try {
        const body = fs.readFileSync(path.join(root, 'skills', file), 'utf8')
        HARNESS_MARKER_RE.lastIndex = 0
        if (HARNESS_MARKER_RE.test(body)) {
          issues.push(
            `pinned skill ${file} contains a harness-frame lookalike (possible instruction injection — review it)`
          )
        }
      } catch {
        // Missing pins are reported separately.
      }
    }
    try {
      const biscuit = fs.readFileSync(path.join(root, 'biscuit.md'), 'utf8')
      HARNESS_MARKER_RE.lastIndex = 0
      if (HARNESS_MARKER_RE.test(biscuit)) {
        issues.push(
          'biscuit.md contains a harness-frame lookalike (possible instruction injection — review it)'
        )
      }
    } catch {
      // No biscuit.md.
    }
    const skillFiles = new Set(skills.map((s) => s.file.toLowerCase()))
    for (const pin of readPinnedSkills(root)) {
      if (!skillFiles.has(pin.toLowerCase())) {
        issues.push(`pinned skill file not found: ${pin} (the pin is silently ignored)`)
      }
    }
    try {
      const decisions = fs.readFileSync(path.join(root, 'bible', 'decisions.md'), 'utf8')
      let malformed = 0
      for (const line of decisions.split('\n')) {
        const trimmed = line.trim()
        if (/^- \*\*/.test(trimmed) && !DECISION_ENTRY_RE.test(trimmed)) malformed += 1
      }
      if (malformed > 0) {
        issues.push(
          `${malformed} decisions.md line${malformed === 1 ? '' : 's'} look like entries but do not parse (invisible to list_decisions)`
        )
      }
    } catch {
      // No decisions file yet.
    }
    if (issues.length > 0) {
      findings.push({
        id: 'knowledge-hygiene',
        severity: 'info',
        category: 'hygiene',
        message: `${issues.length} knowledge-store issue${issues.length === 1 ? '' : 's'} (skills/pins/decisions)`,
        items: issues.slice(0, 10)
      })
    }
  })

  if (failures.length > 0) {
    findings.push({
      id: 'health-check-errors',
      severity: 'info',
      category: 'hygiene',
      message: `${failures.length} health check${failures.length === 1 ? '' : 's'} errored and were skipped this pass`,
      items: failures.slice(0, 10)
    })
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
