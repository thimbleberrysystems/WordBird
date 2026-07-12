import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { trimHistory } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { ContextBuilder, renderOutline } from '../../../src/main/services/ai/ContextBuilder'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerNovelAgentToolHandlers } from '../../../src/main/services/ai/NovelToolHandlers'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { structureService } from '../../../src/main/services/novel/StructureService'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'
import type { INovelUnit } from '../../../src/shared/types/novel'

describe('trimHistory', () => {
  it('returns everything untouched when under budget', () => {
    const messages = [new HumanMessage('hello'), new AIMessage('hi there')]
    const result = trimHistory(messages, 1000)
    expect(result.trimmed).toBe(false)
    expect(result.messages).toHaveLength(2)
  })

  it('drops the oldest messages when over budget and reports it', () => {
    const messages = [
      new HumanMessage('a'.repeat(500)),
      new AIMessage('b'.repeat(500)),
      new HumanMessage('c'.repeat(500)),
      new AIMessage('d'.repeat(500))
    ]
    const result = trimHistory(messages, 1100)
    expect(result.trimmed).toBe(true)
    expect(result.messages.length).toBeLessThan(4)
    // Most recent message always survives.
    const last = result.messages[result.messages.length - 1]
    expect(String(last.content)).toContain('d')
  })

  it('never lets the window start on an orphaned tool result', () => {
    const messages = [
      new HumanMessage('x'.repeat(2000)),
      new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'search', args: {} }] }),
      new ToolMessage({ content: 'y'.repeat(2000), tool_call_id: 't1' }),
      new AIMessage('done'),
      new HumanMessage('next question')
    ]
    const result = trimHistory(messages, 100)
    expect(result.trimmed).toBe(true)
    expect(result.messages[0]).not.toBeInstanceOf(ToolMessage)
  })

  it('clips a single oversized tool message instead of keeping it whole', () => {
    const messages = [
      new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'read', args: {} }] }),
      new ToolMessage({ content: 'z'.repeat(50000), tool_call_id: 't1' }),
      new AIMessage('summary')
    ]
    const result = trimHistory(messages, 60000)
    const tool = result.messages.find((m) => m instanceof ToolMessage)
    expect(String(tool?.content).length).toBeLessThan(20000)
    expect(String(tool?.content)).toContain('trimmed')
  })
})

describe('renderOutline', () => {
  const unit = (over: Partial<INovelUnit>): INovelUnit => ({
    id: over.id ?? 'u',
    type: over.type ?? 'scene',
    title: over.title ?? 't',
    ...over
  })

  it('renders an indented outline with ids and metadata', () => {
    const out = renderOutline([
      unit({
        id: 'ch1',
        type: 'chapter',
        title: 'One',
        children: [
          unit({ id: 's1', title: 'Opening', wordCount: 1200, status: 'draft', pov: 'Elara' })
        ]
      })
    ])
    expect(out).toContain('[chapter] One')
    expect(out).toContain('  - [scene] Opening (1.2k, draft, POV: Elara) <id:s1>')
  })

  it('caps the outline and reports omitted units', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      unit({ id: `s${i}`, title: `Scene ${i}`, path: `s${i}.md` })
    )
    const out = renderOutline(many, 10)
    expect(out.split('\n')).toHaveLength(11)
    expect(out).toContain('more units')
  })
})

