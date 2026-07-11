import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ContinuityService } from '../../../src/main/services/novel/ContinuityService'
import { isLockedCanon } from '../../../src/main/services/ai/NovelToolHandlers'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerNovelAgentToolHandlers } from '../../../src/main/services/ai/NovelToolHandlers'
import type { IContinuityIssue } from '../../../src/shared/types/novel'

let root: string
const service = new ContinuityService()

const issue = (overrides: Partial<IContinuityIssue> = {}): IContinuityIssue => ({
  id: overrides.id ?? crypto.randomUUID(),
  title: 'Eye color conflict',
  description: 'Grey in ch1, green in ch3.',
  severity: 'high',
  relatedPaths: [],
  status: 'open',
  createdAt: new Date().toISOString(),
  ...overrides
})

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-cont-'))
  fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.wordbird', 'project.json'),
    JSON.stringify({ name: 'T', flavor: 'flat' })
  )
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('ContinuityService', () => {
  it('lists empty when no issues file exists', async() => {
    expect(await service.list(root)).toEqual([])
  })

  it('adds and resolves issues', async() => {
    const first = issue({ id: 'a' })
    const open = await service.add(root, first)
    expect(open).toBe(1)
    await service.add(root, issue({ id: 'b' }))

    expect(await service.resolve(root, 'a')).toBe(true)
    const all = await service.list(root)
    expect(all.find((i) => i.id === 'a')?.status).toBe('resolved')
    expect(all.find((i) => i.id === 'b')?.status).toBe('open')
  })

  it('returns false when resolving an unknown issue', async() => {
    expect(await service.resolve(root, 'missing')).toBe(false)
  })
})

describe('locked canon', () => {
  it('detects locked front matter', () => {
    expect(isLockedCanon('---\nlocked: true\n---\n# Elara')).toBe(true)
    expect(isLockedCanon('---\ntitle: x\nlocked: true\n---\nBody')).toBe(true)
    expect(isLockedCanon('---\nlocked: false\n---\nBody')).toBe(false)
    expect(isLockedCanon('# No front matter\nlocked: true')).toBe(false)
    expect(isLockedCanon('')).toBe(false)
  })

  it('blocks propose_bible_update on locked pages but allows unlocked ones', async() => {
    fs.mkdirSync(path.join(root, 'bible', 'characters'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'bible', 'characters', 'elara.md'),
      '---\nlocked: true\n---\n# Elara\n\nEyes: grey.'
    )
    fs.writeFileSync(path.join(root, 'bible', 'characters', 'mira.md'), '# Mira\n\nA rival.')

    const toolService = new AgentToolService()
    registerNovelAgentToolHandlers(toolService)
    const handlers = (
      toolService as unknown as {
        _handlers: Map<string, (a: Record<string, unknown>, c: unknown) => Promise<unknown>>
      }
    )._handlers
    const propose = handlers.get('propose_bible_update')!
    const context = { projectRoot: root }

    await expect(
      propose({ path: 'bible/characters/elara.md', newContent: 'rewrite' }, context)
    ).rejects.toThrow(/LOCKED/)

    const ok = (await propose(
      { path: 'bible/characters/mira.md', newContent: '# Mira\n\nNow an ally.' },
      context
    )) as { edit: { filePath: string } }
    expect(ok.edit.filePath).toContain('mira.md')
  })
})
