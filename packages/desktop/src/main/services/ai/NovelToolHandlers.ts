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
import {
  structureService,
  collectLeaves,
  findUnit,
  uniqueSlugPath,
  listFilesRecursive as walkFilesUnder
} from '../novel/StructureService'
import { contextBuilder } from './ContextBuilder'
import { snapshotService } from '../novel/SnapshotService'
import { updateProjectMeta, isPlanningStyle, isStructureTemplate } from '../novel/ProjectMeta'
import { STRUCTURE_TEMPLATES } from '../novel/structureTemplates'
import { continuityService } from '../novel/ContinuityService'
import { revisionService, RevisionService } from '../novel/RevisionService'
import { isLockedCanon } from './pathGuards'
import { listSkills, readSkill } from '../novel/Skills'
import { appendDecision, listDecisions } from '../novel/Decisions'
import { checkProjectHealth } from '../novel/ProjectHealth'
import type { AgentToolContext, AgentToolService } from './AgentToolService'
import type { INovelUnit, IContinuityIssue } from '../../../shared/types/novel'

const execFileAsync = promisify(execFile)

const MAX_SEARCH_MATCHES = 200
const MAX_FILE_BYTES = 2 * 1024 * 1024
// Context budget: a single tool result must never be able to blow the
// model's window (2 MB of prose is ~500k tokens). Reads are capped and
// truncation is announced so the agent can narrow with line ranges.
const MAX_TOOL_OUTPUT_CHARS = 24000
const MAX_SYNOPSIS_CHARS = 400

const capForContext = (
  text: string,
  hint: string
): { text: string; truncated: boolean } => {
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return { text, truncated: false }
  return {
    text:
      text.slice(0, MAX_TOOL_OUTPUT_CHARS) +
      `\n…[truncated ${text.length - MAX_TOOL_OUTPUT_CHARS} characters — ${hint}]`,
    truncated: true
  }
}

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
  location?: string
  when?: string
  thread?: string
  label?: string
  notes?: string
  goal?: string
  conflict?: string
  outcome?: string
  valueShift?: string
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
  // location + when make the Outline columns and the Timeline view fully
  // readable — without them agents could WRITE these fields but never see
  // them again (the timeline was invisible to the AI).
  location: unit.location,
  when: unit.when,
  thread: unit.thread,
  label: unit.label,
  notes: unit.notes,
  // Scene craft (yWriter GMC + Story Grid value shift) — agent-readable
  // so the model can honor and health-check the writer's structure.
  goal: unit.goal,
  conflict: unit.conflict,
  outcome: unit.outcome,
  valueShift: unit.valueShift,
  // On a 1000-scene novel, full synopses would dominate the context.
  synopsis: unit.synopsis && unit.synopsis.length > MAX_SYNOPSIS_CHARS
    ? unit.synopsis.slice(0, MAX_SYNOPSIS_CHARS) + '…'
    : unit.synopsis,
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

/**
 * The deterministic scene N→N+1 join. LangGraph drafters get this pushed
 * into their task; SDK drafters (whose prompts are fixed before the model
 * picks a scene) call it — same ContextBuilder output either way.
 */
const getSceneHandoff = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = str(args, 'unitId')
  const handoff = await contextBuilder.buildSceneHandoff(root, `<id:${unitId}>`)
  return {
    handoff:
      handoff ?? 'No preceding scene (first in narrative order, or no prose yet) — open fresh.'
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
  const capped = capForContext(
    parts.join('\n\n'),
    'read individual scenes by unit id, or use read_project_file with start/end line ranges'
  )
  return {
    unitId,
    title: found.unit.title,
    type: found.unit.type,
    paths: leaves.map((l) => l.path),
    content: capped.text,
    truncated: capped.truncated
  }
}

/**
 * Parse `aliases:` from a bible page's YAML front matter. Supports the
 * inline form `aliases: [Liz, Lizzy]` and the dash-list form.
 */
export const parseAliases = (content: string): string[] => {
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

/**
 * Resolve an entity (character/place) into every name it goes by: the
 * bible page's title plus its front-matter aliases. Falls back to the
 * given name when no bible page matches.
 */
export const resolveEntityTerms = async(root: string, entity: string): Promise<{
  terms: string[]
  biblePage: string | null
}> => {
  const files = await listFilesRecursive(path.join(root, 'bible'), 'bible')
  const wanted = entity.trim().toLowerCase()

  for (const file of files) {
    let content: string
    try {
      content = await readTextSafe(path.join(root, file))
    } catch {
      continue
    }
    const aliases = parseAliases(content)
    const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
    const basename = path
      .basename(file)
      .replace(/\.(md|markdown|txt)$/i, '')
      .replace(/[-_]+/g, ' ')
    const names = [heading, basename, ...aliases].filter((n): n is string => !!n)

    if (names.some((n) => n.toLowerCase() === wanted)) {
      // Dedupe case-insensitively, keep original casing for the search.
      const seen = new Set<string>()
      const terms: string[] = []
      for (const name of [entity, ...names]) {
        const key = name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          terms.push(name)
        }
      }
      return { terms, biblePage: file }
    }
  }
  return { terms: [entity], biblePage: null }
}

const searchManuscript = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const entity = optStr(args, 'entity')
  const rawQuery = entity ? undefined : str(args, 'query')
  const isRegex = optBool(args, 'regex') ?? false
  const caseSensitive = optBool(args, 'caseSensitive') ?? false
  const contextLines = Math.min(optInt(args, 'contextLines') ?? 1, 5)
  const maxResults = Math.min(optInt(args, 'maxResults') ?? 50, MAX_SEARCH_MATCHES)

  // Entity mode: hunt every name the bible knows for this character/place,
  // so impact analysis never under-counts ("Liz" = "Elizabeth").
  let patterns: string[]
  let biblePage: string | null = null
  if (entity) {
    const resolved = await resolveEntityTerms(root, entity)
    patterns = resolved.terms
    biblePage = resolved.biblePage
  } else {
    patterns = [rawQuery as string]
  }

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
  for (const pattern of patterns) {
    rgArgs.push('-e', pattern)
  }
  rgArgs.push('--', '.')

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
    if (e.code === 1 && !e.stdout) {
      return { query: patterns.join(' | '), entity, biblePage, matches: [] }
    }
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
  return {
    query: patterns.join(' | '),
    entity,
    biblePage,
    matches,
    truncated: matches.length >= maxResults
  }
}

