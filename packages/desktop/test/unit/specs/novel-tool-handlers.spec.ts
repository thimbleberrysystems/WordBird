import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  AgentToolService,
  AgentToolPackLoader,
  type ToolRunObservation
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { registerNovelAgentToolHandlers } from '../../../src/main/services/ai/NovelToolHandlers'
import {
  assertSafeUrl,
  htmlToText,
  parseDuckDuckGoHtml
} from '../../../src/main/services/ai/WebToolHandlers'
import { structureService } from '../../../src/main/services/novel/StructureService'

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

beforeEach(async() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-tools-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/opening.md', 'Elara walked into the rain.')
  write('manuscript/chapter-one/inciting.md', 'The letter mentioned Elara by name.')
  write('bible/characters/elara.md', '# Elara Voss\n\nEyes: grey. Age: 29.')
  service = new AgentToolService()
  registerNovelAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('list_structure / read_unit', () => {
  it('lists the binder tree with ids and titles', async() => {
    const result = (await run('list_structure', {})) as {
      flavor: string
      units: Array<{ type: string; title: string; children?: unknown[] }>
    }
    expect(result.flavor).toBe('chapters-scenes')
    expect(result.units[0].type).toBe('chapter')
    expect(result.units[0].children).toHaveLength(2)
  })

  it('reads a scene by unit id and a chapter as concatenated scenes', async() => {
    const structure = await structureService.loadReconciled(root)
    const chapter = structure.units[0]
    const scene = chapter.children!.find((s) => s.title === 'opening')!

    const sceneResult = (await run('read_unit', { unitId: scene.id })) as { content: string }
    expect(sceneResult.content).toContain('rain')

    const chapterResult = (await run('read_unit', { unitId: chapter.id })) as {
      content: string
      paths: string[]
    }
    expect(chapterResult.paths).toHaveLength(2)
    expect(chapterResult.content).toContain('<<scene:')
  })

  it('rejects unknown unit ids with guidance', async() => {
    await expect(run('read_unit', { unitId: 'nope' })).rejects.toThrow(/list_structure/)
  })
})

describe('get_scene_handoff', () => {
  it('returns the tail of the preceding scene in narrative order', async() => {
    // Scan order puts 'inciting' before 'opening' in this fixture.
    const structure = await structureService.loadReconciled(root)
    const chapter = structure.units[0]
    const second = chapter.children!.find((s) => s.title === 'opening')!
    const result = (await run('get_scene_handoff', { unitId: second.id })) as { handoff: string }
    expect(result.handoff).toContain('letter')
    expect(result.handoff).toMatch(/do not retell/i)
  })

  it('says so honestly when there is no predecessor', async() => {
    const structure = await structureService.loadReconciled(root)
    const first = structure.units[0].children!.find((s) => s.title === 'inciting')!
    const result = (await run('get_scene_handoff', { unitId: first.id })) as { handoff: string }
    expect(result.handoff).toMatch(/no preceding scene/i)
  })
})

describe('search_manuscript', () => {
  it('finds matches across prose and bible', async() => {
    const result = (await run('search_manuscript', { query: 'Elara' })) as {
      matches: Array<{ file: string; line: number; text: string }>
    }
    const files = result.matches.map((m) => m.file)
    expect(files.some((f) => f.includes('opening.md'))).toBe(true)
    expect(files.some((f) => f.includes('elara.md'))).toBe(true)
  })

  it('returns empty matches for absent text', async() => {
    const result = (await run('search_manuscript', { query: 'zzz-not-present' })) as {
      matches: unknown[]
    }
    expect(result.matches).toEqual([])
  })
})

describe('propose_new_unit', () => {
  it('creates a scene shell and routes content through an edit proposal', async() => {
    const structure = await structureService.loadReconciled(root)
    const chapterId = structure.units[0].id

    const result = (await run('propose_new_unit', {
      type: 'scene',
      title: 'The Confrontation',
      parentId: chapterId,
      content: 'They met at dawn.'
    })) as { edit: { filePath: string; newContent: string }; oldContent: string }

    expect(result.edit.newContent).toBe('They met at dawn.')
    expect(result.oldContent).toBe('')
    // Shell exists on disk and in the manifest; prose awaits review.
    expect(fs.existsSync(path.join(root, result.edit.filePath))).toBe(true)
    expect(fs.readFileSync(path.join(root, result.edit.filePath), 'utf8')).toBe('')
  })
})

describe('bible tools', () => {
  it('lists bible pages with first lines', async() => {
    const result = (await run('read_bible', {})) as {
      entries: Array<{ path: string; firstLine: string }>
    }
    const elara = result.entries.find((e) => e.path.includes('elara'))
    expect(elara?.firstLine).toContain('Elara Voss')
  })

  it('reads a single bible page', async() => {
    const result = (await run('read_bible', { path: 'bible/characters/elara.md' })) as {
      content: string
    }
    expect(result.content).toContain('Eyes: grey')
  })

  it('refuses paths outside bible/', async() => {
    await expect(
      run('propose_bible_update', {
        path: 'manuscript/chapter-one/opening.md',
        newContent: 'x'
      })
    ).rejects.toThrow(/bible/)
  })

  it('proposes new bible pages with empty oldContent', async() => {
    const result = (await run('propose_bible_update', {
      path: 'bible/places/salt-marsh.md',
      newContent: '# The Salt Marsh\n\nBrackish and vast.'
    })) as { edit: { filePath: string }; oldContent: string }
    expect(result.oldContent).toBe('')
    expect(result.edit.filePath).toBe(path.join('bible', 'places', 'salt-marsh.md'))
  })
})

describe('summaries and continuity', () => {
  it('round-trips summaries for units and the book', async() => {
    await run('update_summary', { content: 'A book about rain.' })
    const book = (await run('read_summary', {})) as { content: string; exists: boolean }
    expect(book.content).toBe('A book about rain.')

    await run('update_summary', { unitId: 'scene-1', content: 'Rain falls.' })
    const scene = (await run('read_summary', { unitId: 'scene-1' })) as { content: string }
    expect(scene.content).toBe('Rain falls.')

    const missing = (await run('read_summary', { unitId: 'other' })) as { exists: boolean }
    expect(missing.exists).toBe(false)
  })

  it('logs continuity issues to .wordbird/continuity/issues.json', async() => {
    const result = (await run('log_continuity_issue', {
      title: 'Eye color conflict',
      description: 'Grey in ch1, green in ch3.',
      severity: 'high',
      relatedPaths: ['manuscript/chapter-one/opening.md']
    })) as { logged: boolean; openIssues: number }
    expect(result.logged).toBe(true)
    expect(result.openIssues).toBe(1)

    const issues = JSON.parse(
      fs.readFileSync(path.join(root, '.wordbird', 'continuity', 'issues.json'), 'utf8')
    )
    expect(issues[0].title).toBe('Eye color conflict')
    expect(issues[0].severity).toBe('high')
  })
})

describe('snapshot_project', () => {
  it('takes an auto snapshot through the tool', async() => {
    const result = (await run('snapshot_project', { message: 'Before big edit' })) as {
      snapshot: string | null
      changed: boolean
    }
    expect(result.changed).toBe(true)
    expect(result.snapshot).toBeTruthy()
  })
})

describe('duplicate-work guards (parallel agents converge, never fork)', () => {
  it('record_decision refuses to double-log the same choice', async() => {
    await run('record_decision', { decision: 'Zara never learns to swim.', reason: 'theme' })
    const second = (await run('record_decision', {
      decision: '  zara NEVER learns to swim. '
    })) as { recorded: unknown; duplicate?: boolean }
    expect(second.duplicate).toBe(true)
    expect(second.recorded).toBe(false)
  })

  it('log_continuity_issue points at the existing open issue instead of re-filing', async() => {
    const first = (await run('log_continuity_issue', {
      title: 'Storm timing conflict',
      description: 'Ch1 says dawn, Ch3 says dusk.'
    })) as { issueId: string }
    const second = (await run('log_continuity_issue', {
      title: 'storm  timing CONFLICT',
      description: 'Found the same thing.'
    })) as { logged: boolean; duplicate: boolean; issueId: string }
    expect(second.logged).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.issueId).toBe(first.issueId)
  })

  it('propose_new_unit refuses a scene named like its parent chapter', async() => {
    // The chapter names the FOLDER and the scene names the FILE, so equal
    // titles give a doubled path (the-cellar/the-cellar.md). Refused rather
    // than warned: a warning in a tool result is easy to sail past, and
    // every such unit has to be renamed by hand afterwards.
    const structure = await structureService.loadReconciled(root)
    const chapter = structure.units[0]

    const rejected = (await run('propose_new_unit', {
      type: 'scene',
      title: `  ${chapter.title.toUpperCase()} `,
      parentId: chapter.id
    })) as { created: boolean; redundantName: boolean; note: string }
    expect(rejected.created).toBe(false)
    expect(rejected.redundantName).toBe(true)
    expect(rejected.note).toMatch(/names the FOLDER/i)

    // A distinct scene title under the same chapter is fine…
    const ok = (await run('propose_new_unit', {
      type: 'scene',
      title: 'Dusk on the veranda',
      parentId: chapter.id
    })) as { created: boolean; path: string }
    expect(ok.created).toBe(true)
    expect(ok.path).toMatch(/dusk-on-the-veranda\.md$/)

    // …and allowDuplicate remains the deliberate escape hatch.
    const forced = (await run('propose_new_unit', {
      type: 'scene',
      title: chapter.title,
      parentId: chapter.id,
      allowDuplicate: true
    })) as { created: boolean }
    expect(forced.created).toBe(true)
  })

  it('propose_new_unit refuses a same-titled sibling unless allowDuplicate', async() => {
    const structure = await structureService.loadReconciled(root)
    const chapterId = structure.units[0].id
    const first = (await run('propose_new_unit', {
      type: 'scene',
      title: 'The Ambush',
      parentId: chapterId
    })) as { unitId: string }
    const dup = (await run('propose_new_unit', {
      type: 'scene',
      title: '  the AMBUSH ',
      parentId: chapterId
    })) as { created: boolean; duplicate: boolean; unitId: string }
    expect(dup.created).toBe(false)
    expect(dup.duplicate).toBe(true)
    expect(dup.unitId).toBe(first.unitId)

    const distinct = (await run('propose_new_unit', {
      type: 'scene',
      title: 'The Ambush',
      parentId: chapterId,
      allowDuplicate: true
    })) as { unitId?: string; created?: boolean }
    expect(distinct.unitId).not.toBe(first.unitId)
  })
})

