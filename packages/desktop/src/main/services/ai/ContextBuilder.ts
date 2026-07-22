/**
 * ContextBuilder — the compact "project brief" injected into every agent
 * prompt (supervisor and workers) so the AI always knows where it is in
 * the novel without burning tool round-trips on re-orientation.
 *
 * Coherence at book scale comes from reading at the right altitude: the
 * brief is deliberately small (a few hundred tokens — outline + book
 * summary + open continuity issues), and everything deeper is fetched
 * agentically through tools. It is rebuilt fresh per turn and NEVER
 * persisted into thread state.
 */

import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import {
  structureService,
  collectLeaves,
  listFilesRecursive
} from '../novel/StructureService'
import { getEntityIndex } from '../novel/EntityIndex'
import { continuityService } from '../novel/ContinuityService'
import { revisionService, RevisionService } from '../novel/RevisionService'
import { listSkills, readSkill, readPinnedSkills, MAX_SKILL_BODY_CHARS } from '../novel/Skills'
import { listDecisions } from '../novel/Decisions'
import {
  checkProjectHealth,
  healthBriefLine,
  MAX_INSTRUCTIONS_CHARS
} from '../novel/ProjectHealth'
import { neutralizeHarnessMarkers } from './coherencePass'
import { readProjectMeta } from '../novel/ProjectMeta'
import type { INovelUnit } from '../../../shared/types/novel'

const MAX_OUTLINE_LINES = 80
const MAX_BOOK_SUMMARY_CHARS = 1500
const MAX_ISSUES = 5

const words = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** Recursive count of files with the given extension (0 when absent). */
const countFiles = (dir: string, extension: string): number => {
  try {
    let total = 0
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) total += countFiles(path.join(dir, entry.name), extension)
      else if (entry.name.endsWith(extension)) total += 1
    }
    return total
  } catch {
    return 0
  }
}

/** Render the binder tree as an indented outline, depth- and line-capped. */
export const renderOutline = (units: INovelUnit[], maxLines = MAX_OUTLINE_LINES): string => {
  const lines: string[] = []
  let omitted = 0

  const walk = (list: INovelUnit[], depth: number): void => {
    for (const unit of list) {
      if (lines.length >= maxLines) {
        omitted += 1
        if (unit.children) omitted += collectLeaves(unit.children).length
        continue
      }
      const indent = '  '.repeat(depth)
      const meta: string[] = []
      if (unit.wordCount) meta.push(words(unit.wordCount))
      if (unit.status && unit.status !== 'idea') meta.push(unit.status)
      if (unit.pov) meta.push(`POV: ${unit.pov}`)
      if (unit.when) meta.push(`@${unit.when}`)
      if (unit.location) meta.push(`loc: ${unit.location}`)
      if (unit.thread) meta.push(`thread: ${unit.thread}`)
      const suffix = meta.length ? ` (${meta.join(', ')})` : ''
      lines.push(`${indent}- [${unit.type}] ${unit.title}${suffix} <id:${unit.id}>`)
      if (unit.children) walk(unit.children, depth + 1)
    }
  }
  walk(units, 0)

  if (omitted > 0) {
    lines.push(`… ${omitted} more units (use list_structure for the full tree)`)
  }
  return lines.join('\n')
}

export interface ISessionContext {
  viewMode: 'page' | 'corkboard' | 'outline' | 'timeline'
  currentUnitId?: string
  currentFile?: string
  /** Every open tab (filenames), so agents see the writer's working set. */
  openTabs?: string[]
  /** Tabs with unsaved changes — the disk may lag what the writer sees. */
  unsavedTabs?: string[]
  /** Text the writer currently has highlighted in the editor. */
  selection?: { text: string; file?: string }
  /**
   * The project the renderer scoped this vantage to. Tabs arrive as bare
   * filenames, so main cannot re-check containment itself; instead the
   * renderer states which project it filtered for, and a vantage belonging to
   * a different project is dropped rather than described as this one's. That
   * covers a stale renderer, a project switched mid-turn, and the detached
   * Biscuit window pointing elsewhere.
   */
  projectRoot?: string
}