describe('ContextBuilder.buildProjectBrief', () => {
  let root: string
  const builder = new ContextBuilder()

  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-brief-'))
    write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
    write('manuscript/chapter-one/opening.md', 'Elara walked into the rain again today.')
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns empty for no project', async() => {
    expect(await builder.buildProjectBrief(null)).toBe('')
  })

  it('includes layout, outline, book summary, and open issues', async() => {
    write('.wordbird/summaries/book.md', 'A novel about rain and letters.')
    write(
      '.wordbird/continuity/issues.json',
      JSON.stringify([
        {
          id: '1',
          title: 'Eye color conflict',
          description: 'x',
          severity: 'high',
          relatedPaths: [],
          status: 'open',
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          title: 'Resolved thing',
          description: 'x',
          severity: 'low',
          relatedPaths: [],
          status: 'resolved',
          createdAt: new Date().toISOString()
        }
      ])
    )

    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('PROJECT BRIEF')
    expect(brief).toContain('chapters-scenes')
    expect(brief).toContain('MANUSCRIPT OUTLINE')
    expect(brief).toContain('[chapter] chapter one')
    expect(brief).toContain('BOOK SUMMARY')
    expect(brief).toContain('rain and letters')
    expect(brief).toContain('OPEN CONTINUITY ISSUES')
    expect(brief).toContain('[high] Eye color conflict')
    expect(brief).not.toContain('Resolved thing')
  })

  it('clips oversized book summaries', async() => {
    write('.wordbird/summaries/book.md', 'w'.repeat(5000))
    const brief = await builder.buildProjectBrief(root)
    expect(brief.length).toBeLessThan(5000)
    expect(brief).toContain('…')
  })
})

describe('tool output context caps', () => {
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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-caps-'))
    write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
    service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    // Idempotent re-registration keeps this spec honest if the built-in
    // wiring ever stops including the novel handlers.
    registerNovelAgentToolHandlers(service)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('caps read_unit output on a huge chapter and says how to narrow', async() => {
    write('manuscript/chapter-one/huge.md', 'word '.repeat(20000)) // ~100k chars
    const structure = await structureService.loadReconciled(root)
    const chapterId = structure.units[0].id

    const result = (await run('read_unit', { unitId: chapterId })) as {
      content: string
      truncated: boolean
    }
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(30000)
    expect(result.content).toContain('truncated')
    expect(result.content).toContain('line ranges')
  })

  it('caps read_project_file output and reports total lines', async() => {
    write('notes/big.md', Array.from({ length: 5000 }, (_, i) => `line ${i} of the notes`).join('\n'))
    const result = (await run('read_project_file', { fname: 'notes/big.md' })) as {
      content: string
      truncated: boolean
      totalLines: number
    }
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(30000)
    expect(result.totalLines).toBe(5000)
  })

  it('caps read_bible page output', async() => {
    write('bible/characters/epic.md', 'canon '.repeat(10000))
    const result = (await run('read_bible', { path: 'bible/characters/epic.md' })) as {
      content: string
      truncated: boolean
    }
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBeLessThan(30000)
  })

  it('caps synopses in list_structure', async() => {
    write('manuscript/chapter-one/scene.md', 'text')
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await structureService.updateUnit(root, structure, scene.id, {
      synopsis: 's'.repeat(1000)
    })

    const result = (await run('list_structure', {})) as {
      units: Array<{ children?: Array<{ synopsis?: string }> }>
    }
    const listed = result.units[0].children![0]
    expect(listed.synopsis!.length).toBeLessThanOrEqual(201)
  })
})

describe('project blueprint guidance', () => {
  let root: string
  const builder = new ContextBuilder()

  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-blueprint-'))
    write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('flags an EMPTY project and points at the new-project playbook', async() => {
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('EMPTY PROJECT')
    expect(brief).toContain('NEW PROJECT playbook')
  })

  it('flags prose without a bible and reports maturity stats', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain fell on the letters.')
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('NO STORY BIBLE YET')
    expect(brief).toMatch(/0 bible pages/)
    expect(brief).not.toContain('EMPTY PROJECT')
  })

  it('reports bible/summary/plan counts once they exist', async() => {
    write('manuscript/chapter-one/opening.md', 'Rain fell.')
    write('bible/characters/zara.md', '# Zara')
    write('bible/places/amityville.md', '# Amityville')
    write('.wordbird/summaries/book.md', 'A summary.')
    write('plans/plan-one.md', '# Plan')
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toMatch(/2 bible pages/)
    expect(brief).toMatch(/1 summary\b/)
    expect(brief).toMatch(/1 plan\b/)
    expect(brief).not.toContain('NO STORY BIBLE YET')
  })

  it('every worker role carries the project conventions', () => {
    for (const definition of Object.values(AGENT_ROLES)) {
      expect(definition.systemPrompt, definition.role).toContain('PROJECT LAYOUT & CONVENTIONS')
      expect(definition.systemPrompt, definition.role).toContain('aliases')
    }
  })
})