/**
 * where_appears — unit-level entity appearances from the deterministic
 * index (always fresh: rebuilt when bible/manuscript inputs changed).
 */
const whereAppears = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const entity = str(args, 'entity')
  const { getEntityIndex } = await import('../novel/EntityIndex')
  const index = await getEntityIndex(root)
  const wanted = entity.trim().toLowerCase()
  const entry = index.entities.find(
    (e) =>
      e.name.toLowerCase() === wanted ||
      e.aliases.some((alias) => alias.toLowerCase() === wanted)
  )
  if (!entry) {
    const known = index.entities.map((e) => e.name)
    return {
      entity,
      found: false,
      note:
        'No bible page matches this name. Known entities: ' +
        (known.length ? known.join(', ') : '(none — the bible has no entity pages yet)') +
        '. For an ad-hoc phrase use search_manuscript.'
    }
  }
  return {
    entity: entry.name,
    found: true,
    aliases: entry.aliases,
    biblePage: entry.page,
    appearances: entry.appearances,
    note:
      entry.appearances.length === 0
        ? 'This entity has a bible page but does not appear in any prose yet.'
        : undefined
  }
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
  // Duplicate-scene guard: two drafters creating "The Ambush" under the
  // same parent would fork the binder. Same normalized title + same
  // parent → point at the existing unit (allowDuplicate overrides for
  // genuinely same-titled scenes).
  if (args.allowDuplicate !== true) {
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim()
    const siblings = parentId
      ? findUnit(structure.units, parentId)?.unit.children ?? []
      : structure.units
    const existing = siblings.find(
      (u) => u.title.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedTitle
    )
    if (existing) {
      return {
        created: false,
        duplicate: true,
        unitId: existing.id,
        path: existing.path,
        note:
          'A unit with this title already exists under the same parent — work with it ' +
          '(read_unit / propose_text_edit), or pass allowDuplicate: true for a genuinely ' +
          'distinct same-titled scene.'
      }
    }
  }
  // A scene named exactly like its parent chapter yields a redundant path
  // (the-cellar/the-cellar.md): the chapter names the FOLDER, the scene
  // names the FILE. Refuse rather than warn — a warning in a tool result
  // is easy to sail past, and every such unit has to be renamed by hand
  // later. allowDuplicate is the deliberate escape hatch.
  if (type === 'scene' && parentId && args.allowDuplicate !== true) {
    const parent = findUnit(structure.units, parentId)?.unit
    const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim()
    if (parent && parent.type === 'chapter' && normalize(parent.title) === normalize(title)) {
      return {
        created: false,
        redundantName: true,
        note:
          `The parent chapter is already called "${parent.title}", so a scene with the ` +
          'same title would land at a redundant path like ' +
          `${slugifyPlanTitle(title)}/${slugifyPlanTitle(title)}.md. The chapter names ` +
          'the FOLDER; the scene names the FILE. Give the scene its own title for what ' +
          'happens in it (e.g. "Dusk on the veranda"), or pass allowDuplicate: true if ' +
          'you genuinely want both to share a name.'
      }
    }
  }

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
  if (content && !unit.path) {
    // A container (e.g. a chapter in chapters-scenes flavor) has no backing
    // file — silently dropping the prose here would let the model claim a
    // save that never happened.
    throw new Error(
      `Created ${type} "${title}" (id ${unit.id}), but a ${type} is a container with no ` +
        'prose file — the content was NOT saved. Create a scene inside it ' +
        `(propose_new_unit type=scene parentId=${unit.id} content=<the prose>).`
    )
  }
  return {
    created: true,
    unitId: unit.id,
    path: unit.path ?? null,
    title,
    warning:
      'EMPTY SHELL ONLY — no prose was saved and the writer sees no diff. If you have ' +
      `prose for this ${type}, call propose_new_unit again with the content argument, or ` +
      (unit.path ? `propose_project_file_edit on ${unit.path}.` : 'add scenes inside it.')
  }
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
  const FIELDS = [
    'title', 'status', 'pov', 'location', 'synopsis', 'when', 'thread', 'label', 'notes',
    'goal', 'conflict', 'outcome', 'valueShift'
  ] as const
  for (const key of FIELDS) {
    const value = optStr(args, key)
    if (value !== undefined) update[key] = value
  }
  if (Object.keys(update).length === 0) {
    throw new Error(`Provide at least one of ${FIELDS.join('/')}.`)
  }
  const structure = await structureService.loadReconciled(root)
  await structureService.updateUnit(root, structure, unitId, update)
  return { updated: true, unitId, ...update }
}

// ---- story fact ledger (typed world state, v1) ----

const recordFact = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { factService } = await import('../novel/FactService')
  const subject = str(args, 'subject')
  const relation = str(args, 'relation')
  const object = str(args, 'object')
  const { fact, duplicate } = await factService.record(root, {
    subject,
    relation,
    object,
    sourceUnitId: optStr(args, 'sourceUnitId'),
    note: optStr(args, 'note')
  })
  return {
    recorded: !duplicate,
    duplicate,
    fact,
    note: duplicate
      ? 'An identical fact already exists — nothing added.'
      : 'Fact recorded in the story ledger.'
  }
}

