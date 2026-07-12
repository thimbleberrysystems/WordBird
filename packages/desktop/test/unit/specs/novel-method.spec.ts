/**
 * Methodology stack: ProjectMeta read/update, structure templates,
 * set_writing_method tool, method/vantage in the brief, and the
 * flexibility prime directive in the prompts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import {
  readProjectMeta,
  updateProjectMeta
} from '../../../src/main/services/novel/ProjectMeta'
import { STRUCTURE_TEMPLATES } from '../../../src/main/services/novel/structureTemplates'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import type { BaseMessage } from '@langchain/core/messages'

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-method-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('ProjectMeta', () => {
  it('reads legacy markers with method falling back to unset', () => {
    const meta = readProjectMeta(root)
    expect(meta.name).toBe('T')
    expect(meta.flavor).toBe('chapters-scenes')
    expect(meta.planningStyle).toBe('unset')
    expect(meta.structureTemplate).toBe('unset')
  })

  it('survives a missing marker entirely', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-nometa-'))
    const meta = readProjectMeta(empty)
    expect(meta.flavor).toBe('chapters-scenes')
    expect(meta.planningStyle).toBe('unset')
    fs.rmSync(empty, { recursive: true, force: true })
  })

  it('updates method fields while preserving unknown keys', async() => {
    write(
      '.wordbird/project.json',
      JSON.stringify({ name: 'T', flavor: 'flat', futureKey: 42 })
    )
    const meta = await updateProjectMeta(root, { planningStyle: 'discovery' })
    expect(meta.planningStyle).toBe('discovery')
    expect(meta.flavor).toBe('flat')
    const raw = JSON.parse(fs.readFileSync(path.join(root, '.wordbird/project.json'), 'utf8'))
    expect(raw.futureKey).toBe(42)
  })
})

describe('structure templates', () => {
  it('every framework has a beat sheet with checkboxes and targets', () => {
    for (const id of ['three-act', 'save-the-cat', 'heros-journey', 'seven-point', 'romancing-the-beat'] as const) {
      const sheet = STRUCTURE_TEMPLATES[id]
      expect(sheet, id).toBeTruthy()
      expect(sheet, id).toContain('- [ ]')
      expect(sheet, id).toMatch(/~\d+/)
      expect(sheet, id).toContain('not laws')
    }
    expect(STRUCTURE_TEMPLATES.freeform).toBeUndefined()
  })
})

describe('set_writing_method tool', () => {
  it('records the method and seeds the beat sheet once', async() => {
    const result = (await run('set_writing_method', {
      planningStyle: 'hybrid',
      structureTemplate: 'save-the-cat'
    })) as { recorded: boolean; seededBeatSheet: boolean }
    expect(result.recorded).toBe(true)
    expect(result.seededBeatSheet).toBe(true)

    const meta = readProjectMeta(root)
    expect(meta.planningStyle).toBe('hybrid')
    expect(meta.structureTemplate).toBe('save-the-cat')
    expect(fs.readFileSync(path.join(root, 'bible/structure.md'), 'utf8')).toContain('Catalyst')

    // Writer edits are canon: a second call must NOT clobber the sheet.
    write('bible/structure.md', '# My custom beats\n- [x] my own beat\n')
    const again = (await run('set_writing_method', {
      structureTemplate: 'save-the-cat'
    })) as { seededBeatSheet: boolean }
    expect(again.seededBeatSheet).toBe(false)
    expect(fs.readFileSync(path.join(root, 'bible/structure.md'), 'utf8')).toContain('my own beat')
  })

  it('rejects unknown values and empty calls', async() => {
    await expect(run('set_writing_method', {})).rejects.toThrow(/planningStyle/)
    await expect(
      run('set_writing_method', { planningStyle: 'chaotic' })
    ).rejects.toThrow(/outline-first/)
  })
})

describe('brief carries method, vantage, and timeline', () => {
  const builder = new ContextBuilder()

  it('announces the recorded method and beat sheet', async() => {
    await updateProjectMeta(root, { planningStyle: 'discovery', structureTemplate: 'three-act' })
    write('bible/structure.md', STRUCTURE_TEMPLATES['three-act'] as string)
    write('manuscript/chapter-one/opening.md', 'Rain fell.')
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('WRITING METHOD')
    expect(brief).toContain('Method: discovery')
    expect(brief).toContain('Structure: three-act')
    expect(brief).toContain('bible/structure.md')
  })

  it('nudges to ask when the method is unset on a non-empty project', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain fell.')
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('set_writing_method')
  })

  it('renders when/location in the outline and the writer vantage', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain fell on the pier.')
    const { structureService } = await import(
      '../../../src/main/services/novel/StructureService'
    )
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await structureService.updateUnit(root, structure, scene.id, {
      when: '1871-06-02',
      location: 'The pier'
    })

    builder.setSessionContext({ viewMode: 'timeline', currentUnitId: scene.id })
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('@1871-06-02')
    expect(brief).toContain('loc: The pier')
    expect(brief).toContain("WRITER'S VANTAGE: timeline view")
    expect(brief).toContain('open scene')
    builder.setSessionContext(null)
  })
})

describe('list_structure exposes the full metadata read', () => {
  it('returns location and when for units', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain.')
    const { structureService } = await import(
      '../../../src/main/services/novel/StructureService'
    )
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await structureService.updateUnit(root, structure, scene.id, {
      when: 'Day 1',
      location: 'Lighthouse'
    })
    const result = (await run('list_structure', {})) as {
      units: Array<{ children?: Array<{ when?: string; location?: string }> }>
    }
    const listed = result.units[0].children![0]
    expect(listed.when).toBe('Day 1')
    expect(listed.location).toBe('Lighthouse')
  })
})

describe('flexibility prime directive + method playbooks in prompts', () => {
  class ScriptedModel {
    calls: BaseMessage[][] = []
    bindTools(): ScriptedModel {
      return this
    }

    async invoke(messages: BaseMessage[]): Promise<AIMessage> {
      this.calls.push(messages)
      return new AIMessage('ok')
    }
  }

  it('supervisor prompt: defaults-never-doctrine + all method branches', async() => {
    const model = new ScriptedModel()
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode('auto')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'm1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('DEFAULTS, never doctrine')
    expect(system).toContain('words in this conversation always override')
    expect(system).toContain('outline-first')
    expect(system).toContain('discovery: NEVER push outlines')
    expect(system).toContain('hybrid')
    expect(system).toContain('REVISION PASSES')
    expect(system).toContain('VIEW AWARENESS')
    expect(system).toContain('set_writing_method')
  })

  it('drafter carries Swain scene craft; line-editor carries pass discipline', () => {
    expect(AGENT_ROLES.drafter.systemPrompt).toContain('goal → conflict → disaster')
    expect(AGENT_ROLES.drafter.systemPrompt).toContain('reaction → dilemma → decision')
    expect(AGENT_ROLES['line-editor'].systemPrompt).toContain('PASS DISCIPLINE')
    expect(AGENT_ROLES.auditor.systemPrompt).toContain('`when`')
  })
})

describe('ask_writer question cards', () => {
  it('the tool intercepts into a writer-question emitter and tells the model to stop', async() => {
    const emitted: unknown[] = []
    service.setWriterQuestionEmitter((p) => {
      emitted.push(p)
    })
    service.setProjectRoot(root)
    service.loadToolPack({
      version: 1,
      enabled: true,
      source: 'test',
      tools: [
        {
          id: 'ask_writer',
          name: 'ask_writer',
          description: 'ask',
          handler: 'ask_writer',
          enabled: true,
          scope: 'project',
          confirm: 'never',
          schema: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'object' } }
            },
            required: ['question', 'options']
          }
        }
      ]
    })
    const langChainTool = service.getLangChainTools().find((t) => t.name === 'ask_writer')!
    const reply = (await langChainTool.invoke({
      question: 'Which genre?',
      options: [
        { label: 'Gothic mystery (recommended)', description: 'Moody, slow-burn dread' },
        { label: 'Psychological thriller' }
      ]
    })) as string
    expect(emitted).toHaveLength(1)
    const q = (emitted[0] as { writerQuestion: { question: string; options: unknown[] } })
      .writerQuestion
    expect(q.question).toBe('Which genre?')
    expect(q.options).toHaveLength(2)
    expect(reply).toContain('END YOUR TURN')
  })

  it('rejects a question without at least two options', async() => {
    await expect(run('ask_writer', { question: 'Hmm?', options: [] })).rejects.toThrow(/2 options/)
  })

  it('supervisor prompt teaches the card and forbids question walls', async() => {
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
      { configurable: { thread_id: 'q1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('ask_writer')
    expect(system).toContain('bullet-wall of questions')
  })
})