describe('tool-run observer (the coherence choke point)', () => {
  const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

  const makePackService = async(): Promise<AgentToolService> => {
    const packService = new AgentToolService()
    registerBuiltInAgentToolHandlers(packService)
    const loader = new AgentToolPackLoader(packService.getKnownHandlerIds())
    packService.loadToolPack(await loader.loadPack(TOOL_PACK))
    packService.setProjectRoot(root)
    return packService
  }

  it('fires with the tool name on runForModel success (both providers ride this)', async() => {
    const packService = await makePackService()
    const seen: ToolRunObservation[] = []
    packService.setToolRunObserver((observation) => seen.push(observation))
    await packService.runForModel('list_structure', {})
    expect(seen.map((o) => o.toolName)).toEqual(['list_structure'])
  })

  it('fires on execute() too (renderer-initiated calls are not a bypass)', async() => {
    const packService = await makePackService()
    const seen: ToolRunObservation[] = []
    packService.setToolRunObserver((observation) => seen.push(observation))
    const result = await packService.execute(
      { id: 'list_structure', args: {} },
      { projectRoot: root }
    )
    expect(result.ok).toBe(true)
    expect(seen.map((o) => o.toolName)).toEqual(['list_structure'])
  })

  it('never fires when the handler throws (a failed tool changed nothing)', async() => {
    const packService = await makePackService()
    const seen: ToolRunObservation[] = []
    packService.setToolRunObserver((observation) => seen.push(observation))
    await expect(packService.runForModel('read_unit', { unitId: 'nope' })).rejects.toThrow()
    expect(seen).toEqual([])
  })

  it('the 3rd identical call carries a repeat note; distinct calls never do', async() => {
    const packService = await makePackService()
    const first = String(await packService.runForModel('list_structure', {}))
    expect(first).not.toContain('Identical')
    await packService.runForModel('list_structure', {})
    const third = String(await packService.runForModel('list_structure', {}))
    expect(third).toContain('Identical list_structure call #3')
    // Different args are a different call.
    const other = String(await packService.runForModel('search_manuscript', { query: 'x' }))
    expect(other).not.toContain('Identical')
    // A new turn resets.
    packService.resetTurnCallCounts()
    const fresh = String(await packService.runForModel('list_structure', {}))
    expect(fresh).not.toContain('Identical')
  })

  it('an observer that throws never fails the tool', async() => {
    const packService = await makePackService()
    packService.setToolRunObserver(() => {
      throw new Error('observer bug')
    })
    const result = await packService.runForModel('list_structure', {})
    expect(JSON.stringify(result)).toContain('chapters-scenes')
  })
})

