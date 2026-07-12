import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { sanitizeWikiLang } from '../../../src/main/services/ai/WebToolHandlers'
import { structureService } from '../../../src/main/services/novel/StructureService'
import { SnapshotService } from '../../../src/main/services/novel/SnapshotService'
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-tools2-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'T', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/opening.md', 'It began with rain.')
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('list_files', () => {
  it('lists project files recursively with sizes, skipping internals', async() => {
    write('notes/ideas.md', 'brainstorm')
    write('bible/characters/elara.md', '# Elara')
    write('exports/book.md', 'compiled output')
    write('.wordbird/structure.json', '{}')

    const result = (await run('list_files', {})) as {
      files: Array<{ path: string; size: number }>
      truncated: boolean
    }
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain(path.join('notes', 'ideas.md'))
    expect(paths).toContain(path.join('bible', 'characters', 'elara.md'))
    expect(paths).toContain(path.join('manuscript', 'chapter-one', 'opening.md'))
    // Internals and derived output stay hidden.
    expect(paths.some((p) => p.startsWith('.wordbird'))).toBe(false)
    expect(paths.some((p) => p.startsWith('exports'))).toBe(false)
    expect(result.files.every((f) => typeof f.size === 'number')).toBe(true)
  })

  it('lists a single subdirectory and rejects escapes', async() => {
    write('notes/ideas.md', 'brainstorm')
    const result = (await run('list_files', { dir: 'notes' })) as {
      files: Array<{ path: string }>
    }
    expect(result.files).toHaveLength(1)
    await expect(run('list_files', { dir: '../..' })).rejects.toThrow(/outside/)
  })
})

describe('continuity list/resolve tools', () => {
  it('lists open issues and resolves verified ones', async() => {
    await run('log_continuity_issue', {
      title: 'Eye color conflict',
      description: 'Grey vs green.',
      severity: 'high'
    })

    const listed = (await run('list_continuity_issues', {})) as {
      open: Array<{ id: string; title: string }>
      resolvedCount: number
    }
    expect(listed.open).toHaveLength(1)
    expect(listed.resolvedCount).toBe(0)

    const resolved = (await run('resolve_continuity_issue', {
      issueId: listed.open[0].id,
      resolution: 'Chapter 3 now says grey; verified by search.'
    })) as { resolved: boolean }
    expect(resolved.resolved).toBe(true)

    const after = (await run('list_continuity_issues', {})) as {
      open: unknown[]
      resolvedCount: number
    }
    expect(after.open).toHaveLength(0)
    expect(after.resolvedCount).toBe(1)
  })

  it('rejects resolving unknown issues', async() => {
    await expect(
      run('resolve_continuity_issue', { issueId: 'nope', resolution: 'x' })
    ).rejects.toThrow(/list_continuity_issues/)
  })
})

describe('delete_unit', () => {
  it('snapshots first, then removes the unit and its file', async() => {
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]

    const result = (await run('delete_unit', {
      unitId: scene.id,
      reason: 'Writer cut the opening.'
    })) as { deleted: boolean; snapshotTaken: boolean }
    expect(result.deleted).toBe(true)
    expect(result.snapshotTaken).toBe(true)

    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/opening.md'))).toBe(false)

    // The protective snapshot can bring it back.
    const snapshots = await new SnapshotService().list(root)
    const guard = snapshots.find((s) => s.message.includes('Before deleting'))
    expect(guard).toBeDefined()
    expect(guard?.auto).toBe(true)
  })

  it('requires a reason and a real unit', async() => {
    await expect(run('delete_unit', { unitId: 'ghost', reason: 'x' })).rejects.toThrow(
      /list_structure/
    )
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await expect(run('delete_unit', { unitId: scene.id })).rejects.toThrow(/reason/)
  })
})

describe('propose_new_file', () => {
  it('proposes a brand-new file through the review pipeline', async() => {
    const result = (await run('propose_new_file', {
      path: 'notes/research-questions.md',
      content: '# Questions\n\n- How fast was a telegraph?',
      reason: 'Collecting research questions'
    })) as { edit: { filePath: string; newContent: string }; oldContent: string }

    expect(result.oldContent).toBe('')
    expect(result.edit.filePath).toBe(path.join('notes', 'research-questions.md'))
    expect(result.edit.newContent).toContain('telegraph')
    // Parent directory is ready for apply time; the file itself is NOT
    // written — that happens only when the writer accepts the diff.
    expect(fs.existsSync(path.join(root, 'notes'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'notes/research-questions.md'))).toBe(false)
  })

  it('refuses existing files, internal dirs, and odd extensions', async() => {
    await expect(
      run('propose_new_file', { path: 'manuscript/chapter-one/opening.md', content: 'x' })
    ).rejects.toThrow(/already exists/)
    await expect(
      run('propose_new_file', { path: '.wordbird/evil.md', content: 'x' })
    ).rejects.toThrow(/internal/)
    await expect(
      run('propose_new_file', { path: 'notes/script.sh', content: 'x' })
    ).rejects.toThrow(/must be/)
    await expect(
      run('propose_new_file', { path: '../outside.md', content: 'x' })
    ).rejects.toThrow(/outside/)
  })
})

