/**
 * P1.2 + P1.3 — orientation infrastructure and writer-friendly filenames:
 * the deterministic entity index, WHO'S WHERE in the brief, the
 * where_appears tool, the CONTEXT PREP prompt gate, distinct-title
 * guidance, and ordinal (never random) filename collision handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { buildEntityIndex, getEntityIndex } from '../../../src/main/services/novel/EntityIndex'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'

let root: string

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-entity-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'E', flavor: 'chapters-scenes' }))
  write(
    'bible/characters/zara.md',
    '---\naliases: [Zara, Detective Voss]\n---\n# Zara Voss\n\nGrey eyes.\n'
  )
  write('bible/places/the-lighthouse.md', '# The Lighthouse\n\nOn the cliff.\n')
  write('bible/style.md', '# Style\n\nZara Zara Zara — style notes never count.\n')
  write(
    'manuscript/chapter-one/the-alley.md',
    'Zara stepped out. Detective Voss never blinked. The lighthouse burned far off.\n'
  )
  write('manuscript/chapter-one/the-letter.md', 'A letter arrived for Zara.\n')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('EntityIndex', () => {
  it('counts alias-aware appearances per unit and skips craft pages', async() => {
    const index = await buildEntityIndex(root)
    const names = index.entities.map((e) => e.name)
    expect(names).toContain('Zara Voss')
    expect(names).toContain('The Lighthouse')
    expect(names).not.toContain('Style')

    const zara = index.entities.find((e) => e.name === 'Zara Voss')!
    expect(zara.aliases).toContain('Detective Voss')
    // the-alley: "Zara" + "Detective Voss" (Voss alone doesn't count) = 2
    const alley = zara.appearances.find((a) => a.path.includes('the-alley'))!
    expect(alley.count).toBe(2)
    const letter = zara.appearances.find((a) => a.path.includes('the-letter'))!
    expect(letter.count).toBe(1)
    // Sorted by weight.
    expect(zara.appearances[0].path).toContain('the-alley')
  })

  it('serves the cached index until inputs change, then rebuilds', async() => {
    const first = await getEntityIndex(root)
    const again = await getEntityIndex(root)
    expect(again.builtAt).toBe(first.builtAt)

    // New prose mentioning Zara → signature moves → rebuild sees it.
    await new Promise((resolve) => setTimeout(resolve, 10))
    write('manuscript/chapter-one/the-cellar.md', 'Zara opened the cellar. Zara froze.\n')
    const rebuilt = await getEntityIndex(root)
    expect(rebuilt.builtAt).toBeGreaterThan(first.builtAt)
    const zara = rebuilt.entities.find((e) => e.name === 'Zara Voss')!
    expect(zara.appearances.some((a) => a.path.includes('the-cellar'))).toBe(true)
  })
})

describe("WHO'S WHERE in the brief", () => {
  it('lists entities with per-unit counts and flags unseen pages', async() => {
    write('bible/characters/ghost.md', '# The Drowned Sister\n\nNever named in prose yet.\n')
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain("WHO'S WHERE")
    expect(brief).toContain('Zara Voss')
    expect(brief).toContain('where_appears')
    expect(brief).toContain('not yet in the prose')
  })
})

describe('where_appears tool', () => {
  let service: AgentToolService

  beforeEach(() => {
    service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
  })

  const run = async(args: Record<string, unknown>): Promise<unknown> => {
    const handler = (
      service as unknown as {
        _handlers: Map<string, (a: Record<string, unknown>, c: unknown) => Promise<unknown>>
      }
    )._handlers.get('where_appears')!
    return handler(args, { projectRoot: root })
  }

  it('answers by any alias with unit-level appearances', async() => {
    const result = (await run({ entity: 'detective voss' })) as {
      found: boolean
      entity: string
      appearances: Array<{ title: string; count: number }>
    }
    expect(result.found).toBe(true)
    expect(result.entity).toBe('Zara Voss')
    expect(result.appearances.length).toBe(2)
  })

  it('lists known entities when the name matches nothing', async() => {
    const result = (await run({ entity: 'Nobody' })) as { found: boolean; note: string }
    expect(result.found).toBe(false)
    expect(result.note).toContain('Zara Voss')
    expect(result.note).toContain('search_manuscript')
  })
})

describe('prompt contracts: context prep + distinct titles', () => {
  it('supervisor prompt carries the CONTEXT PREP hard rule and title guidance', async() => {
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
    orchestrator.setMode('approvals')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'prep1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('CONTEXT PREP (hard rule')
    expect(system).toContain('where_appears')
    expect(system).toContain('Editing text you have not read this turn')
    expect(system).toContain('DISTINCT, descriptive title')

    // Full scenes are drafter work — the supervisor writes inline only for
    // small pieces. This keeps sub-agents visibly in the loop AND routes
    // prose through the scene-craft role prompt.
    expect(system).toContain('ALWAYS goes through a drafter')
    expect(system).toContain('Writing a FULL scene is NOT small')

    expect(AGENT_ROLES.drafter.systemPrompt).toContain('DISTINCT, descriptive titles')
    expect(AGENT_ROLES.explorer.allowedTools).toContain('where_appears')
  })
})

describe('writer-friendly filenames (ordinals, never UUID fragments)', () => {
  it('colliding scene titles get -2/-3 suffixes', async() => {
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    // scene-pool: every scene shares one directory — collisions are routine.
    write('.wordbird/project.json', JSON.stringify({ name: 'E', flavor: 'scene-pool' }))
    fs.rmSync(path.join(root, 'manuscript'), { recursive: true, force: true })
    fs.rmSync(path.join(root, '.wordbird', 'structure.json'), { force: true })
    const structure = await structureService.loadReconciled(root)
    const one = await structureService.createUnit(root, structure, {
      parentId: null,
      type: 'scene',
      title: 'Opening'
    })
    const two = await structureService.createUnit(root, structure, {
      parentId: null,
      type: 'scene',
      title: 'Opening'
    })
    const three = await structureService.createUnit(root, structure, {
      parentId: null,
      type: 'scene',
      title: 'Opening'
    })
    expect(one.path).toBe('scenes/opening.md')
    expect(two.path).toBe('scenes/opening-2.md')
    expect(three.path).toBe('scenes/opening-3.md')
    for (const p of [one.path, two.path, three.path]) {
      expect(p).not.toMatch(/[0-9a-f]{8}/)
    }
  })

  it('colliding plan titles get ordinals, not timestamps', async() => {
    const service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const handler = (
      service as unknown as {
        _handlers: Map<string, (a: Record<string, unknown>, c: unknown) => Promise<unknown>>
      }
    )._handlers.get('save_plan')!
    const first = (await handler(
      { title: 'Novella Plan', plan: '- [ ] one' },
      { projectRoot: root }
    )) as { path: string }
    const second = (await handler(
      { title: 'Novella Plan', plan: '- [ ] two' },
      { projectRoot: root }
    )) as { path: string }
    expect(first.path).toBe('plans/novella-plan.md')
    expect(second.path).toBe('plans/novella-plan-2.md')
  })
})