/** Cap for the selection excerpt carried into the brief. */
const MAX_SELECTION_CHARS = 400
const MAX_TAB_NAMES = 8

/** How much of the previous scene's ending a drafter gets for continuity. */
const HANDOFF_WORDS = 500

export class ContextBuilder {
  private _sessionContext: ISessionContext | null = null
  /** Fallback marker for callers that never signal turn boundaries. */
  private _lastBriefAt = new Map<string, number>()
  /** One-shot project events (rewinds, etc.) surfaced in the next brief. */
  private _projectEvents = new Map<string, string[]>()
  /** When the previous turn ENDED — the freshness window opens here. */
  private _lastTurnEndedAt = new Map<string, number>()
  /**
   * Per-turn snapshot of the freshness signals, computed ONCE at turn
   * start so every brief build of the turn — each supervisor iteration
   * and every worker — sees the SAME warning (a per-build reset made the
   * warning visible exactly once, so most readers missed it).
   */
  private _turnFreshness = new Map<string, { changed: string[]; events: string[] }>()
  /** Writer's message this turn — the seed for Codex-style bible
   * auto-injection (frozen at beginTurn, cleared at endTurn). */
  private _turnLoreSeed = new Map<string, string>()
  /** Computed-once lore section per turn (workers + supervisor iterations
   * reuse it instead of re-scanning the bible each brief build). */
  private _turnLoreSection = new Map<string, string>()

  /** Where the writer is looking (view + open scene); set from the renderer. */
  setSessionContext(context: ISessionContext | null): void {
    this._sessionContext = context
  }

  /** Note an out-of-band project event (e.g. a History-panel rewind). */
  recordProjectEvent(projectRoot: string, text: string): void {
    const queue = this._projectEvents.get(projectRoot) ?? []
    queue.push(text)
    this._projectEvents.set(projectRoot, queue.slice(-5))
  }

  /**
   * A writer turn is starting: freeze the freshness signals for the whole
   * turn. Files changed since the END of the previous turn are stale-memory
   * candidates; the agent's own mid-turn edits stay out of the next window
   * (endTurn closes it after they happen).
   */
  beginTurn(projectRoot: string, loreSeed = ''): void {
    const changed = this._collectChangedSince(
      projectRoot,
      this._lastTurnEndedAt.get(projectRoot)
    )
    const events = this._projectEvents.get(projectRoot) ?? []
    this._projectEvents.delete(projectRoot)
    this._turnFreshness.set(projectRoot, { changed, events })
    this._turnLoreSeed.set(projectRoot, loreSeed)
    this._turnLoreSection.delete(projectRoot)
  }

  /** The turn finished (success or failure) — close the freshness window. */
  endTurn(projectRoot: string): void {
    this._lastTurnEndedAt.set(projectRoot, Date.now())
    this._turnFreshness.delete(projectRoot)
    this._turnLoreSeed.delete(projectRoot)
    this._turnLoreSection.delete(projectRoot)
  }

  /**
   * Codex-style bible auto-injection, computed once per turn. Seed =
   * the writer's message (frozen at beginTurn) + the live selection +
   * the open scene's prose, so entities in play — named OR just present
   * in the scene being drafted — get their canon pages inlined.
   */
  private async _buildTurnLore(
    projectRoot: string,
    leaves: INovelUnit[]
  ): Promise<string> {
    const cached = this._turnLoreSection.get(projectRoot)
    if (cached !== undefined) return cached
    const seed = this._turnLoreSeed.get(projectRoot)
    if (seed === undefined) return '' // no active turn (probe/manual build)

    const seedParts: string[] = [seed]
    const ctx = this._sessionContext
    if (ctx?.selection?.text) seedParts.push(ctx.selection.text)
    if (ctx?.currentUnitId) {
      const open = leaves.find((l) => l.id === ctx.currentUnitId)
      if (open?.path) {
        try {
          seedParts.push(fs.readFileSync(path.join(projectRoot, open.path), 'utf8'))
        } catch {
          // Open scene unreadable — skip; mention detection still runs on the rest.
        }
      }
    }
    let section = ''
    try {
      const { buildLoreSection } = await import('../novel/LoreInjection')
      section = await buildLoreSection(projectRoot, seedParts.join('\n'))
    } catch {
      section = ''
    }
    this._turnLoreSection.set(projectRoot, section)
    return section
  }