const listFacts = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { factService } = await import('../novel/FactService')
  const about = optStr(args, 'about')
  const facts = await factService.list(root, about)
  return {
    about: about ?? null,
    count: facts.length,
    facts: facts.slice(0, 200),
    note:
      facts.length === 0
        ? 'No recorded facts match. The ledger grows as drafting aftercare records canon.'
        : undefined
  }
}

// ---- deterministic prose lint (the "run the tests" of fiction) ----

// ---- Project health (deterministic sync report — the steward's start) ----

const projectHealthTool = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const report = await checkProjectHealth(root)
  const capped = capForContext(JSON.stringify(report.findings, null, 1), 'narrow with list_structure')
  return {
    clean: report.clean,
    findings: capped.truncated ? capped.text : report.findings,
    note: report.clean
      ? 'No warnings — the project is in sync.'
      : 'Deterministic findings. Fix what your role may fix; dispatch or log the rest.'
  }
}

// ---- Decisions log (settled creative choices — never relitigated) ----

const recordDecisionTool = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const decision = str(args, 'decision')
  const reason = optStr(args, 'reason')
  // Two agents settling the same choice in parallel must not double-log it.
  const normalized = decision.toLowerCase().replace(/\s+/g, ' ').trim()
  const existing = listDecisions(root).find(
    (d) => d.decision.toLowerCase().replace(/\s+/g, ' ').trim() === normalized
  )
  if (existing) {
    return {
      recorded: false,
      duplicate: true,
      existing,
      note: 'This decision is already on record — it stands; nothing to add.'
    }
  }
  const entry = appendDecision(root, decision, reason)
  return {
    recorded: entry,
    total: listDecisions(root).length,
    note:
      'Recorded in bible/decisions.md (writer-editable). This choice is settled — ' +
      'do not re-open it unless the writer does.'
  }
}

const listDecisionsTool = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const decisions = listDecisions(root)
  return {
    decisions,
    note:
      decisions.length === 0
        ? 'No recorded decisions yet. record_decision when the writer settles a creative question.'
        : 'These are SETTLED. Never propose against them unless the writer re-opens one.'
  }
}

// ---- Skills (writer-authored, on-demand technique files) ----

const listSkillsTool = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const skills = listSkills(root)
  return {
    skills,
    note:
      skills.length === 0
        ? 'No skills yet. The writer (or you, via propose_new_file into skills/) can add ' +
          'markdown technique files with front matter name/description.'
        : 'Load a body with use_skill when a task matches its description.'
  }
}

const useSkillTool = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const name = str(args, 'name')
  const found = readSkill(root, name)
  if (!found) {
    const available = listSkills(root).map((skill) => skill.name)
    throw new Error(
      `No skill named "${name}". ` +
      (available.length > 0
        ? `Available skills: ${available.join(', ')}.`
        : 'This project has no skills yet (skills/*.md).')
    )
  }
  const capped = capForContext(found.body, 'use a narrower skill file')
  return {
    name: found.meta.name,
    file: found.meta.file,
    instructions: capped.text,
    truncated: capped.truncated
  }
}

const lintProseTool = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = optStr(args, 'unitId')
  const fname = optStr(args, 'fname')

  // Corpus (anti-slop) mode: lint the WHOLE manuscript for cross-scene
  // echoes, repeated openings, and machine-flat rhythm — signals only
  // visible in aggregate. The book-run critic pass runs this.
  if (optBool(args, 'corpus') === true) {
    const structure = await structureService.loadReconciled(root)
    const { lintCorpus } = await import('../novel/ProseLint')
    const units: Array<{ label: string; text: string }> = []
    for (const leaf of collectLeaves(structure.units)) {
      if (!leaf.path) continue
      try {
        units.push({ label: leaf.title, text: await readTextSafe(resolveInside(root, leaf.path)) })
      } catch {
        // Unreadable unit — skip; the rest still lint.
      }
    }
    const result = lintCorpus(units)
    const MAX = 30
    return {
      scope: 'corpus',
      unitCount: result.unitCount,
      findingCount: result.findings.length,
      findings: result.findings.slice(0, MAX),
      truncated: result.findings.length > MAX,
      note:
        'Corpus-level anti-slop signals — a recurring phrase can be a deliberate motif; ' +
        'weigh each against intent. Vary echoes/openings the writer did not choose.'
    }
  }

  if (!unitId === !fname) {
    throw new Error('Provide exactly one of unitId, fname, or corpus:true.')
  }

  let target: string
  if (unitId) {
    const structure = await structureService.loadReconciled(root)
    const found = findUnit(structure.units, unitId)
    if (!found?.unit.path) {
      throw new Error(`No prose unit with id ${unitId}. Use list_structure to see ids.`)
    }
    target = found.unit.path
  } else {
    target = fname as string
  }

  const text = await readTextSafe(resolveInside(root, target))
  const { lintProse, parseBannedTerms } = await import('../novel/ProseLint')

  let bannedTerms: string[] = []
  try {
    bannedTerms = parseBannedTerms(
      await readTextSafe(resolveInside(root, path.join('bible', 'style.md')))
    )
  } catch {
    // No style page — lint without banned terms.
  }

  const result = lintProse(text, { bannedTerms })
  const MAX_FINDINGS = 40
  return {
    path: target,
    stats: result.stats,
    findingCount: result.findings.length,
    findings: result.findings.slice(0, MAX_FINDINGS),
    truncated: result.findings.length > MAX_FINDINGS,
    note:
      'Deterministic signals, not laws — a repetition can be a deliberate device. ' +
      'Weigh each against the writer\'s style and intent.'
  }
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
    const capped = capForContext(
      await readTextSafe(filePath),
      'use read_project_file with start/end line ranges for the rest'
    )
    return { path: target, content: capped.text, truncated: capped.truncated }
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

