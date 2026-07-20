/**
 * Story-fact ledger (world-state v1), thread/label/notes metadata, and the
 * new prompt contracts (critic pass in book runs, learn-my-voice playbook).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { factService } from '../../../src/main/services/novel/FactService'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-facts-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'F', flavor: 'chapters-scenes' }))
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('fact ledger', () => {
  it('records atomic triples and ignores exact duplicates', async() => {
    const first = (await run('record_fact', {
      subject: 'Zara Voss',
      relation: 'eye color',
      object: 'grey',
      note: 'established in the alley'
    })) as { recorded: boolean; duplicate: boolean }
    expect(first.recorded).toBe(true)

    const again = (await run('record_fact', {
      subject: 'zara voss',
      relation: 'Eye Color',
      object: 'GREY'
    })) as { recorded: boolean; duplicate: boolean }
    expect(again.duplicate).toBe(true)
    expect(await factService.count(root)).toBe(1)
  })

  it('list_facts filters by any word across the triple', async() => {
    await run('record_fact', { subject: 'Zara Voss', relation: 'sister of', object: 'Odalys' })
    await run('record_fact', { subject: 'The Lighthouse', relation: 'located', object: 'north cliff' })

    const zara = (await run('list_facts', { about: 'zara' })) as { count: number }
    expect(zara.count).toBe(1)
    const odalys = (await run('list_facts', { about: 'Odalys' })) as { count: number }
    expect(odalys.count).toBe(1)
    const all = (await run('list_facts', {})) as { count: number }
    expect(all.count).toBe(2)
  })

  it('the brief announces the ledger size', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain fell.')
    await factService.record(root, { subject: 'Zara', relation: 'age', object: '34' })
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('1 recorded fact')
    expect(brief).toContain('list_facts')
  })

  it('relationship_map proposes a mermaid graph from inter-entity facts', async() => {
    // Two bible entities so mentions resolve; prose so the index counts them.
    write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara Voss\n')
    write('bible/characters/mara.md', '---\naliases: [Mara]\n---\n# Mara Voss\n')
    write('manuscript/chapter-one/opening.md', 'Zara found Mara at the docks.')
    await run('record_fact', { subject: 'Zara', relation: 'sister of', object: 'Mara' })
    await run('record_fact', { subject: 'Zara', relation: 'eye color', object: 'grey' })

    const result = (await run('relationship_map', {})) as {
      edit?: { filePath: string; newContent: string }
      generated?: boolean
    }
    expect(result.edit?.filePath).toBe(path.join('bible', 'relationships.md'))
    expect(result.edit?.newContent).toContain('```mermaid')
    expect(result.edit?.newContent).toContain('sister of')
    // The attribute fact (grey) is not a relationship edge.
    expect(result.edit?.newContent).not.toContain('eye color')
  })

  it('relationship_map reports nothing to draw when no inter-entity facts exist', async() => {
    write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara Voss\n')
    write('manuscript/chapter-one/opening.md', 'Zara alone.')
    await run('record_fact', { subject: 'Zara', relation: 'eye color', object: 'grey' })
    const result = (await run('relationship_map', {})) as { generated: boolean; note: string }
    expect(result.generated).toBe(false)
    expect(result.note).toContain('inter-entity')
  })
})

describe('thread / label / notes metadata', () => {
  it('update_unit_meta sets the new fields and list_structure returns them', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain.')
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]

    await run('update_unit_meta', {
      unitId: scene.id,
      thread: 'Heist',
      label: 'act1',
      notes: 'Foreshadow the cellar.'
    })

    const listed = (await run('list_structure', {})) as {
      units: Array<{ children?: Array<{ thread?: string; label?: string; notes?: string }> }>
    }
    const got = listed.units[0].children![0]
    expect(got.thread).toBe('Heist')
    expect(got.label).toBe('act1')
    expect(got.notes).toBe('Foreshadow the cellar.')
  })

  it('update_unit_meta sets the Story Grid / yWriter craft fields, list_structure returns them', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain.')
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]

    await run('update_unit_meta', {
      unitId: scene.id,
      goal: 'Zara wants the ledger.',
      conflict: 'The vault is guarded.',
      outcome: 'She is caught — disaster.',
      valueShift: 'safe → in danger'
    })

    const listed = (await run('list_structure', {})) as {
      units: Array<{
        children?: Array<{
          goal?: string
          conflict?: string
          outcome?: string
          valueShift?: string
        }>
      }>
    }
    const got = listed.units[0].children![0]
    expect(got.goal).toBe('Zara wants the ledger.')
    expect(got.conflict).toBe('The vault is guarded.')
    expect(got.outcome).toBe('She is caught — disaster.')
    expect(got.valueShift).toBe('safe → in danger')

    // Persisted to disk (survives a reload).
    const reloaded = await structureService.loadReconciled(root)
    const persisted = reloaded.units[0].children![0]
    expect(persisted.valueShift).toBe('safe → in danger')
  })

  it('the outline in the brief carries the thread lane', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain.')
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await structureService.updateUnit(root, structure, scene.id, { thread: 'Heist' })
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('thread: Heist')
  })
})

describe('new prompt contracts', () => {
  const runSupervisor = async(mode: 'auto' | 'approvals'): Promise<string> => {
    const model = {
      calls: [] as BaseMessage[][],
      bindTools() {
        return this
      },
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        this.calls.push(messages)
        return new AIMessage('ok')
      }
    }
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode(mode)
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: `facts-${mode}` }, recursionLimit: 12 }
    )
    return String(model.calls[0][0].content)
  }

  it('book runs carry the CRITIC PASS contract (auto mode only)', async() => {
    const auto = await runSupervisor('auto')
    expect(auto).toContain('CRITIC PASS')
    expect(auto).toContain('never stack new scenes on ' + 'unreviewed ones')
    // The critic pass includes the corpus anti-slop sweep.
    expect(auto).toContain('lint_prose corpus:true')
    expect(auto).toContain('AI-SLOP')
    const approvals = await runSupervisor('approvals')
    expect(approvals).not.toContain('CRITIC PASS')
  })

  it('the LEARN MY VOICE playbook and fact aftercare are taught', async() => {
    const system = await runSupervisor('approvals')
    expect(system).toContain('LEARN MY VOICE')
    expect(system).toContain('bible/style.md')
    expect(system).toContain('record_fact for each')
  })

  it('the INTERVIEW A CHARACTER persona playbook is taught (read-only, in-voice)', async() => {
    const system = await runSupervisor('approvals')
    expect(system).toContain('INTERVIEW A CHARACTER')
    // Grounds in the bible + facts, and stays read-only while in persona.
    expect(system).toContain('list_facts about=<name>')
    expect(system).toContain('READ-ONLY conversation')
  })

  it('the RETRO-OUTLINE playbook derives craft metadata, never invents structure', async() => {
    const system = await runSupervisor('approvals')
    expect(system).toContain('RETRO-OUTLINE')
    // It DERIVES from prose into update_unit_meta (synopsis + craft), and
    // proposes no prose.
    expect(system).toContain('update_unit_meta with a one-line')
    expect(system).toContain('metadata only')
  })

  it('the POST-IMPORT playbook offers review-gated bible extraction, never fabricates canon', async() => {
    const system = await runSupervisor('approvals')
    expect(system).toContain('POST-IMPORT')
    expect(system).toContain('BIBLE EXTRACTION')
    expect(system).toContain('NEVER fabricates traits')
    expect(system).toContain('review-gated')
  })

  it('auditors carry the fact-ledger discipline', () => {
    expect(AGENT_ROLES.auditor.systemPrompt).toContain('list_facts')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('record_fact')
    expect(AGENT_ROLES.drafter.allowedTools).toContain('record_fact')
    expect(AGENT_ROLES.explorer.allowedTools).toContain('list_facts')
  })
})
