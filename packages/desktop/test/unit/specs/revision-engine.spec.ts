import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { RevisionService } from '../../../src/main/services/novel/RevisionService'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import {
  parseAliases,
  resolveEntityTerms
} from '../../../src/main/services/ai/NovelToolHandlers'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { structureService } from '../../../src/main/services/novel/StructureService'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'

let root: string
let service: AgentToolService

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

const run = async(handlerId: string, args: Record<string, unknown>): Promise<unknown> => {
  const handler = (
    service as unknown as {
      _handlers: Map<string, (a: Record<string, unknown>, c: unknown) => Promise<unknown>>
    }
  )._handlers.get(handlerId)
  if (!handler) throw new Error(`handler ${handlerId} not registered`)
  return handler(args, { projectRoot: root })
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-rev-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('parseAliases', () => {
  it('parses inline and block alias lists', () => {
    expect(parseAliases('---\naliases: [Liz, Lizzy, "the Widow Hale"]\n---\n# Elizabeth')).toEqual([
      'Liz',
      'Lizzy',
      'the Widow Hale'
    ])
    expect(
      parseAliases('---\nlocked: true\naliases:\n  - Marc\n  - Marco\n---\n# Marcus')
    ).toEqual(['Marc', 'Marco'])
  })

  it('returns empty without front matter or aliases', () => {
    expect(parseAliases('# Marcus\nNo front matter.')).toEqual([])
    expect(parseAliases('---\nlocked: true\n---\n# Marcus')).toEqual([])
  })
})

describe('resolveEntityTerms', () => {
  it('resolves a bible page by heading, filename, or alias', async() => {
    write(
      'bible/characters/marcus.md',
      '---\naliases: [Marc, the Lieutenant]\n---\n# Marcus Vane\n\nA soldier.'
    )
    const byHeading = await resolveEntityTerms(root, 'Marcus Vane')
    expect(byHeading.terms).toEqual(
      expect.arrayContaining(['Marcus Vane', 'Marc', 'the Lieutenant'])
    )
    expect(byHeading.biblePage).toContain('marcus.md')

    const byAlias = await resolveEntityTerms(root, 'marc')
    expect(byAlias.terms).toEqual(expect.arrayContaining(['Marcus Vane', 'the Lieutenant']))

    const byFilename = await resolveEntityTerms(root, 'marcus')
    expect(byFilename.biblePage).toContain('marcus.md')
  })

  it('falls back to the raw name without a bible page', async() => {
    const result = await resolveEntityTerms(root, 'Nobody')
    expect(result.terms).toEqual(['Nobody'])
    expect(result.biblePage).toBeNull()
  })
})

describe('entity-aware search_manuscript', () => {
  it('finds alias references a plain query would miss', async() => {
    write(
      'bible/characters/marcus.md',
      '---\naliases: [Marc]\n---\n# Marcus Vane\n'
    )
    write('manuscript/chapter-one/a.md', 'Marcus stood at the gate.')
    write('manuscript/chapter-one/b.md', 'Marc waved from the tower.')
    write('manuscript/chapter-one/c.md', 'Nobody else was there.')

    const plain = (await run('search_manuscript', { query: 'Marcus' })) as {
      matches: Array<{ file: string }>
    }
    expect(plain.matches.some((m) => m.file.includes('b.md'))).toBe(false)

    const entity = (await run('search_manuscript', { entity: 'Marcus Vane' })) as {
      matches: Array<{ file: string }>
      biblePage: string | null
    }
    const files = entity.matches.map((m) => m.file)
    expect(files.some((f) => f.includes('a.md'))).toBe(true)
    expect(files.some((f) => f.includes('b.md'))).toBe(true)
    expect(files.some((f) => f.includes('c.md'))).toBe(false)
    expect(entity.biblePage).toContain('marcus.md')
  })
})

describe('RevisionService lifecycle', () => {
  const svc = new RevisionService()

  it('creates with a protective snapshot, maps, marks, resumes, completes', async() => {
    const revision = await svc.create(root, 'Remove Marcus', '# Directive\nMarcus never existed.')
    expect(revision.status).toBe('analyzing')

    await svc.updateImpactMap(root, revision.id, [
      { unitId: 'u1', path: 'a.md', classification: 'rewrite', evidence: 'q1', plan: 'p1' },
      { unitId: 'u2', path: 'b.md', classification: 'mention-only', evidence: 'q2', plan: 'p2' }
    ])

    await svc.markUnit(root, revision.id, 'u1', 'done', 'edits proposed')

    // "Restart": a brand-new service instance reads the same disk state.
    const revived = new RevisionService()
    const loaded = await revived.get(root, revision.id)
    expect(loaded?.revision.status).toBe('executing')
    expect(loaded?.directive).toContain('never existed')
    const progress = RevisionService.progress(loaded!.revision)
    expect(progress).toEqual({ done: 1, total: 2, pending: ['u2'] })

    await revived.markUnit(root, revision.id, 'u2', 'skipped', 'no change needed')
    const completed = await revived.complete(root, revision.id, 'Verified: zero references.')
    expect(completed.status).toBe('completed')
    expect((await revived.listActive(root))).toHaveLength(0)
  })

  it('merges impact entries by unitId preserving progress', async() => {
    const revision = await svc.create(root, 'R', 'd')
    await svc.updateImpactMap(root, revision.id, [
      { unitId: 'u1', classification: 'rewrite', evidence: 'e', plan: 'p' }
    ])
    await svc.markUnit(root, revision.id, 'u1', 'done')
    await svc.updateImpactMap(root, revision.id, [
      { unitId: 'u1', classification: 'remove', evidence: 'e2', plan: 'p2' },
      { unitId: 'u2', classification: 'mention-only', evidence: 'e3', plan: 'p3' }
    ])
    const loaded = await svc.get(root, revision.id)
    const u1 = loaded!.revision.entries.find((e) => e.unitId === 'u1')!
    expect(u1.classification).toBe('remove')
    expect(u1.status).toBe('done')
    expect(loaded!.revision.entries).toHaveLength(2)
  })
})

describe('revision tools — the Marcus scenario', () => {
  it('runs interview → map → batched execution → verification end to end', async() => {
    // A small book where Marcus (alias Marc) appears in 3 of 5 scenes.
    write('bible/characters/marcus.md', '---\naliases: [Marc]\n---\n# Marcus Vane\n')
    write('manuscript/chapter-one/s1.md', 'Marcus opened the door.')
    write('manuscript/chapter-one/s2.md', 'The rain kept falling.')
    write('manuscript/chapter-one/s3.md', 'Marc lit the lamp for Elara.')
    write('manuscript/chapter-two/s4.md', 'Elara wrote a letter to Marcus.')
    write('manuscript/chapter-two/s5.md', 'The city slept.')
    const structure = await structureService.loadReconciled(root)
    const scenes = structure.units.flatMap((c) => c.children ?? [])

    // 1) Interview happened in chat; supervisor starts the revision.
    const started = (await run('start_revision', {
      title: 'Remove Marcus',
      directive:
        '# Remove Marcus Vane\nAliases: Marcus, Marc.\nHis plot function (helping Elara) passes to Tomas.\nRewrite scenes; do not delete any.'
    })) as { revisionId: string }
    const revisionId = started.revisionId

    // 2) Explorers find every affected unit via entity search and file the map.
    const found = (await run('search_manuscript', { entity: 'Marcus Vane' })) as {
      matches: Array<{ file: string }>
    }
    const affectedPaths = [...new Set(found.matches.map((m) => m.file.replace(/^\.\//, '')))]
    const affected = scenes.filter((s) =>
      affectedPaths.some((p) => p.replace(/\\/g, '/') === s.path?.replace(/\\/g, '/'))
    )
    expect(affected).toHaveLength(3)

    await run('update_impact_map', {
      revisionId,
      entries: affected.map((s) => ({
        unitId: s.id,
        path: s.path,
        classification: 'rewrite',
        evidence: 'Marcus/Marc appears',
        plan: 'Rewrite with Tomas taking his role'
      }))
    })

    // 3) Writer approved. 4) Execute in two batches (resumable across turns).
    const batch1 = affected.slice(0, 2)
    for (const scene of batch1) {
      await run('mark_revision_unit', {
        revisionId,
        unitId: scene.id,
        status: 'done',
        note: 'edit proposed'
      })
    }
    // Completing early is refused — the map still has pending units.
    await expect(
      run('complete_revision', { revisionId, report: 'too early' })
    ).rejects.toThrow(/pending/)

    // Next "turn": progress shows exactly what's left.
    const state = (await run('get_revision', { revisionId })) as {
      status: string
      directive: string
      progress: { done: number; total: number; pending: string[] }
    }
    expect(state.status).toBe('executing')
    expect(state.directive).toContain('Tomas')
    expect(state.progress.done).toBe(2)
    expect(state.progress.pending).toHaveLength(1)

    await run('mark_revision_unit', {
      revisionId,
      unitId: state.progress.pending[0],
      status: 'done'
    })

    // 5) Auditor verified; supervisor completes with the report.
    const completed = (await run('complete_revision', {
      revisionId,
      report: 'Zero surviving references to Marcus/Marc. Tomas absorbed the helper role.'
    })) as { status: string; unitsHandled: number }
    expect(completed.status).toBe('completed')
    expect(completed.unitsHandled).toBe(3)
  })

  it('surfaces active revisions in the project brief', async() => {
    const started = (await run('start_revision', {
      title: 'Remove Marcus',
      directive: 'directive'
    })) as { revisionId: string }
    await run('update_impact_map', {
      revisionId: started.revisionId,
      entries: [
        { unitId: 'u1', classification: 'rewrite', evidence: 'e', plan: 'p' },
        { unitId: 'u2', classification: 'remove', evidence: 'e', plan: 'p' }
      ]
    })
    await run('mark_revision_unit', {
      revisionId: started.revisionId,
      unitId: 'u1',
      status: 'done'
    })

    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('ACTIVE REVISION')
    expect(brief).toContain('Remove Marcus')
    expect(brief).toContain('1/2 units handled')
  })

  it('rejects malformed impact entries', async() => {
    const started = (await run('start_revision', { title: 'R', directive: 'd' })) as {
      revisionId: string
    }
    await expect(
      run('update_impact_map', {
        revisionId: started.revisionId,
        entries: [{ unitId: 'u1', classification: 'obliterate', evidence: 'e', plan: 'p' }]
      })
    ).rejects.toThrow(/Invalid classification/)
  })
})

describe('live plans (create → update → list → propose)', () => {
  it('creates a visible, editable plan file in plans/ without raising a card', async() => {
    const result = (await run('save_plan', {
      title: 'Draft the Amityville short story',
      plan: '1. Research the DeFeo case\n2. Outline\n3. Draft scene one'
    })) as { planId: string; note: string }

    expect(result.planId).toBe(path.join('plans', 'draft-the-amityville-short-story.md'))
    const saved = fs.readFileSync(path.join(root, result.planId), 'utf8')
    expect(saved).toContain('# Draft the Amityville short story')
    expect(saved).toContain('Research the DeFeo case')
    expect(result.note).toContain('update_plan')
    expect((result as Record<string, unknown>).planProposal).toBeUndefined()
  })

  it('updates a plan in place and preserves the title by default', async() => {
    const { planId } = (await run('save_plan', { title: 'My Plan', plan: 'v1' })) as {
      planId: string
    }
    await run('update_plan', { planId, plan: 'v2 with the writer\'s new twist' })
    const saved = fs.readFileSync(path.join(root, planId), 'utf8')
    expect(saved).toContain('# My Plan')
    expect(saved).toContain('new twist')
    expect(saved).not.toContain('v1')

    await expect(run('update_plan', { planId: 'plans/ghost.md', plan: 'x' })).rejects.toThrow(
      /list_plans/
    )
  })

  it('lists plans newest-first with titles', async() => {
    await run('save_plan', { title: 'Older Plan', plan: 'a' })
    await new Promise((r) => setTimeout(r, 10))
    await run('save_plan', { title: 'Newer Plan', plan: 'b' })
    const result = (await run('list_plans', {})) as {
      plans: Array<{ planId: string; title: string }>
    }
    expect(result.plans).toHaveLength(2)
    expect(result.plans[0].title).toBe('Newer Plan')
  })

  it('propose_plan reads the CURRENT file (writer edits included) and raises the card', async() => {
    const emitted: unknown[] = []
    service.setPlanProposalEmitter((p) => {
      emitted.push(p)
    })
    service.setProjectRoot(root)
    service.loadToolPack({
      version: 1,
      enabled: true,
      source: 'test',
      tools: [
        {
          id: 'propose_plan',
          name: 'propose_plan',
          description: 'propose a plan',
          handler: 'propose_plan',
          enabled: true,
          scope: 'project',
          confirm: 'never',
          schema: {
            type: 'object',
            properties: { planId: { type: 'string' } },
            required: ['planId']
          }
        }
      ]
    })

    const { planId } = (await run('save_plan', { title: 'T', plan: 'agent draft' })) as {
      planId: string
    }
    // The writer edits the file directly in the editor…
    fs.writeFileSync(path.join(root, planId), '# T\n\nwriter edited this\n')

    const langChainTool = service.getLangChainTools().find((t) => t.name === 'propose_plan')!
    const reply = (await langChainTool.invoke({ planId })) as string

    expect(emitted).toHaveLength(1)
    const proposal = (emitted[0] as { planProposal: { content: string } }).planProposal
    expect(proposal.content).toContain('writer edited this')
    expect(proposal.content).not.toContain('agent draft')
    // The model gets a wait-for-decision instruction, not the raw payload.
    expect(reply).toContain('approval card')
  })
})

describe('plotter role + revision tool wiring', () => {
  it('registers plotter with structural tools and no prose tools', () => {
    const plotter = AGENT_ROLES.plotter
    expect(plotter).toBeDefined()
    expect(plotter.allowedTools).toContain('propose_new_unit')
    expect(plotter.allowedTools).toContain('restructure_unit')
    expect(plotter.allowedTools).not.toContain('propose_project_file_edit')
    expect(plotter.allowedTools).not.toContain('delete_unit')
  })

  it('routes revision tools to the right roles, all with real handlers', () => {
    const registered = new Set(service.getKnownHandlerIds())
    for (const role of Object.values(AGENT_ROLES)) {
      for (const tool of role.allowedTools) {
        expect(registered.has(tool), `${role.role} → ${tool}`).toBe(true)
      }
    }
    expect(AGENT_ROLES.explorer.allowedTools).toContain('update_impact_map')
    expect(AGENT_ROLES.drafter.allowedTools).toContain('mark_revision_unit')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('mark_revision_unit')
    // Only the supervisor starts/completes revisions.
    for (const role of Object.values(AGENT_ROLES)) {
      expect(role.allowedTools).not.toContain('start_revision')
      expect(role.allowedTools).not.toContain('complete_revision')
    }
  })
})
