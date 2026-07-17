/**
 * Research persistence: findings saved to bible/research/ survive the
 * conversation, ride every brief as RESEARCH ON FILE, and never pollute
 * the entity index. save_research is ask-legal by writer decision —
 * bible/research/ (additive-only) is ask mode's second writable surface
 * beside plans/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { getEntityIndex } from '../../../src/main/services/novel/EntityIndex'
import { mainThreadToolNames } from '../../../src/main/services/ai/agentSdk/toolBridge'
import {
  AGENT_ROLES,
  READONLY_WORKER_TOOLS
} from '../../../src/main/services/ai/orchestrator/roles'
import { buildSupervisorPrompt } from '../../../src/main/services/ai/orchestrator/Orchestrator'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

let root: string
let service: AgentToolService

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

const run = async(id: string, args: Record<string, unknown>): Promise<unknown> => {
  type Handler = (a: Record<string, unknown>, c: unknown) => Promise<unknown>
  const handler = (
    service as unknown as { _handlers: Map<string, Handler> }
  )._handlers.get(id)!
  return handler(args, { projectRoot: root })
}

beforeEach(async() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-research-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'R', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/one.md', 'Zara waited.\n')
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  service.loadToolPack(await loader.loadPack(TOOL_PACK))
  service.setProjectRoot(root)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('save_research handler', () => {
  it('writes a front-mattered note into bible/research/', async() => {
    const result = (await run('save_research', {
      title: 'Lighthouse Mechanics 1890',
      content: 'Fresnel lenses rotate on mercury baths.',
      sources: ['https://en.wikipedia.org/wiki/Fresnel_lens']
    })) as { saved: boolean; path: string }
    expect(result.saved).toBe(true)
    expect(result.path).toBe('bible/research/lighthouse-mechanics-1890.md')
    const content = fs.readFileSync(path.join(root, result.path), 'utf8')
    expect(content).toMatch(/^---\ndate: \d{4}-\d{2}-\d{2}\nsources:\n {2}- https/)
    expect(content).toContain('# Lighthouse Mechanics 1890')
    expect(content).toContain('mercury baths')
  })

  it('never overwrites — a colliding title gets a suffix', async() => {
    await run('save_research', { title: 'Tides', content: 'First note.' })
    const second = (await run('save_research', { title: 'Tides', content: 'Second note.' })) as {
      path: string
    }
    expect(second.path).toBe('bible/research/tides-2.md')
    expect(fs.readFileSync(path.join(root, 'bible/research/tides.md'), 'utf8')).toContain('First')
  })

  it('hostile titles cannot escape bible/research/', async() => {
    const result = (await run('save_research', {
      title: '../../outside/../evil',
      content: 'x'
    })) as { path: string }
    expect(result.path.startsWith('bible/research/')).toBe(true)
    expect(result.path).not.toContain('..')
    expect(fs.existsSync(path.join(root, result.path))).toBe(true)
  })
})

describe('RESEARCH ON FILE brief section', () => {
  it('announces saved notes with their titles; silent when none exist', async() => {
    const before = await new ContextBuilder().buildProjectBrief(root)
    expect(before).not.toContain('RESEARCH ON FILE')

    await run('save_research', { title: 'Storm Patterns', content: 'North Sea gales peak in January.' })
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('RESEARCH ON FILE')
    expect(brief).toContain('bible/research/storm-patterns.md')
    expect(brief).toContain('Storm Patterns')
  })
})

describe('research notes never pollute the entity index', () => {
  it('bible/research pages are not entities', async() => {
    write('bible/characters/zara.md', '---\naliases: [Zara]\n---\n# Zara Voss\n')
    await run('save_research', { title: 'Mercury Baths', content: 'Not a character.' })
    const index = await getEntityIndex(root)
    const names = index.entities.map((e) => e.name)
    expect(names).toContain('Zara Voss')
    expect(names).not.toContain('Mercury Baths')
  })
})

describe('role and mode contract', () => {
  it('researcher can search the project and save findings, but never writes prose', () => {
    const researcher = AGENT_ROLES.researcher
    for (const tool of ['save_research', 'search_manuscript', 'list_files', 'web_fetch']) {
      expect(researcher.allowedTools).toContain(tool)
    }
    for (const banned of ['propose_text_edit', 'propose_new_unit', 'update_unit_meta']) {
      expect(researcher.allowedTools).not.toContain(banned)
    }
    expect(researcher.systemPrompt).toContain('RESEARCH ON FILE')
    expect(researcher.systemPrompt).toContain('save_research')
    expect(AGENT_ROLES.explorer.allowedTools).toContain('save_research')
  })

  it('ask-mode contract: plans/ and bible/research/ are the ONLY writable surfaces', () => {
    expect(READONLY_WORKER_TOOLS).toContain('save_research')
    const askTools = mainThreadToolNames(service, 'ask')
    expect(askTools).toContain('save_research')
    expect(askTools).toContain('save_plan')
    // Everything else that writes stays stripped.
    for (const banned of [
      'propose_text_edit',
      'propose_new_unit',
      'propose_bible_update',
      'update_unit_meta',
      'record_fact',
      'delete_unit'
    ]) {
      expect(askTools, banned).not.toContain(banned)
    }
  })

  it('the supervisor doctrine treats research as an asset', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('RESEARCH IS AN ASSET')
    expect(prompt).toContain('save_research')
  })
})