// Locked-canon check lives in pathGuards (shared with the apply gate).
export { isLockedCanon }

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

  // Parallel auditors finding the same problem must not double-file it.
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim()
  const existing = (await continuityService.list(root)).find(
    (i) =>
      i.status === 'open' &&
      i.title.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedTitle
  )
  if (existing) {
    return {
      logged: false,
      duplicate: true,
      issueId: existing.id,
      note:
        'An open issue with this title already exists — it is filed; add genuinely new ' +
        'evidence under a more specific title if needed.'
    }
  }

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

// ---- new file proposal (generic — notes, research docs, todo lists) ----

const NEW_FILE_EXT_RE = /\.(md|markdown|txt)$/i

const proposeNewFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = str(args, 'path')
  const content = str(args, 'content')
  const reason = optStr(args, 'reason')

  const filePath = resolveInside(root, target)
  const rel = path.relative(root, filePath)
  if (rel.split(path.sep)[0] === '.wordbird' || rel.split(path.sep)[0] === '.git') {
    throw new Error('New files cannot be created inside internal directories.')
  }
  if (!NEW_FILE_EXT_RE.test(filePath)) {
    throw new Error('New files must be .md, .markdown, or .txt.')
  }
  if (fs.existsSync(filePath)) {
    throw new Error(
      `${rel} already exists — use propose_project_file_edit to change it.`
    )
  }
  // Parent directory must exist by apply time; create it now.
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true })

  return {
    edit: {
      id: crypto.randomUUID(),
      filePath: rel,
      newContent: content,
      reason: reason ?? `New file: ${rel}`
    },
    oldContent: '',
    originalPath: filePath
  }
}

// ---- file management (Copilot-style: folders, move/rename, delete) ----

const INTERNAL_TOP_DIRS = new Set(['.wordbird', '.git'])

const assertNotInternal = (root: string, filePath: string): string => {
  const rel = path.relative(root, filePath)
  if (INTERNAL_TOP_DIRS.has(rel.split(path.sep)[0])) {
    throw new Error('Internal directories (.wordbird, .git) are off limits.')
  }
  return rel
}

/** The binder unit (if any) whose backing file is this path. */
const findUnitByPath = async(
  root: string,
  relativePath: string
): Promise<INovelUnit | null> => {
  const structure = await structureService.loadReconciled(root)
  const normalized = relativePath.replace(/\\/g, '/')
  const leaf = collectLeaves(structure.units).find(
    (u) => (u.path ?? '').replace(/\\/g, '/') === normalized
  )
  return leaf ?? null
}

const createFolder = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = str(args, 'path')
  const dirPath = resolveInside(root, target)
  const rel = assertNotInternal(root, dirPath)
  await fsPromises.mkdir(dirPath, { recursive: true })
  return { created: true, path: rel }
}

const moveFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const from = str(args, 'from')
  const to = str(args, 'to')
  const reason = str(args, 'reason')

  const srcPath = resolveInside(root, from)
  const destPath = resolveInside(root, to)
  const srcRel = assertNotInternal(root, srcPath)
  const destRel = assertNotInternal(root, destPath)

  if (!fs.existsSync(srcPath)) throw new Error(`No such file or folder: ${srcRel}`)
  if (fs.existsSync(destPath)) throw new Error(`${destRel} already exists.`)

  const isDirectory = fs.statSync(srcPath).isDirectory()

  // FOLDER move/rename: every binder unit underneath keeps its identity —
  // the manifest paths get a prefix rewrite instead of prune+rediscover.
  if (isDirectory) {
    await snapshotService.snapshot(
      root,
      `Before moving folder ${srcRel} → ${destRel} — ${reason}`,
      true
    )
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true })
    await fsPromises.rename(srcPath, destPath)

    let unitsUpdated = 0
    // Raw load — reconciling here would prune every unit under the old
    // prefix before we fix it.
    const structure = await structureService.load(root)
    if (structure) {
      const prefix = `${srcRel}/`
      const rewrite = (units: INovelUnit[]): void => {
        for (const unit of units) {
          if (unit.path && (unit.path === srcRel || unit.path.startsWith(prefix))) {
            unit.path = `${destRel}${unit.path.slice(srcRel.length)}`
            unitsUpdated += 1
          }
          if (unit.children) rewrite(unit.children)
        }
      }
      rewrite(structure.units)
      if (unitsUpdated > 0) await structureService.save(root, structure)
    }
    return {
      moved: true,
      folder: true,
      from: srcRel,
      to: destRel,
      unitsUpdated,
      snapshotTaken: true
    }
  }

  // Identify the binder unit BEFORE moving — after the rename a reconcile
  // would prune it (file gone) and re-discover the destination as a stranger.
  const unit = await findUnitByPath(root, srcRel)

  await snapshotService.snapshot(root, `Before moving ${srcRel} → ${destRel} — ${reason}`, true)
  await fsPromises.mkdir(path.dirname(destPath), { recursive: true })
  await fsPromises.rename(srcPath, destPath)

  // Keep the binder manifest consistent: a moved scene keeps its unit.
  let manifestUpdated = false
  if (unit) {
    // Raw load — reconciling here would prune the unit before we fix it.
    const structure = await structureService.load(root)
    const found = structure ? findUnit(structure.units, unit.id) : null
    if (structure && found) {
      found.unit.path = destRel
      await structureService.save(root, structure)
      manifestUpdated = true
    }
  }
  return { moved: true, from: srcRel, to: destRel, manifestUpdated, snapshotTaken: true }
}

/**
 * Recursive folder deletion — DESTRUCTIVE (writer approval card on every
 * provider), snapshot-guarded; binder units underneath are pruned by the
 * next reconcile.
 */
