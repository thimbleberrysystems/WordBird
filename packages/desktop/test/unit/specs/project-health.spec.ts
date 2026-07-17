/**
 * ProjectHealth — the deterministic half of the overseeing layer. Every
 * check must fire on a crafted dirty fixture and stay silent on a clean
 * one; the steward role and the prompt doctrine that consume it are
 * pinned here too.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  checkProjectHealth,
  clearHealthCache,
  healthBriefLine,
  mineNameCandidates
} from '../../../src/main/services/novel/ProjectHealth'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { buildSupervisorPrompt } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES, HEAVY_ROLES } from '../../../src/main/services/ai/orchestrator/roles'
import { structureService } from '../../../src/main/services/novel/StructureService'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

let root: string

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

const PROSE_A =
  'Zara waited on the jetty. Ilsabet Crane came down the steps twice, and ' +
  'Ilsabet Crane spoke of the storm to come.\n'
const PROSE_B =
  'By morning Ilsabet Crane had gone. Zara searched the tideline and found ' +
  'only rope and weed.\n'

const makeDirtyProject = async(): Promise<void> => {
  write(
    '.wordbird/project.json',
    // Template set but no bible/structure.md beat sheet → template-mismatch.
    JSON.stringify({ name: 'H', flavor: 'chapters-scenes', structureTemplate: 'three-act' })
  )
  write('manuscript/chapter-one/one.md', PROSE_A)
  write('manuscript/chapter-one/two.md', PROSE_B)
  // Zara HAS a bible page; Ilsabet Crane deliberately does not.
  write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara Voss\n')
  // A second page claiming the SAME alias → duplicate-aliases.
  write('bible/characters/imposter.md', '---\naliases: [Zara]\n---\n# The Imposter\n')
  // A page for an entity in no scene, with no aliases →
  // orphan-bible-pages + missing-aliases.
  write('bible/characters/ghost.md', '# Casper Ghost\n')
  // Banned term that PROSE_B actually contains → banned-terms.
  write('bible/style.md', '## Banned words\n\n- tideline\n')
  // Orphan prose file the binder does not know about.
  write('manuscript/loose-scene.md', 'An orphaned fragment.\n')
  write('plans/draft.md', '# Plan\n\n- [ ] step one\n- [x] done\n')
  // Forked canon + a fact citing a deleted unit.
  write(
    '.wordbird/continuity/facts.json',
    JSON.stringify({
      facts: [
        { id: 'f1', subject: 'Zara Voss', relation: 'eye color', object: 'grey', at: 1 },
        { id: 'f2', subject: 'zara voss', relation: 'Eye Color', object: 'green', at: 2 },
        { id: 'f3', subject: 'Zara Voss', relation: 'home', object: 'the lighthouse', sourceUnitId: 'u-deleted', at: 3 }
      ]
    })
  )
  // Open issue pointing at a file that no longer exists.
  write(
    '.wordbird/continuity/issues.json',
    JSON.stringify([
      {
        id: 'i1',
        title: 'Storm timing',
        description: 'x',
        severity: 'low',
        relatedPaths: ['manuscript/vanished.md'],
        status: 'open',
        createdAt: new Date().toISOString()
      }
    ])
  )
  // Summary for a unit that no longer exists.
  write('.wordbird/summaries/u_gone.md', 'A summary nobody owns.')
  // Standing instructions past the brief cap → biscuit-overflow.
  write('biscuit.md', 'Keep the prose tight. '.repeat(120))
  // A revision "active" for 20 days → stale-revisions.
  write(
    '.wordbird/revisions/rev-old/revision.json',
    JSON.stringify({
      id: 'rev-old',
      title: 'Remove the twin',
      status: 'analyzing',
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      entries: []
    })
  )
  // Two skills sharing a name + a pin to a deleted skill + a malformed
  // decisions line → knowledge-hygiene.
  write('skills/pacing-a.md', '---\nname: pacing\ndescription: one\n---\nBody.\n')
  write('skills/pacing-b.md', '---\nname: pacing\ndescription: two\n---\nBody.\n')
  write('.wordbird/agent-state/session.json', JSON.stringify({ pinnedSkills: ['missing.md'] }))
  write(
    'bible/decisions.md',
    '# Decisions\n\n- **2026-07-01** — Zara keeps the lighthouse. _Why: theme._\n' +
      '- **2026-7-2** — malformed date, silently invisible\n'
  )
  // Build the structure from disk, then STRIP metadata + plant structure rot.
  const structure = await structureService.loadReconciled(root)
  for (const unit of structure.units) {
    for (const child of unit.children ?? []) {
      delete child.synopsis
      delete child.pov
      delete child.when
      delete child.thread
    }
  }
  // Remove the orphan from the manifest so it is genuinely unknown.
  for (const unit of structure.units) {
    if (unit.children) {
      unit.children = unit.children.filter((c) => c.path !== 'manuscript/loose-scene.md')
    }
  }
  structure.units = structure.units.filter((u) => u.path !== 'manuscript/loose-scene.md')
  // Duplicate id + invalid status + an empty container.
  const chapter = structure.units.find((u) => (u.children ?? []).length >= 2)
  if (chapter?.children) {
    chapter.children[1].id = chapter.children[0].id
    ;(chapter.children[0] as { status?: string }).status = 'polished'
  }
  structure.units.push({
    id: 'empty-part',
    type: 'part',
    title: 'Empty Part',
    children: []
  } as never)
  await structureService.save(root, structure)
}

beforeEach(() => {
  clearHealthCache()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-health-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('mineNameCandidates', () => {
  it('finds recurring unknown names, skips known/stopword/common-word hits', () => {
    const files = [
      { file: 'a.md', text: PROSE_A },
      { file: 'b.md', text: PROSE_B }
    ]
    const found = mineNameCandidates(files, new Set(['zara', 'zara voss']))
    expect(found).toContain('Ilsabet Crane')
    expect(found).not.toContain('Zara')
    expect(found.join(' ')).not.toMatch(/\bThe\b|\bBy\b/)
  })

  it('requires recurrence across files (one-offs stay quiet)', () => {
    const found = mineNameCandidates(
      [{ file: 'a.md', text: 'Wexley Marsh appeared once. Wexley Marsh again. Wexley Marsh thrice.' }],
      new Set()
    )
    expect(found).toHaveLength(0) // 3 mentions but only 1 file
  })

  it('single-file projects fire at the raised recurrence bar', () => {
    const five = Array(5).fill('Wexley Marsh spoke.').join(' ')
    const found = mineNameCandidates([{ file: 'a.md', text: five }], new Set())
    expect(found).toContain('Wexley Marsh')
  })

  it('honorific-prefixed surnames are mined ("Mrs Crane" → Crane)', () => {
    const files = [
      { file: 'a.md', text: 'Mrs Crane opened the door. Mrs Crane frowned.' },
      { file: 'b.md', text: 'By dusk Mrs Crane had gone home.' }
    ]
    expect(mineNameCandidates(files, new Set())).toContain('Crane')
  })

  it('the 12-cap keeps the MOST FREQUENT names, not the alphabetical ones', () => {
    // 12 alphabetically-early names at the minimum count, plus one
    // alphabetically-LAST name far above them — it must survive the cap.
    const filler = Array.from({ length: 12 }, (_, i) => {
      const name = `Aaron B${String.fromCharCode(97 + i)}xter`
      return `${name} spoke. ${name} paused. ${name} left.`
    })
    const frequent = Array(10).fill('Zora Zenith sang.').join(' ')
    const files = [
      { file: 'a.md', text: `${filler.join(' ')} ${frequent}` },
      { file: 'b.md', text: `${filler.join(' ')} ${frequent}` }
    ]
    const found = mineNameCandidates(files, new Set())
    expect(found).toHaveLength(12)
    expect(found).toContain('Zora Zenith')
  })
})

describe('checkProjectHealth on a dirty project', () => {
  it('fires every warn-class check', async() => {
    await makeDirtyProject()
    const report = await checkProjectHealth(root)
    expect(report.clean).toBe(false)
    const ids = report.findings.map((f) => f.id)

    expect(ids).toContain('missing-synopsis')
    expect(ids).toContain('missing-pov')
    expect(ids).toContain('missing-when')
    expect(ids).toContain('stale-summaries') // no summaries exist at all
    expect(ids).toContain('unlisted-entities')
    expect(ids).toContain('orphan-files')
    expect(ids).toContain('open-plan-items')

    const unlisted = report.findings.find((f) => f.id === 'unlisted-entities')
    expect(unlisted?.message).toContain('Ilsabet Crane')
    const orphans = report.findings.find((f) => f.id === 'orphan-files')
    expect(orphans?.items).toContain('manuscript/loose-scene.md')
  })

  it('fires every gap-closure check with the planted rot', async() => {
    await makeDirtyProject()
    const report = await checkProjectHealth(root)
    const byId = new Map(report.findings.map((f) => [f.id, f]))

    // Forked canon is a WARN with both objects named.
    expect(byId.get('contradictory-facts')?.severity).toBe('warn')
    expect(byId.get('contradictory-facts')?.items?.join(' ')).toMatch(/grey.*green|green.*grey/)
    expect(byId.get('orphan-fact-sources')?.items?.join(' ')).toContain('u-deleted')
    expect(byId.get('orphan-issue-paths')?.items?.join(' ')).toContain('manuscript/vanished.md')
    expect(byId.get('orphan-summaries')?.items).toContain('u_gone.md')

    expect(byId.get('duplicate-aliases')?.severity).toBe('warn')
    expect(byId.get('duplicate-aliases')?.items?.join(' ')).toContain('zara')
    expect(byId.get('orphan-bible-pages')?.items?.join(' ')).toContain('Casper Ghost')
    expect(byId.get('missing-aliases')?.items?.join(' ')).toContain('ghost.md')

    expect(byId.get('biscuit-overflow')?.severity).toBe('warn')
    expect(byId.get('stale-revisions')?.items?.join(' ')).toContain('Remove the twin')
    expect(byId.get('template-mismatch')?.message).toContain('three-act')
    expect(byId.get('banned-terms')?.items?.join(' ')).toContain('tideline')

    expect(byId.get('duplicate-unit-ids')?.severity).toBe('warn')
    expect(byId.get('invalid-unit-status')?.items?.join(' ')).toContain('polished')
    expect(byId.get('empty-containers')?.items?.join(' ')).toContain('Empty Part')

    const knowledge = byId.get('knowledge-hygiene')
    expect(knowledge?.items?.join(' ')).toContain('pacing')
    expect(knowledge?.items?.join(' ')).toContain('missing.md')
    expect(knowledge?.items?.join(' ')).toMatch(/decisions\.md line/)
  })

  it('binder-vs-disk: a unit whose file vanished is flagged', async() => {
    await makeDirtyProject()
    fs.rmSync(path.join(root, 'manuscript/chapter-one/two.md'))
    clearHealthCache()
    const report = await checkProjectHealth(root)
    expect(report.findings.some((f) => f.id === 'binder-missing-files')).toBe(true)
  })

  it('cache: same signature is reused, prose touch invalidates', async() => {
    await makeDirtyProject()
    // Call 1 reconcile-adopts the orphan (raw manifest changes), so the
    // cache settles from call 2 onward — the rawstructure signature part
    // is exactly what keeps binder findings from going stale.
    await checkProjectHealth(root)
    const second = await checkProjectHealth(root)
    const third = await checkProjectHealth(root)
    expect(third.generatedAt).toBe(second.generatedAt) // cached object

    await new Promise((resolve) => setTimeout(resolve, 10))
    write('manuscript/chapter-one/one.md', PROSE_A + 'A new line.\n')
    const fourth = await checkProjectHealth(root)
    expect(fourth.signature).not.toBe(second.signature)
  })

  it('cache: a .txt orphan appearing under manuscript/ invalidates', async() => {
    await makeDirtyProject()
    await checkProjectHealth(root)
    const settled = await checkProjectHealth(root)
    write('manuscript/notes-fragment.txt', 'A stray text file.\n')
    const after = await checkProjectHealth(root)
    expect(after.signature).not.toBe(settled.signature)
  })

  it('binder-missing-files clears once reconcile prunes the unit', async() => {
    await makeDirtyProject()
    fs.rmSync(path.join(root, 'manuscript/chapter-one/two.md'))
    clearHealthCache()
    const first = await checkProjectHealth(root)
    expect(first.findings.some((f) => f.id === 'binder-missing-files')).toBe(true)
    // Reconcile pruned the vanished unit during the first call; the raw
    // manifest now differs, so the next call recomputes and the warn clears.
    const second = await checkProjectHealth(root)
    expect(second.findings.some((f) => f.id === 'binder-missing-files')).toBe(false)
  })

  it('a failing check surfaces as health-check-errors, never silence', async() => {
    await makeDirtyProject()
    // A corrupt ledger entry (non-string subject) makes the facts check
    // throw mid-analysis — the report must say so, not swallow it.
    write(
      '.wordbird/continuity/facts.json',
      JSON.stringify({ facts: [{ id: 'f1', subject: 123, relation: 'is', object: 'x', at: 1 }] })
    )
    clearHealthCache()
    const report = await checkProjectHealth(root)
    const errors = report.findings.find((f) => f.id === 'health-check-errors')
    expect(errors).toBeDefined()
    expect(errors?.items?.join(' ')).toContain('facts')
  })
})

describe('a clean project stays quiet', () => {
  it('no warn findings when everything is synced', async() => {
    write('.wordbird/project.json', JSON.stringify({ name: 'C', flavor: 'chapters-scenes' }))
    write('manuscript/chapter-one/one.md', 'Zara waited.\n')
    write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara\n')
    const structure = await structureService.loadReconciled(root)
    for (const unit of structure.units) {
      for (const child of unit.children ?? []) {
        child.synopsis = 'Zara waits.'
        child.status = 'draft'
        child.pov = 'Zara'
        child.when = 'Day 1'
        child.thread = 'Main'
      }
    }
    await structureService.save(root, structure)
    // Fresh summaries newer than the prose.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const leaves = structure.units.flatMap((u) => u.children ?? [])
    for (const leaf of leaves) {
      write(`.wordbird/summaries/${leaf.id}.md`, 'Zara waits at the jetty.')
    }
    write('.wordbird/summaries/book.md', 'A woman waits.')

    clearHealthCache()
    const report = await checkProjectHealth(root)
    const warns = report.findings.filter((f) => f.severity === 'warn')
    expect(warns).toEqual([])
    expect(report.clean).toBe(true)
    expect(healthBriefLine(report)).toBe('')
  })
})

describe('integration: tool, brief, role, doctrine', () => {
  it('project_health tool returns the report through the pack', async() => {
    await makeDirtyProject()
    const service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
    service.loadToolPack(await loader.loadPack(TOOL_PACK))
    service.setProjectRoot(root)
    type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
    const handler = (
      service as unknown as { _handlers: Map<string, Handler> }
    )._handlers.get('project_health')!
    const result = (await handler({}, { projectRoot: root })) as { clean: boolean; note: string }
    expect(result.clean).toBe(false)
    expect(result.note).toMatch(/Fix what your role may fix/)
  })

  it('the brief carries the health line only when dirty', async() => {
    await makeDirtyProject()
    clearHealthCache()
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('PROJECT HEALTH:')
    expect(brief).toContain('missing synopsis')
  })

  it('the steward exists with the right tools and no destructive ones', () => {
    const steward = AGENT_ROLES.steward
    expect(steward.displayName).toBe('Project steward')
    // Gap-closure doctrine: contradictions dispatch, never self-resolve.
    expect(steward.systemPrompt).toContain('CONTRADICTORY FACTS')
    expect(steward.systemPrompt).toContain('never pick the winner')
    expect(steward.systemPrompt).toContain('DUPLICATE ALIASES')
    for (const tool of ['project_health', 'update_unit_meta', 'update_summary', 'propose_new_file']) {
      expect(steward.allowedTools).toContain(tool)
    }
    for (const banned of ['delete_unit', 'delete_file', 'restore_snapshot', 'propose_text_edit']) {
      expect(steward.allowedTools).not.toContain(banned)
    }
    expect(HEAVY_ROLES).toContain('steward')
  })

  it('the doctrine enforces the pass and the dispatch rule', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('COHERENCE PASS')
    expect(prompt).toContain('2+ units')
    expect(prompt).toContain('FINDINGS GET FIXED, NOT FILED')
    expect(prompt).toContain('spawn a STEWARD')

    const auto = buildSupervisorPrompt('auto', 6)
    expect(auto).toContain('FINAL segment of a run additionally ends')
  })
})
