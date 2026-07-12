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
import { structureService, collectLeaves } from '../novel/StructureService'
import { continuityService } from '../novel/ContinuityService'
import { revisionService, RevisionService } from '../novel/RevisionService'
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
}

export class ContextBuilder {
  private _sessionContext: ISessionContext | null = null

  /** Where the writer is looking (view + open scene); set from the renderer. */
  setSessionContext(context: ISessionContext | null): void {
    this._sessionContext = context
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

      const sections: string[] = []
      sections.push(
        'PROJECT BRIEF (auto-generated — the novel as it stands right now):\n' +
        `Layout: ${structure.flavor} · ${leaves.length} prose unit${leaves.length === 1 ? '' : 's'} · ${words(totalWords)} words total · ` +
        `${biblePages} bible page${biblePages === 1 ? '' : 's'} · ${summaries} summar${summaries === 1 ? 'y' : 'ies'} · ${plans} plan${plans === 1 ? '' : 's'}`
      )

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

      // Where the writer is looking right now (view + open scene), when known.
      if (this._sessionContext) {
        const vantageBits: string[] = [`${this._sessionContext.viewMode} view`]
        if (this._sessionContext.currentUnitId) {
          const open = leaves.find((l) => l.id === this._sessionContext?.currentUnitId)
          if (open) vantageBits.push(`open scene: "${open.title}" <id:${open.id}>`)
        } else if (this._sessionContext.currentFile) {
          vantageBits.push(`open file: ${this._sessionContext.currentFile}`)
        }
        sections.push(`WRITER'S VANTAGE: ${vantageBits.join(' · ')}`)
      }

      if (leaves.length === 0 && totalWords === 0) {
        sections.push(
          'EMPTY PROJECT: no prose exists yet. Follow the NEW PROJECT playbook — ' +
          'interview the writer about premise/genre/voice, then OFFER to seed the bible, ' +
          'style page, and chapter/scene shells. Do not assume any existing content.'
        )
      } else if (biblePages === 0) {
        sections.push(
          'NO STORY BIBLE YET: prose exists but no canon pages. When characters or places ' +
          'come up, offer to establish bible pages for them (with aliases) so future work ' +
          'stays consistent.'
        )
      }

      const outline = renderOutline(structure.units)
      if (outline) {
        sections.push(`MANUSCRIPT OUTLINE:\n${outline}`)
      }

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

      return sections.join('\n\n')
    } catch {
      return ''
    }
  }
}

export const contextBuilder = new ContextBuilder()