const deleteFolder = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = str(args, 'path')
  const reason = str(args, 'reason')

  const dirPath = resolveInside(root, target)
  const rel = assertNotInternal(root, dirPath)
  if (!fs.existsSync(dirPath)) throw new Error(`No such folder: ${rel}`)
  if (!fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${rel} is a file — use delete_file.`)
  }
  if (rel === '' || rel === '.') throw new Error('Refusing to delete the project root.')

  await snapshotService.snapshot(root, `Before deleting folder ${rel} — ${reason}`, true)
  await fsPromises.rm(dirPath, { recursive: true, force: true })
  // Reconcile prunes any binder units whose files just vanished.
  await structureService.loadReconciled(root)
  return { deleted: true, path: rel, snapshotTaken: true }
}

const deleteFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const target = str(args, 'path')
  const reason = str(args, 'reason')

  const filePath = resolveInside(root, target)
  const rel = assertNotInternal(root, filePath)
  if (!fs.existsSync(filePath)) throw new Error(`No such file: ${rel}`)
  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${rel} is not a file — folders are only removed when emptied.`)
  }

  const unit = await findUnitByPath(root, rel)
  if (unit) {
    throw new Error(
      `${rel} backs the binder unit "${unit.title}" — use delete_unit (${unit.id}) instead ` +
      'so the manifest stays consistent.'
    )
  }

  await snapshotService.snapshot(root, `Before deleting ${rel} — ${reason}`, true)
  await fsPromises.unlink(filePath)
  return { deleted: true, path: rel, snapshotTaken: true }
}

// ---- file discovery ----

const LIST_IGNORE = new Set(['.git', 'node_modules', 'exports'])
const MAX_LISTED_FILES = 500

const listFiles = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const subdir = optStr(args, 'dir')
  const startDir = subdir ? resolveInside(root, subdir) : root

  const files: Array<{ path: string; size: number; modifiedAt?: string }> = []
  let truncated = false

  const walk = async(dir: string): Promise<void> => {
    if (files.length >= MAX_LISTED_FILES) {
      truncated = true
      return
    }
    let entries: fs.Dirent[]
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_LISTED_FILES) {
        truncated = true
        return
      }
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full)
      if (entry.isDirectory()) {
        if (LIST_IGNORE.has(entry.name)) continue
        // .wordbird internals stay hidden except the agent-facing state dirs.
        if (entry.name === '.wordbird') continue
        if (entry.name.startsWith('.') && entry.name !== '.wordbird') continue
        await walk(full)
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        let size = 0
        let modifiedAt: string | undefined
        try {
          const stat = await fsPromises.stat(full)
          size = stat.size
          modifiedAt = stat.mtime.toISOString()
        } catch {
          // stat raced a delete — keep size 0
        }
        files.push({ path: rel, size, modifiedAt })
      }
    }
  }
  await walk(startDir)
  return { dir: subdir ?? '.', files, truncated }
}

// ---- snapshot history (the project's mini-git, agent-readable) ----

const listSnapshots = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { snapshotService } = await import('../novel/SnapshotService')
  const limit = Math.min(optInt(args, 'limit') ?? 30, 100)
  const snapshots = await snapshotService.list(root, limit)
  return {
    count: snapshots.length,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      message: s.message,
      at: new Date(s.timestamp).toISOString(),
      auto: s.auto
    }))
  }
}

const readSnapshotFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { snapshotService } = await import('../novel/SnapshotService')
  const snapshotId = str(args, 'snapshotId')
  const target = str(args, 'path')
  const content = await snapshotService.readFileAt(root, snapshotId, target)
  if (content === null) {
    return {
      found: false,
      note:
        `"${target}" does not exist in snapshot ${snapshotId.slice(0, 8)} ` +
        '(or the snapshot id is wrong — list_snapshots shows the history).'
    }
  }
  const capped = capForContext(content, 'read a narrower file or a specific scene')
  return { found: true, path: target, snapshotId, content: capped.text, truncated: capped.truncated }
}

const diffSnapshotFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { snapshotService } = await import('../novel/SnapshotService')
  const { createTwoFilesPatch } = await import('diff')
  const snapshotId = str(args, 'snapshotId')
  const target = str(args, 'path')
  const old = (await snapshotService.readFileAt(root, snapshotId, target)) ?? ''
  let current = ''
  try {
    current = await readTextSafe(resolveInside(root, target))
  } catch {
    // File deleted since the snapshot — diff against empty.
  }
  if (old === current) {
    return { path: target, snapshotId, identical: true, diff: '' }
  }
  const patch = createTwoFilesPatch(
    `${target} @ ${snapshotId.slice(0, 8)}`,
    `${target} (current)`,
    old,
    current
  )
  const capped = capForContext(patch, 'diff a single scene file instead')
  return { path: target, snapshotId, identical: false, diff: capped.text, truncated: capped.truncated }
}

const capList = (list: string[], max = 50): { items: string[]; more: number } => ({
  items: list.slice(0, max),
  more: Math.max(0, list.length - max)
})

const previewSnapshot = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { snapshotService } = await import('../novel/SnapshotService')
  const snapshotId = str(args, 'snapshotId')
  const preview = await snapshotService.previewRestore(root, snapshotId)
  const changes =
    preview.modified.length +
    preview.addedSinceSnapshot.length +
    preview.removedSinceSnapshot.length
  return {
    snapshotId,
    identicalToNow: changes === 0,
    // Restore-perspective, so the numbers read as consequences:
    wouldRevert: capList(preview.modified),
    wouldDelete: capList(preview.addedSinceSnapshot),
    wouldResurrect: capList(preview.removedSinceSnapshot),
    note:
      changes === 0
        ? 'The project is identical to this snapshot — a restore would change nothing.'
        : 'Preview only — nothing was changed. Report these consequences to the writer ' +
          'before any restore_snapshot; for a single file, prefer read_snapshot_file + ' +
          'an edit proposal.'
  }
}

