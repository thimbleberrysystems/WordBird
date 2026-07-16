/**
 * Skills — writer-authored, on-demand technique files: the parser, the
 * two read tools, the brief's catalog + pinned-body injection, and the
 * prompt contracts that teach the loading model (catalog every turn,
 * use_skill on demand, pins ride in full).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  MAX_PINNED_SKILLS,
  MAX_SKILL_BODY_CHARS,
  listSkills,
  parseSkillMeta,
  readPinnedSkills,
  readSkill,
  skillBody
} from '../../../src/main/services/novel/Skills'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import {
  SUPERVISOR_TOOL_NAMES,
  buildSupervisorPrompt
} from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { PROJECT_CONVENTIONS } from '../../../src/main/services/ai/orchestrator/roles'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

const FIGHT_SKILL = `---
name: Fight choreography
description: Beat-by-beat action clarity rules.
---

Keep each exchange to three beats. Ground every blow in space.
`

const NO_FM_SKILL = `# Cliffhanger endings

End every chapter mid-beat, never after the resolution.
`

let root: string

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

const pin = (...files: string[]): void => {
  write('.wordbird/agent-state/session.json', JSON.stringify({ pinnedSkills: files }))
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-skills-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'S', flavor: 'chapters-scenes' }))
  fs.mkdirSync(path.join(root, 'manuscript'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('parseSkillMeta', () => {
  it('reads front matter name + description', () => {
    const meta = parseSkillMeta(FIGHT_SKILL, 'fight.md')
    expect(meta.name).toBe('Fight choreography')
    expect(meta.description).toBe('Beat-by-beat action clarity rules.')
    expect(meta.file).toBe('fight.md')
  })

  it('falls back to the first heading, then the filename stem', () => {
    const heading = parseSkillMeta(NO_FM_SKILL, 'cliffhangers.md')
    expect(heading.name).toBe('Cliffhanger endings')
    expect(heading.description).toContain('End every chapter mid-beat')

    const bare = parseSkillMeta('just some prose lines', 'my-technique.md')
    expect(bare.name).toBe('my-technique')
  })

  it('skillBody strips front matter only', () => {
    expect(skillBody(FIGHT_SKILL)).toBe(
      'Keep each exchange to three beats. Ground every blow in space.'
    )
    expect(skillBody(NO_FM_SKILL)).toContain('# Cliffhanger endings')
  })
})

describe('listSkills / readSkill / pins', () => {
  it('lists skills sorted by name and reads by name or filename', () => {
    write('skills/fight.md', FIGHT_SKILL)
    write('skills/cliffhangers.md', NO_FM_SKILL)
    write('skills/notes.txt', 'not a skill')

    const skills = listSkills(root)
    expect(skills.map((s) => s.name)).toEqual(['Cliffhanger endings', 'Fight choreography'])

    expect(readSkill(root, 'fight choreography')?.body).toContain('three beats')
    expect(readSkill(root, 'fight.md')?.meta.name).toBe('Fight choreography')
    expect(readSkill(root, 'nope')).toBeNull()
  })

  it('walks subfolders — writers can organize skills into directories', () => {
    write('skills/fight.md', FIGHT_SKILL)
    write('skills/dialogue/banter.md', '---\nname: Banter\ndescription: Quips.\n---\n\nShort lines.\n')

    const skills = listSkills(root)
    expect(skills.map((s) => s.file)).toContain('dialogue/banter.md')
    // Lookup works by relative path and by name; body loads from the subdir.
    expect(readSkill(root, 'dialogue/banter.md')?.meta.name).toBe('Banter')
    expect(readSkill(root, 'banter')?.body).toContain('Short lines')
  })

  it('pins are read from session state, capped at the maximum', () => {
    pin('a.md', 'b.md', 'c.md', 'd.md')
    expect(readPinnedSkills(root)).toHaveLength(MAX_PINNED_SKILLS)
    expect(readPinnedSkills(path.join(root, 'missing'))).toEqual([])
  })
})

describe('skill tools over the real pack', () => {
  type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
  let service: AgentToolService
  const run = (id: string, args: Record<string, unknown>): Promise<unknown> => {
    const handler = (
      service as unknown as { _handlers: Map<string, Handler> }
    )._handlers.get(id)
    if (!handler) throw new Error(`handler ${id} not registered`)
    return handler(args, { projectRoot: root })
  }

  beforeEach(async() => {
    service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
    service.loadToolPack(await loader.loadPack(TOOL_PACK))
    service.setProjectRoot(root)
  })

  it('list_skills returns the catalog (and coaches when empty)', async() => {
    const empty = (await run('list_skills', {})) as { skills: unknown[]; note: string }
    expect(empty.skills).toHaveLength(0)
    expect(empty.note).toMatch(/propose_new_file/)

    write('skills/fight.md', FIGHT_SKILL)
    const result = (await run('list_skills', {})) as {
      skills: Array<{ name: string; description: string }>
    }
    expect(result.skills[0].name).toBe('Fight choreography')
  })

  it('use_skill loads a body and coaches on unknown names', async() => {
    write('skills/fight.md', FIGHT_SKILL)
    const loaded = (await run('use_skill', { name: 'Fight Choreography' })) as {
      instructions: string
      truncated: boolean
    }
    expect(loaded.instructions).toContain('three beats')
    expect(loaded.truncated).toBe(false)

    await expect(run('use_skill', { name: 'kissing scenes' })).rejects.toThrow(
      /Available skills: Fight choreography/
    )
  })
})

describe('brief injection', () => {
  it('carries the catalog, omits it when skills/ is empty', async() => {
    const bare = await new ContextBuilder().buildProjectBrief(root)
    expect(bare).not.toContain('SKILLS AVAILABLE')

    write('skills/fight.md', FIGHT_SKILL)
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('SKILLS AVAILABLE')
    expect(brief).toContain('Fight choreography — Beat-by-beat action clarity rules.')
    expect(brief).not.toContain('PINNED SKILLS')
  })

  it('pinned bodies ride in full (capped); missing pins degrade to a note', async() => {
    write('skills/fight.md', FIGHT_SKILL)
    write('skills/long.md', `---\nname: Long one\ndescription: big\n---\n${'x'.repeat(3000)}`)
    pin('fight.md', 'long.md', 'vanished.md')

    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('PINNED SKILLS')
    expect(brief).toContain('## Fight choreography')
    expect(brief).toContain('Keep each exchange to three beats.')
    expect(brief).toContain('…[trimmed]') // long.md capped
    expect(brief).toContain('vanished.md is pinned but missing')
    // Body length discipline: the long pin is clipped near the cap.
    const pinnedSection = brief.slice(brief.indexOf('PINNED SKILLS'))
    expect(pinnedSection.length).toBeLessThan(MAX_SKILL_BODY_CHARS * 3 + 800)
  })
})

describe('prompt contracts', () => {
  it('supervisor carries the skills doctrine and both read tools', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('use_skill it BEFORE writing')
    expect(prompt).toContain('Pinned skills already ride the brief')
    expect(SUPERVISOR_TOOL_NAMES).toContain('list_skills')
    expect(SUPERVISOR_TOOL_NAMES).toContain('use_skill')
  })

  it('conventions teach skills/ to every agent, including the distill offer', () => {
    expect(PROJECT_CONVENTIONS).toContain('skills/')
    expect(PROJECT_CONVENTIONS).toContain('use_skill')
    expect(PROJECT_CONVENTIONS).toContain('propose_new_file into skills/')
  })
})