describe('web tool guards (pure helpers)', () => {
  it('accepts public http(s) URLs', () => {
    expect(assertSafeUrl('https://en.wikipedia.org/wiki/Telegraphy').hostname).toBe(
      'en.wikipedia.org'
    )
  })

  it('rejects unsafe protocols, credentials, and private hosts', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow()
    expect(() => assertSafeUrl('https://user:pass@example.com/')).toThrow()
    expect(() => assertSafeUrl('http://localhost:8080/')).toThrow()
    expect(() => assertSafeUrl('http://127.0.0.1/')).toThrow()
    expect(() => assertSafeUrl('http://192.168.1.10/x')).toThrow()
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow()
    expect(() => assertSafeUrl('http://172.20.3.4/')).toThrow()
    expect(() => assertSafeUrl('not a url')).toThrow()
  })

  it('reduces html to readable text', () => {
    const text = htmlToText(
      '<html><head><script>evil()</script><style>.x{}</style></head>' +
        '<body><h1>Title</h1><p>One &amp; two.</p><div>Three</div></body></html>'
    )
    expect(text).toContain('Title')
    expect(text).toContain('One & two.')
    expect(text).not.toContain('evil')
  })

  it('parses DuckDuckGo result markup and unwraps redirect URLs', () => {
    const html =
      '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc">Example <b>Page</b></a>' +
      '<a class="result__snippet" href="#">A snippet about things.</a>'
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://example.com/page')
    expect(results[0].title).toBe('Example Page')
    expect(results[0].snippet).toContain('snippet')
  })
})