const restoreSnapshot = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { snapshotService } = await import('../novel/SnapshotService')
  const snapshotId = str(args, 'snapshotId')
  const resultId = await snapshotService.restore(root, snapshotId)
  return {
    restored: true,
    snapshotId,
    note:
      'The WHOLE project was rewound to that snapshot (a safety snapshot of the ' +
      `pre-rewind state was taken first${resultId ? `; rewind recorded as ${resultId.slice(0, 8)}` : ''}). ` +
      'For a single file, prefer read_snapshot_file + a normal edit proposal instead.'
  }
}

// ---- continuity read/resolve (logging lives above) ----

const listContinuityIssues = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const issues = await continuityService.list(root)
  return {
    open: issues.filter((i) => i.status === 'open'),
    resolvedCount: issues.filter((i) => i.status === 'resolved').length
  }
}

const resolveContinuityIssue = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const issueId = str(args, 'issueId')
  const resolution = str(args, 'resolution')
  const resolved = await continuityService.resolve(root, issueId)
  if (!resolved) {
    throw new Error(`No continuity issue with id ${issueId}. Use list_continuity_issues.`)
  }
  return { resolved: true, issueId, resolution }
}

// ---- unit deletion (snapshot-protected) ----

const deleteUnit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const unitId = str(args, 'unitId')
  const deleteFiles = optBool(args, 'deleteFiles') ?? true
  const reason = str(args, 'reason')

  const structure = await structureService.loadReconciled(root)
  const found = findUnit(structure.units, unitId)
  if (!found) throw new Error(`No unit with id ${unitId}. Use list_structure to see ids.`)

  // Deleting prose is the one destructive tool — always snapshot first so
  // the writer can rewind it from History.
  await snapshotService.snapshot(root, `Before deleting "${found.unit.title}" — ${reason}`, true)
  await structureService.deleteUnit(root, structure, unitId, deleteFiles)
  return { deleted: true, unitId, title: found.unit.title, snapshotTaken: true }
}

// ---- plans (Claude-CLI-style: live file, incremental updates, explicit
// approval). Plans live in plans/ — a normal, visible, writer-editable
// project folder — NOT in .wordbird, so the writer can open a plan in the
// editor beside the chat and edit it while brainstorming. ----

const slugifyPlanTitle = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'plan'
}

const planPathFor = (root: string, title: string, folder?: string): string =>
  uniqueSlugPath(
    root,
    path.join('plans', ...slugFolderSegments(folder)),
    slugifyPlanTitle(title)
  )

const savePlan = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const title = str(args, 'title')
  const plan = str(args, 'plan')

  const relative = planPathFor(root, title, optStr(args, 'folder'))
  const target = path.join(root, relative)
  await fsPromises.mkdir(path.dirname(target), { recursive: true })
  await fsPromises.writeFile(target, `# ${title}\n\n${plan}\n`, 'utf8')

  return {
    created: true,
    planId: relative,
    path: relative,
    planSaved: { path: relative },
    note:
      'Plan file created — keep it CURRENT with update_plan as the conversation evolves. ' +
      'The writer can open and edit this file too. When the plan is settled, call ' +
      'propose_plan to present it for approval.'
  }
}

/**
 * Durable research: findings land in bible/research/ (writer-visible,
 * announced in every brief as RESEARCH ON FILE) so the same topic is
 * never re-researched. Direct write by design (writer decision): notes
 * are additive reference material — new files only, never overwrites.
 */
/** Optional subfolder for saves: slug per segment, depth ≤ 3, no escapes. */
const slugFolderSegments = (raw: string | undefined): string[] => {
  if (!raw) return []
  return raw
    .split('/')
    .map((segment) =>
      segment
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    )
    .filter(Boolean)
    .slice(0, 3)
}

const saveResearch = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const title = str(args, 'title')
  const content = str(args, 'content')
  const sources = Array.isArray(args.sources)
    ? (args.sources as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  const folder = slugFolderSegments(optStr(args, 'folder'))
  const dir = path.join('bible', 'research', ...folder)
  const dirPosix = ['bible/research', ...folder].join('/')

  // Parallel/duplicate research guard: if a note with this exact title
  // already exists (a sibling worker may have just saved it), point at it
  // instead of writing a near-copy. allowDuplicate overrides.
  const baseSlug = slugifyPlanTitle(title)
  const canonical = path.join(dir, `${baseSlug}.md`)
  if (args.allowDuplicate !== true && fs.existsSync(path.join(root, canonical))) {
    return {
      saved: false,
      duplicate: true,
      existingPath: `${dirPosix}/${baseSlug}.md`,
      note:
        'A research note with this title already exists — read it and cite it instead of ' +
        'duplicating. Pass allowDuplicate: true only if this is genuinely distinct material.'
    }
  }

  const relative = uniqueSlugPath(root, dir, baseSlug)
  const target = path.join(root, relative)
  await fsPromises.mkdir(path.dirname(target), { recursive: true })
  const frontMatter = [
    '---',
    `date: ${new Date().toISOString().slice(0, 10)}`,
    ...(sources.length > 0 ? ['sources:', ...sources.map((source) => `  - ${source}`)] : []),
    '---'
  ].join('\n')
  await fsPromises.writeFile(target, `${frontMatter}\n\n# ${title}\n\n${content}\n`, 'utf8')

  return {
    saved: true,
    path: relative.split(path.sep).join('/'),
    note:
      'Research note saved — every future turn sees it under RESEARCH ON FILE. ' +
      'Cite this note instead of restating or re-fetching the material.'
  }
}

