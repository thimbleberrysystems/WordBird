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
  write('.wordbird/project.json', JSON.stringify({ name: 'H', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/one.md', PROSE_A)
  write('manuscript/chapter-one/two.md', PROSE_B)
  // Zara HAS a bible page; Ilsabet Crane deliberately does not.
  write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara Voss\n')
  // Orphan prose file the binder does not know about.
  write('manuscript/loose-scene.md', 'An orphaned fragment.\n')
  write('plans/draft.md', '# Plan\n\n- [ ] step one\n- [x] done\n')
  // Build the structure from disk, then STRIP metadata + fake an empty-final.
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

  it('binder-vs-disk: a unit whose file vanished is flagged', async() => {
    await makeDirtyProject()
    fs.rmSync(path.join(root, 'manuscript/chapter-one/two.md'))
    clearHealthCache()
    const report = await checkProjectHealth(root)
    expect(report.findings.some((f) => f.id === 'binder-missing-files')).toBe(true)
  })

  it('cache: same signature is reused, prose touch invalidates', async() => {
    await makeDirtyProject()
    const first = await checkProjectHealth(root)
    const second = await checkProjectHealth(root)
    expect(second.generatedAt).toBe(first.generatedAt) // cached object

    await new Promise((resolve) => setTimeout(resolve, 10))
    write('manuscript/chapter-one/one.md', PROSE_A + 'A new line.\n')
    const third = await checkProjectHealth(root)
    expect(third.signature).not.toBe(first.signature)
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