describe('file management (Copilot-style)', () => {
  it('creates folders and refuses internal ones', async() => {
    const result = (await run('create_folder', { path: 'notes/act-two' })) as {
      created: boolean
    }
    expect(result.created).toBe(true)
    expect(fs.statSync(path.join(root, 'notes/act-two')).isDirectory()).toBe(true)
    await expect(run('create_folder', { path: '.wordbird/x' })).rejects.toThrow(/off limits/)
  })

  it('moves a loose file with a protective snapshot', async() => {
    write('notes/old.md', 'ideas')
    const result = (await run('move_file', {
      from: 'notes/old.md',
      to: 'notes/archive/ideas.md',
      reason: 'tidying'
    })) as { moved: boolean; manifestUpdated: boolean }
    expect(result.moved).toBe(true)
    expect(result.manifestUpdated).toBe(false)
    expect(fs.existsSync(path.join(root, 'notes/archive/ideas.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'notes/old.md'))).toBe(false)
  })

  it('moving a binder-backed file updates the structure manifest', async() => {
    const before = await structureService.loadReconciled(root)
    const scene = before.units[0].children![0]
    expect(scene.path).toContain('opening.md')

    const result = (await run('move_file', {
      from: scene.path as string,
      to: 'manuscript/chapter-one/renamed-opening.md',
      reason: 'renaming'
    })) as { manifestUpdated: boolean }
    expect(result.manifestUpdated).toBe(true)

    const after = await structureService.loadReconciled(root)
    const moved = after.units[0].children!.find((s) => s.id === scene.id)
    expect(moved?.path?.replace(/\\/g, '/')).toBe('manuscript/chapter-one/renamed-opening.md')
    // No duplicate discovered as a "new" file, no dropped unit.
    expect(after.units[0].children!.length).toBe(before.units[0].children!.length)
  })

  it('refuses to move onto an existing file', async() => {
    write('notes/a.md', 'a')
    write('notes/b.md', 'b')
    await expect(
      run('move_file', { from: 'notes/a.md', to: 'notes/b.md', reason: 'x' })
    ).rejects.toThrow(/already exists/)
  })

  it('deletes loose files but refuses binder-backed ones', async() => {
    write('notes/dead-draft.md', 'obsolete')
    const result = (await run('delete_file', {
      path: 'notes/dead-draft.md',
      reason: 'obsolete'
    })) as { deleted: boolean }
    expect(result.deleted).toBe(true)
    expect(fs.existsSync(path.join(root, 'notes/dead-draft.md'))).toBe(false)

    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    await expect(
      run('delete_file', { path: scene.path as string, reason: 'x' })
    ).rejects.toThrow(/delete_unit/)
  })
})

describe('wiki language sanitizer', () => {
  it('accepts real language codes and defaults to en', () => {
    expect(sanitizeWikiLang(undefined)).toBe('en')
    expect(sanitizeWikiLang('de')).toBe('de')
    expect(sanitizeWikiLang('zh-yue')).toBe('zh-yue')
    expect(sanitizeWikiLang('EN')).toBe('en')
  })

  it('rejects host-injection attempts', () => {
    expect(() => sanitizeWikiLang('evil.com/#')).toThrow()
    expect(() => sanitizeWikiLang('en.wikipedia.org.evil')).toThrow()
    expect(() => sanitizeWikiLang('..')).toThrow()
  })
})

describe('role/tool matrix', () => {
  it('gives every referenced tool a real registered handler', () => {
    const registered = new Set(service.getKnownHandlerIds())
    for (const role of Object.values(AGENT_ROLES)) {
      for (const tool of role.allowedTools) {
        expect(registered.has(tool), `${role.role} → ${tool}`).toBe(true)
      }
    }
  })

  it('keeps destructive/write tools away from read-only roles', () => {
    expect(AGENT_ROLES.explorer.allowedTools).not.toContain('delete_unit')
    expect(AGENT_ROLES.researcher.allowedTools).not.toContain('propose_project_file_edit')
    expect(AGENT_ROLES.auditor.allowedTools).not.toContain('delete_unit')
    expect(AGENT_ROLES.drafter.allowedTools).toContain('delete_unit')
    expect(AGENT_ROLES.researcher.allowedTools).toContain('wiki_read')
    expect(AGENT_ROLES['line-editor'].allowedTools).toContain('dictionary_lookup')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('resolve_continuity_issue')
  })
})

describe('new-file edit proposals reach the review queue', () => {
  it('propose_new_unit WITH content emits an edit proposal (oldContent is empty for new files)', async() => {
    const emitted: unknown[] = []
    service.setEditProposalEmitter((p) => {
      emitted.push(p)
    })
    service.setProjectRoot(root)
    service.loadToolPack({
      version: 1,
      enabled: true,
      source: 'test',
      tools: [
        {
          id: 'propose_new_unit',
          name: 'propose_new_unit',
          description: 'create unit',
          handler: 'propose_new_unit',
          enabled: true,
          scope: 'project',
          confirm: 'renderer',
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['type', 'title']
          }
        }
      ]
    })
    const structure = await structureService.loadReconciled(root)
    const chapterId = structure.units[0].id
    const langChainTool = service.getLangChainTools().find((t) => t.name === 'propose_new_unit')!
    const reply = (await langChainTool.invoke({
      type: 'scene',
      title: 'The Cellar',
      parentId: chapterId,
      content: 'Zara pried the door open.'
    })) as string
    expect(emitted).toHaveLength(1)
    const payload = emitted[0] as { edit: { newContent: string }; oldContent: string }
    expect(payload.oldContent).toBe('')
    expect(payload.edit.newContent).toContain('Zara')
    expect(reply).toContain('Edit proposal created')
  })

  it('content aimed at a container unit fails loudly instead of dropping prose', async() => {
    await expect(
      run('propose_new_unit', { type: 'chapter', title: 'Two', content: 'prose here' })
    ).rejects.toThrow(/NOT saved/i)
  })

  it('propose_new_unit WITHOUT content warns the model that nothing was saved', async() => {
    const result = (await run('propose_new_unit', {
      type: 'chapter',
      title: 'Empty Shell'
    })) as { created: boolean; warning?: string }
    expect(result.created).toBe(true)
    expect(result.warning).toMatch(/no prose was saved/i)
  })
})