const updatePlan = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const planId = str(args, 'planId')
  const plan = str(args, 'plan')
  const title = optStr(args, 'title')

  const target = resolveInside(root, planId, 'plans')
  if (!fs.existsSync(target)) {
    throw new Error(`No plan at ${planId}. Use list_plans, or save_plan for a new one.`)
  }
  const existing = await readTextSafe(target)
  const existingTitle = /^#\s+(.+)$/m.exec(existing)?.[1]?.trim() ?? 'Plan'
  await fsPromises.writeFile(target, `# ${title ?? existingTitle}\n\n${plan}\n`, 'utf8')
  return { updated: true, planId, planSaved: { path: planId } }
}

const listPlans = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const dir = path.join(root, 'plans')
  // Recursive — plans may be organized into subfolders (plans/done/…).
  const files = walkFilesUnder(dir, /\.(md|markdown|txt)$/i)
  const plans = []
  for (const name of files) {
    const relative = `plans/${name}`
    try {
      const content = await readTextSafe(path.join(dir, name))
      const stat = await fsPromises.stat(path.join(dir, name))
      plans.push({
        planId: relative,
        title: /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? name,
        updatedAt: new Date(stat.mtimeMs).toISOString()
      })
    } catch {
      // Unreadable plan — skip.
    }
  }
  plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { plans }
}

const proposePlan = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const planId = str(args, 'planId')
  const target = resolveInside(root, planId, 'plans')
  if (!fs.existsSync(target)) {
    throw new Error(`No plan at ${planId}. Use list_plans to find it.`)
  }
  // Read at propose time so the writer's own edits are what gets approved.
  const content = await readTextSafe(target)
  const title = /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? planId

  // The planProposal shape is intercepted by AgentToolService and raised
  // to the renderer as an approval card.
  return { planProposal: { id: planId, title, path: planId, content } }
}

// ---- sweeping revisions ("book surgery") ----

const VALID_CLASSIFICATIONS = new Set(['remove', 'rewrite', 'mention-only', 'plot-dependency'])

const startRevision = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const title = str(args, 'title')
  const directive = str(args, 'directive')
  const revision = await revisionService.create(root, title, directive)
  return {
    revisionId: revision.id,
    title: revision.title,
    snapshotTaken: true,
    next: 'Fan out explorers with search_manuscript (entity=…) to build the impact map via update_impact_map, then present it to the writer for approval.'
  }
}

const getRevision = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const revisionId = str(args, 'revisionId')
  const loaded = await revisionService.get(root, revisionId)
  if (!loaded) throw new Error(`No revision with id ${revisionId}.`)
  const { revision, directive } = loaded
  const progress = RevisionService.progress(revision)
  const capped = capForContext(directive, 'directive truncated')
  return {
    revisionId: revision.id,
    title: revision.title,
    status: revision.status,
    directive: capped.text,
    progress,
    entries: revision.entries.map((e) => ({
      unitId: e.unitId,
      path: e.path,
      classification: e.classification,
      plan: e.plan.slice(0, 300),
      status: e.status
    }))
  }
}

const updateImpactMap = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const revisionId = str(args, 'revisionId')
  const raw = args.entries
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Agent tool argument 'entries' must be a non-empty array.")
  }
  const entries = raw.map((item) => {
    const entry = item as Record<string, unknown>
    const classification = String(entry.classification ?? '')
    if (!VALID_CLASSIFICATIONS.has(classification)) {
      throw new Error(
        `Invalid classification '${classification}' — use remove | rewrite | mention-only | plot-dependency.`
      )
    }
    return {
      unitId: str(entry, 'unitId'),
      path: optStr(entry, 'path'),
      classification: classification as 'remove' | 'rewrite' | 'mention-only' | 'plot-dependency',
      evidence: str(entry, 'evidence').slice(0, 600),
      plan: str(entry, 'plan').slice(0, 400)
    }
  })
  const revision = await revisionService.updateImpactMap(root, revisionId, entries)
  const progress = RevisionService.progress(revision)
  return { updated: entries.length, mappedUnits: progress.total }
}

const markRevisionUnit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const revisionId = str(args, 'revisionId')
  const unitId = str(args, 'unitId')
  const statusArg = str(args, 'status')
  if (statusArg !== 'done' && statusArg !== 'skipped' && statusArg !== 'pending') {
    throw new Error("Agent tool argument 'status' must be done | skipped | pending.")
  }
  const note = optStr(args, 'note')
  const revision = await revisionService.markUnit(root, revisionId, unitId, statusArg, note)
  const progress = RevisionService.progress(revision)
  return { unitId, status: statusArg, progress }
}

const completeRevision = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const revisionId = str(args, 'revisionId')
  const report = str(args, 'report')
  const abandoned = optBool(args, 'abandoned') ?? false
  const loaded = await revisionService.get(root, revisionId)
  if (!loaded) throw new Error(`No revision with id ${revisionId}.`)
  const progress = RevisionService.progress(loaded.revision)
  if (!abandoned && progress.pending.length > 0) {
    throw new Error(
      `Revision still has ${progress.pending.length} pending unit(s): ` +
      `${progress.pending.slice(0, 10).join(', ')}. Finish or skip them first, ` +
      'or pass abandoned=true.'
    )
  }
  const revision = await revisionService.complete(root, revisionId, report, abandoned)
  return { revisionId, status: revision.status, unitsHandled: progress.done }
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