  /**
   * Files touched outside the agent session since `since` — the agent's
   * memory of them is stale. Pure read: never mutates markers.
   */
  private _collectChangedSince(projectRoot: string, since: number | undefined): string[] {
    if (!since) return []
    const changed: string[] = []
    const walk = (dir: string): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (changed.length >= 20) return
        if (entry.name.startsWith('.') || entry.name === 'exports') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name.endsWith('.md')) {
          try {
            if (fs.statSync(full).mtimeMs > since) {
              changed.push(path.relative(projectRoot, full))
            }
          } catch {
            // Vanished mid-walk.
          }
        }
      }
    }
    walk(projectRoot)
    return changed
  }

  /**
   * The freshness signals for this brief build: the turn-frozen snapshot
   * when a turn is active, else the legacy per-build fallback (direct
   * orchestrator use, tests, live harness).
   */
  private _freshnessForBuild(projectRoot: string): { changed: string[]; events: string[] } {
    const turn = this._turnFreshness.get(projectRoot)
    if (turn) return turn
    const since = this._lastBriefAt.get(projectRoot)
    this._lastBriefAt.set(projectRoot, Date.now())
    const events = this._projectEvents.get(projectRoot) ?? []
    this._projectEvents.delete(projectRoot)
    return { changed: this._collectChangedSince(projectRoot, since), events }
  }

  /**
   * Scene handoff for drafters: find the first unit id referenced in the
   * task (the brief's `<id:…>` format), locate the PRECEDING prose unit in
   * narrative order, and return the tail of its prose. Null when the task
   * names no unit, the unit is first, or the neighbor has no prose yet.
   */
  async buildSceneHandoff(projectRoot: string | null, task: string): Promise<string | null> {
    if (!projectRoot) return null
    const idMatch = /<id:([^>\s]+)>/.exec(task)
    if (!idMatch) return null
    try {
      const structure = await structureService.loadReconciled(projectRoot)
      const leaves = collectLeaves(structure.units)
      const index = leaves.findIndex((leaf) => leaf.id === idMatch[1])
      if (index <= 0) return null
      const previous = leaves[index - 1]
      if (!previous.path) return null
      const prose = (
        await fsPromises.readFile(path.join(projectRoot, previous.path), 'utf8')
      ).trim()
      if (!prose) return null
      const tokens = prose.split(/\s+/)
      const tail = tokens.slice(-HANDOFF_WORDS).join(' ')
      return (
        `PREVIOUS SCENE ENDS ("${previous.title}" — for continuity: match the voice, ` +
        'pick up time/place/open threads from here; do not retell it):\n…' +
        tail
      )
    } catch {
      return null
    }
  }

  /**
   * Build the project brief for the active project root. Returns '' when
   * no project is open (the agents then work purely conversationally).
   */
  async buildProjectBrief(projectRoot: string | null): Promise<string> {
    if (!projectRoot) return ''
    try {
      const structure = await structureService.loadReconciled(projectRoot)
      const leaves = collectLeaves(structure.units)
      const totalWords = leaves.reduce((sum, l) => sum + (l.wordCount ?? 0), 0)

      // Cheap project-state signals so the AI knows the MATURITY of the
      // project at a glance (fresh vs drafted vs maintained).
      const biblePages = countFiles(path.join(projectRoot, 'bible'), '.md')
      const summaries = countFiles(path.join(projectRoot, '.wordbird', 'summaries'), '.md')
      const plans = countFiles(path.join(projectRoot, 'plans'), '.md')
      let factCount = 0
      try {
        const { factService } = await import('../novel/FactService')
        factCount = await factService.count(projectRoot)
      } catch {
        // Ledger unreadable — treat as empty.
      }

      const sections: string[] = []
      sections.push(
        'PROJECT BRIEF (auto-generated — the novel as it stands right now):\n' +
        `Layout: ${structure.flavor} · ${leaves.length} prose unit${leaves.length === 1 ? '' : 's'} · ${words(totalWords)} words total · ` +
        `${biblePages} bible page${biblePages === 1 ? '' : 's'} · ${summaries} summar${summaries === 1 ? 'y' : 'ies'} · ${plans} plan${plans === 1 ? '' : 's'}` +
        (factCount > 0
          ? ` · ${factCount} recorded fact${factCount === 1 ? '' : 's'} (list_facts)`
          : '')
      )

      // Standing instructions (the CLAUDE.md of the novel): writer-editable
      // rules that survive compaction because they ride every brief. The
      // cap is shared with ProjectHealth so overflow always gets flagged.
      try {
        const instructions = (
          await fsPromises.readFile(path.join(projectRoot, 'biscuit.md'), 'utf8')
        ).trim()
        if (instructions) {
          const clipped =
            instructions.length > MAX_INSTRUCTIONS_CHARS
              ? instructions.slice(0, MAX_INSTRUCTIONS_CHARS) + '…[trimmed]'
              : instructions
          sections.push(
            "WRITER'S STANDING INSTRUCTIONS (biscuit.md — writer-editable; obey these, " +
            'second only to the writer\'s live words):\n' + clipped
          )
        }
      } catch {
        // No biscuit.md — nothing standing.
      }

      // Skills: catalog every turn (cheap), pinned bodies in full (the
      // writer explicitly loaded those — that's what the pin means).
      try {
        const skills = listSkills(projectRoot)
        if (skills.length > 0) {
          const MAX_CATALOG = 10
          const catalog = skills
            .slice(0, MAX_CATALOG)
            .map((skill) => `${skill.name} — ${skill.description}`)
            .join('\n')
          const more = skills.length > MAX_CATALOG ? `\n…+${skills.length - MAX_CATALOG} more (list_skills)` : ''
          sections.push(
            `SKILLS AVAILABLE (writer-authored techniques — use_skill loads one when the task matches):\n${catalog}${more}`
          )

          const pinned = readPinnedSkills(projectRoot)
          if (pinned.length > 0) {
            const bodies: string[] = []
            for (const file of pinned) {
              const skill = readSkill(projectRoot, file)
              if (!skill) {
                bodies.push(`(${file} is pinned but missing — tell the writer)`)
                continue
              }
              const body =
                skill.body.length > MAX_SKILL_BODY_CHARS
                  ? skill.body.slice(0, MAX_SKILL_BODY_CHARS) + '…[trimmed]'
                  : skill.body
              bodies.push(`## ${skill.meta.name}\n${body}`)
            }
            sections.push(
              'PINNED SKILLS (the writer loaded these — follow them):\n' + bodies.join('\n\n')
            )
          }
        }
      } catch {
        // Skills are additive — a bad skills/ dir never breaks the brief.
      }

      // Durable research: announce what is already on file so the same
      // topic is never re-researched (the notes live in bible/research/).
      try {
        const researchDir = path.join(projectRoot, 'bible', 'research')
        // Recursive: notes may live in topic subfolders (elam/politics.md).
        const notes = listFilesRecursive(researchDir, /\.(md|markdown)$/i)
        if (notes.length > 0) {
          const MAX_NOTES = 12
          const lines = notes.slice(0, MAX_NOTES).map((name) => {
            try {
              const content = fs.readFileSync(path.join(researchDir, name), 'utf8')
              const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
              return `- bible/research/${name}${heading ? ` — ${heading}` : ''}`
            } catch {
              return `- bible/research/${name}`
            }
          })
          const more =
            notes.length > MAX_NOTES ? `\n…+${notes.length - MAX_NOTES} more (list_files)` : ''
          sections.push(
            'RESEARCH ON FILE (already researched — read/cite these before any new web ' +
            `research; save new findings with save_research):\n${lines.join('\n')}${more}`
          )
        }
      } catch {
        // No research yet.
      }

      // Voice exemplars: the writer's own prose, so drafters/line-editors
      // match the VOICE instead of producing "clean stranger" output.
      try {
        const { buildVoiceSection } = await import('../novel/VoicePriming')
        const voice = buildVoiceSection(projectRoot)
        if (voice) sections.push(voice)
      } catch {
        // No exemplars — style.md doctrine still applies.
      }

      // Settled creative choices: agents must never relitigate these.
      try {
        const decisions = listDecisions(projectRoot)
        if (decisions.length > 0) {
          const MAX_SHOWN = 8
          const recent = decisions
            .slice(-MAX_SHOWN)
            .map((d) => `- ${d.decision}${d.reason ? ` (why: ${d.reason})` : ''}`)
            .join('\n')
          const more =
            decisions.length > MAX_SHOWN
              ? `\n…+${decisions.length - MAX_SHOWN} earlier (list_decisions)`
              : ''
          sections.push(
            `DECISIONS (settled by the writer — never propose against these):\n${recent}${more}`
          )
        }
      } catch {
        // Decisions are additive — never break the brief.
      }

      // Deterministic sync status: standing pressure until the project is
      // clean (survives crashes, model failures, skipped passes).
      try {
        const health = await checkProjectHealth(projectRoot)
        const line = healthBriefLine(health)
        if (line) sections.push(line)
      } catch {
        // Health is advisory — never break the brief.
      }

      // The writer's METHOD drives which playbook applies.
      const meta = readProjectMeta(projectRoot)
      const hasBeatSheet = fs.existsSync(path.join(projectRoot, 'bible', 'structure.md'))
      const methodBits: string[] = []
      if (meta.planningStyle && meta.planningStyle !== 'unset') {
        methodBits.push(`Method: ${meta.planningStyle}`)
      }
      if (meta.structureTemplate && meta.structureTemplate !== 'unset') {
        methodBits.push(
          `Structure: ${meta.structureTemplate}${hasBeatSheet ? ' (beat sheet: bible/structure.md — map scenes to beats when planning or health-checking)' : ''}`
        )
      } else if (hasBeatSheet) {
        methodBits.push('Structure beat sheet exists at bible/structure.md')
      }
      if (methodBits.length > 0) {
        sections.push(`WRITING METHOD:\n${methodBits.join(' · ')}`)
      } else if (leaves.length > 0) {
        sections.push(
          'Writing method not recorded — when it comes up naturally, ask the writer how ' +
          'they like to work (outline first / discover as they go / hybrid; structure ' +
          'framework or none) and record it with set_writing_method.'
        )
      }

      // Where the writer is looking right now (view + open scene + working
      // set + live selection), when known.
      // A vantage scoped to a DIFFERENT project describes files this brief has
      // nothing to do with. Drop it whole rather than half-trust it.
      //
      // FAILS CLOSED on an UNDECLARED scope too: main holds one session
      // context for the whole app, so a context sent while no project was
      // open (no projectRoot) outlived the switch and got rendered as the new
      // project's working set. When we are building for a project, an
      // unattributed vantage is not evidence about it.
      const vantageIsForThisProject =
        !projectRoot ||
        (!!this._sessionContext?.projectRoot &&
          path.resolve(this._sessionContext.projectRoot) === path.resolve(projectRoot))
      if (this._sessionContext && vantageIsForThisProject) {
        const ctx = this._sessionContext
        const vantageBits: string[] = [`${ctx.viewMode} view`]
        if (ctx.currentUnitId) {
          const open = leaves.find((l) => l.id === ctx.currentUnitId)
          if (open) vantageBits.push(`open scene: "${open.title}" <id:${open.id}>`)
        } else if (ctx.currentFile) {
          vantageBits.push(`open file: ${ctx.currentFile}`)
        }
        if (ctx.openTabs && ctx.openTabs.length > 0) {
          const shown = ctx.openTabs.slice(0, MAX_TAB_NAMES).join(', ')
          const more = ctx.openTabs.length > MAX_TAB_NAMES
            ? ` +${ctx.openTabs.length - MAX_TAB_NAMES} more`
            : ''
          vantageBits.push(`open tabs: ${shown}${more}`)
        }
        if (ctx.unsavedTabs && ctx.unsavedTabs.length > 0) {
          vantageBits.push(
            `UNSAVED changes in: ${ctx.unsavedTabs.slice(0, MAX_TAB_NAMES).join(', ')} ` +
            '(the files on disk may lag what the writer sees)'
          )
        }
        const lines = [`WRITER'S VANTAGE: ${vantageBits.join(' · ')}`]
        const selected = ctx.selection?.text?.trim()
        if (selected) {
          const excerpt =
            selected.length > MAX_SELECTION_CHARS
              ? selected.slice(0, MAX_SELECTION_CHARS) + '…'
              : selected
          lines.push(
            `SELECTED TEXT${ctx.selection?.file ? ` (in ${ctx.selection.file})` : ''} — when ` +
            'the writer says "this"/"it", they usually mean this passage:\n' +
            `"${excerpt}"`
          )
        }
        sections.push(lines.join('\n'))
      }

      if (leaves.length === 0 && totalWords === 0) {
        sections.push(
          'EMPTY PROJECT: no prose exists yet. Follow the NEW PROJECT playbook — ' +
          'interview the writer about premise/genre/voice, then OFFER to seed the bible, ' +
          'style page, and chapter/scene shells. Do not assume any existing content.'
        )
      } else if (biblePages === 0) {
        let importedFrom: string | undefined
        try {
          const raw = JSON.parse(
            fs.readFileSync(path.join(projectRoot, '.wordbird', 'project.json'), 'utf8')
          ) as { importedFrom?: string }
          if (typeof raw.importedFrom === 'string') importedFrom = raw.importedFrom
        } catch {
          // No/invalid marker — treat as a normal no-bible project.
        }
        sections.push(
          importedFrom
            ? `FRESHLY IMPORTED (from ${importedFrom}): a full manuscript was imported but ` +
              'has no canon yet. Follow the POST-IMPORT playbook — OFFER a retro-outline pass ' +
              'and review-gated bible extraction (mine recurring names via project_health, ' +
              'propose a page with aliases for each, stating only what the prose establishes).'
            : 'NO STORY BIBLE YET: prose exists but no canon pages. When characters or places ' +
              'come up, offer to establish bible pages for them (with aliases) so future work ' +
              'stays consistent.'
        )
      }

      const outline = renderOutline(structure.units)
      if (outline) {
        sections.push(`MANUSCRIPT OUTLINE:\n${outline}`)
      }

      // WHO'S WHERE — the deterministic entity index makes orientation one
      // glance instead of N tool calls (details via where_appears).
      const whosWhere = await this._renderWhosWhere(projectRoot)
      if (whosWhere) {
        sections.push(`WHO'S WHERE (bible entities in the prose — details: where_appears):\n${whosWhere}`)
      }

      // Codex-style bible auto-injection: the FULL pages for entities in
      // play this turn, inlined so agents write consistent canon without
      // a read_bible round-trip (the #1 consistency-failure fix).
      const lore = await this._buildTurnLore(projectRoot, leaves)
      if (lore) sections.push(lore)

      // Book-level summary from the agent-maintained ladder, if present.
      const bookSummaryPath = path.join(projectRoot, '.wordbird', 'summaries', 'book.md')
      if (fs.existsSync(bookSummaryPath)) {
        try {
          const summary = (await fsPromises.readFile(bookSummaryPath, 'utf8')).trim()
          if (summary) {
            const clipped =
              summary.length > MAX_BOOK_SUMMARY_CHARS
                ? summary.slice(0, MAX_BOOK_SUMMARY_CHARS) + '…'
                : summary
            sections.push(`BOOK SUMMARY (may lag the prose — verify with read_summary):\n${clipped}`)
          }
        } catch {
          // Unreadable summary — skip.
        }
      }

      // Freshness signals: out-of-band events (History-panel rewinds) and
      // files changed outside this agent session. Turn-frozen, so every
      // supervisor iteration and every worker sees the same warning.
      const { changed, events } = this._freshnessForBuild(projectRoot)
      if (events.length > 0) {
        sections.push(`PROJECT EVENTS SINCE YOUR LAST TURN:\n${events.map((e) => `- ${e}`).join('\n')}`)
      }
      if (changed.length > 0) {
        sections.push(
          'CHANGED SINCE YOUR LAST TURN (writer edits, applied reviews, or a rewind — ' +
          `your memory of these is STALE, re-read before relying on it): ${changed.join(', ')}`
        )
      }

      // Whole-book progress: the freshest live plan is the work queue — one
      // line tells every turn how far the endeavor has come.
      const planProgress = this._activePlanProgress(projectRoot)
      if (planProgress) {
        sections.push(`ACTIVE PLAN: ${planProgress}`)
      }

      // In-flight sweeping revisions: every turn must know one is active.
      const active = await revisionService.listActive(projectRoot)
      if (active.length > 0) {
        const lines = active.map((r) => {
          const progress = RevisionService.progress(r)
          return `- ${r.title} <id:${r.id}> — ${r.status}, ${progress.done}/${progress.total} units handled`
        })
        sections.push(
          `ACTIVE REVISION${active.length > 1 ? 'S' : ''} (continue via get_revision):\n` +
          lines.join('\n')
        )
      }

      // Open continuity issues: the agent should not re-introduce known problems.
      const issues = (await continuityService.list(projectRoot)).filter(
        (i) => i.status === 'open'
      )
      if (issues.length > 0) {
        const top = issues
          .slice(0, MAX_ISSUES)
          .map((i) => `- [${i.severity}] ${i.title}`)
          .join('\n')
        const more = issues.length > MAX_ISSUES ? `\n… ${issues.length - MAX_ISSUES} more` : ''
        sections.push(`OPEN CONTINUITY ISSUES:\n${top}${more}`)
      }

      // The brief inlines file-derived text (research headings, decision
      // lines, aliases, biscuit.md, skill bodies) into EVERY agent's
      // system prompt — defang harness-frame lookalikes wholesale.
      // Genuine frames are messages, never brief content, so this is
      // total coverage with zero false positives.
      return neutralizeHarnessMarkers(sections.join('\n\n'))
    } catch {
      return ''
    }
  }

  /** Compact entity-appearance lines, capped; '' when no entities exist. */
  private async _renderWhosWhere(projectRoot: string): Promise<string> {
    try {
      const index = await getEntityIndex(projectRoot)
      if (index.entities.length === 0) return ''
      const MAX_ENTITY_LINES = 12
      const seen = index.entities.filter((e) => e.appearances.length > 0)
      const unseen = index.entities.length - seen.length
      const lines = seen
        .sort(
          (a, b) =>
            b.appearances.reduce((s, x) => s + x.count, 0) -
            a.appearances.reduce((s, x) => s + x.count, 0)
        )
        .slice(0, MAX_ENTITY_LINES)
        .map((entity) => {
          const spots = entity.appearances
            .slice(0, 4)
            .map((a) => `${a.title} (${a.count})`)
            .join(', ')
          const more =
            entity.appearances.length > 4 ? ` +${entity.appearances.length - 4} more` : ''
          return `- ${entity.name}: ${spots}${more}`
        })
      if (unseen > 0) {
        lines.push(`- ${unseen} bible entit${unseen === 1 ? 'y' : 'ies'} not yet in the prose`)
      }
      return lines.join('\n')
    } catch {
      return ''
    }
  }

  /**
   * "plans/novella.md — 7/22 items done" for the most recently modified
   * plan that still has unchecked items ('' when none).
   */
  private _activePlanProgress(projectRoot: string): string {
    try {
      const dir = path.join(projectRoot, 'plans')
      let newest: { file: string; mtime: number } | null = null
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.md')) continue
        const mtime = fs.statSync(path.join(dir, entry)).mtimeMs
        if (!newest || mtime > newest.mtime) newest = { file: entry, mtime }
      }
      if (!newest) return ''
      const text = fs.readFileSync(path.join(dir, newest.file), 'utf8')
      const done = (text.match(/- \[x\]/gi) ?? []).length
      const open = (text.match(/- \[ \]/g) ?? []).length
      if (open === 0) return ''
      return `plans/${newest.file} — ${done}/${done + open} items done (read it before working)`
    } catch {
      return ''
    }
  }
}

export const contextBuilder = new ContextBuilder()