const setWritingMethod = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const planningStyle = optStr(args, 'planningStyle')
  const structureTemplate = optStr(args, 'structureTemplate')
  if (!planningStyle && !structureTemplate) {
    throw new Error('Provide planningStyle and/or structureTemplate.')
  }
  const patch: Record<string, string> = {}
  if (planningStyle) {
    if (!isPlanningStyle(planningStyle) || planningStyle === 'unset') {
      throw new Error('planningStyle must be outline-first | discovery | hybrid.')
    }
    patch.planningStyle = planningStyle
  }
  if (structureTemplate) {
    if (!isStructureTemplate(structureTemplate) || structureTemplate === 'unset') {
      throw new Error(
        'structureTemplate must be freeform | three-act | save-the-cat | heros-journey | seven-point | romancing-the-beat.'
      )
    }
    patch.structureTemplate = structureTemplate
  }
  const meta = await updateProjectMeta(root, patch)

  // Seed the beat sheet once — the writer's edits to it are canon afterwards.
  let seededBeatSheet = false
  const beatSheet = structureTemplate ? STRUCTURE_TEMPLATES[meta.structureTemplate ?? 'unset'] : undefined
  const beatSheetPath = path.join(root, 'bible', 'structure.md')
  if (beatSheet && !fs.existsSync(beatSheetPath)) {
    await fsPromises.mkdir(path.dirname(beatSheetPath), { recursive: true })
    await fsPromises.writeFile(beatSheetPath, beatSheet, 'utf8')
    seededBeatSheet = true
  }

  return {
    recorded: true,
    planningStyle: meta.planningStyle,
    structureTemplate: meta.structureTemplate,
    seededBeatSheet,
    note: seededBeatSheet
      ? 'Beat sheet created at bible/structure.md — the writer can edit it freely; re-read it before relying on it.'
      : 'Method recorded. Remember: the writer\'s words always override the recorded method.'
  }
}

/**
 * relationship_map — deterministically regenerate bible/relationships.md
 * (a mermaid graph) from the fact ledger. Inter-entity facts become
 * edges; the result rides the normal review queue as an edit proposal so
 * the writer approves it like any other change (never a silent write).
 */
const relationshipMapTool = async(
  _args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const root = requireRoot(context)
  const { factService } = await import('../novel/FactService')
  const { getEntityIndex } = await import('../novel/EntityIndex')
  const { buildRelationshipDoc } = await import('../novel/RelationshipMap')

  const facts = await factService.list(root)
  const index = await getEntityIndex(root)
  const doc = buildRelationshipDoc(
    facts.map((f) => ({ subject: f.subject, relation: f.relation, object: f.object })),
    index.entities.map((e) => ({ name: e.name, aliases: e.aliases }))
  )
  if (!doc) {
    return {
      generated: false,
      note:
        'No inter-entity relationships in the fact ledger yet — record_fact triples ' +
        'whose subject AND object are both bible entities (e.g. "Zara / sister of / Mara"), ' +
        'then regenerate.'
    }
  }

  const relative = path.join('bible', 'relationships.md')
  const filePath = resolveInside(root, relative, 'bible')
  let oldContent = ''
  try {
    oldContent = await readTextSafe(filePath)
  } catch {
    // New file.
  }
  if (isLockedCanon(oldContent)) {
    throw new Error('bible/relationships.md is locked canon — unlock it to regenerate the map.')
  }
  return {
    edit: {
      id: crypto.randomUUID(),
      filePath: relative,
      newContent: doc,
      reason: 'Regenerated relationship map from the fact ledger'
    },
    oldContent,
    originalPath: filePath
  }
}

export const registerNovelAgentToolHandlers = (service: AgentToolService): void => {
  service.registerHandler('list_structure', listStructure)
  service.registerHandler('read_unit', readUnit)
  service.registerHandler('get_scene_handoff', getSceneHandoff)
  service.registerHandler('search_manuscript', searchManuscript)
  service.registerHandler('where_appears', whereAppears)
  service.registerHandler('propose_new_unit', proposeNewUnit)
  service.registerHandler('restructure_unit', restructureUnit)
  service.registerHandler('update_unit_meta', updateUnitMeta)
  service.registerHandler('read_bible', readBible)
  service.registerHandler('propose_bible_update', proposeBibleUpdate)
  service.registerHandler('update_summary', updateSummary)
  service.registerHandler('read_summary', readSummary)
  service.registerHandler('log_continuity_issue', logContinuityIssue)
  service.registerHandler('record_fact', recordFact)
  service.registerHandler('list_facts', listFacts)
  service.registerHandler('relationship_map', relationshipMapTool)
  service.registerHandler('lint_prose', lintProseTool)
  service.registerHandler('list_skills', listSkillsTool)
  service.registerHandler('use_skill', useSkillTool)
  service.registerHandler('record_decision', recordDecisionTool)
  service.registerHandler('list_decisions', listDecisionsTool)
  service.registerHandler('project_health', projectHealthTool)
  service.registerHandler('list_snapshots', listSnapshots)
  service.registerHandler('read_snapshot_file', readSnapshotFile)
  service.registerHandler('diff_snapshot_file', diffSnapshotFile)
  service.registerHandler('preview_snapshot', previewSnapshot)
  service.registerHandler('restore_snapshot', restoreSnapshot)
  service.registerHandler('list_continuity_issues', listContinuityIssues)
  service.registerHandler('resolve_continuity_issue', resolveContinuityIssue)
  service.registerHandler('list_files', listFiles)
  service.registerHandler('propose_new_file', proposeNewFile)
  service.registerHandler('create_folder', createFolder)
  service.registerHandler('move_file', moveFile)
  service.registerHandler('delete_file', deleteFile)
  service.registerHandler('delete_folder', deleteFolder)
  service.registerHandler('delete_unit', deleteUnit)
  service.registerHandler('save_plan', savePlan)
  service.registerHandler('save_research', saveResearch)
  service.registerHandler('update_plan', updatePlan)
  service.registerHandler('list_plans', listPlans)
  service.registerHandler('propose_plan', proposePlan)
  service.registerHandler('start_revision', startRevision)
  service.registerHandler('get_revision', getRevision)
  service.registerHandler('update_impact_map', updateImpactMap)
  service.registerHandler('mark_revision_unit', markRevisionUnit)
  service.registerHandler('complete_revision', completeRevision)
  service.registerHandler('snapshot_project', snapshotProject)
  service.registerHandler('set_writing_method', setWritingMethod)
}
