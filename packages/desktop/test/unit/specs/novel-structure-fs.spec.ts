import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { StructureService, collectLeaves, findUnit } from '../../../src/main/services/novel/StructureService'
import type { INovelStructure } from '../../../src/shared/types/novel'

let root: string
const service = new StructureService()

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-novel-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'Test', flavor: 'chapters-scenes' }))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('StructureService.scan', () => {
  it('builds a part/chapter/scene tree from a chapters-scenes layout', async() => {
    write('manuscript/part-one/ch-01/01-opening.md', 'It began with rain.')
    write('manuscript/part-one/ch-01/02-inciting.md', 'Then the letter arrived.')
    write('manuscript/part-one/ch-02/01-turn.md', 'Everything changed.')

    const structure = await service.scan(root, 'chapters-scenes')
    expect(structure.flavor).toBe('chapters-scenes')
    expect(structure.units).toHaveLength(1)
    const part = structure.units[0]
    expect(part.type).toBe('part')
    expect(part.children).toHaveLength(2)
    expect(part.children?.[0].type).toBe('chapter')
    const leaves = collectLeaves(structure.units)
    expect(leaves.map((l) => l.title)).toEqual(['opening', 'inciting', 'turn'])
    expect(leaves[0].wordCount).toBe(4)
  })

  it('treats manuscript dirs with only files as chapters', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Hello world here.')
    const structure = await service.scan(root, 'chapters-scenes')
    expect(structure.units[0].type).toBe('chapter')
    expect(structure.units[0].children?.[0].type).toBe('scene')
  })

  it('scans a flat scene pool', async() => {
    write('scenes/a-scene.md', 'One.')
    write('scenes/b-scene.md', 'Two.')
    const structure = await service.scan(root, 'scene-pool')
    expect(structure.units.map((u) => u.type)).toEqual(['scene', 'scene'])
  })

  it('scans flat chapter files, skipping README', async() => {
    write('chapter-one.md', 'Chapter text.')
    write('README.md', 'Not a chapter.')
    const structure = await service.scan(root, 'flat')
    expect(structure.units).toHaveLength(1)
    expect(structure.units[0].title).toBe('chapter one')
  })
})

describe('StructureService.loadReconciled', () => {
  it('creates a manifest on first load using the project.json flavor', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Words here.')
    const structure = await service.loadReconciled(root)
    expect(structure.flavor).toBe('chapters-scenes')
    expect(fs.existsSync(path.join(root, '.wordbird', 'structure.json'))).toBe(true)
  })

  it('drops units whose files vanished and discovers new files', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Words here.')
    const first = await service.loadReconciled(root)
    expect(collectLeaves(first.units)).toHaveLength(1)

    fs.unlinkSync(path.join(root, 'manuscript/chapter-one/opening-scene.md'))
    write('manuscript/chapter-one/new-scene.md', 'New words.')

    const second = await service.loadReconciled(root)
    const leaves = collectLeaves(second.units)
    expect(leaves).toHaveLength(1)
    expect(leaves[0].path).toContain('new-scene.md')
  })

  it('preserves manifest order and metadata across reconciles', async() => {
    write('manuscript/chapter-one/a.md', 'A.')
    write('manuscript/chapter-one/b.md', 'B.')
    const first = await service.loadReconciled(root)
    const chapter = first.units[0]
    // Reverse the scenes and tag one with metadata.
    chapter.children = [chapter.children![1], chapter.children![0]]
    chapter.children[0].pov = 'Elara'
    chapter.children[0].status = 'revised'
    await service.save(root, first)

    const second = await service.loadReconciled(root)
    const scenes = second.units[0].children!
    expect(scenes.map((s) => s.title)).toEqual(['b', 'a'])
    expect(scenes[0].pov).toBe('Elara')
    expect(scenes[0].status).toBe('revised')
  })
})

describe('StructureService.createUnit', () => {
  it('creates a scene file inside its chapter directory', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Words.')
    const structure = await service.loadReconciled(root)
    const chapterId = structure.units[0].id

    const unit = await service.createUnit(root, structure, {
      parentId: chapterId,
      type: 'scene',
      title: 'The Confrontation'
    })
    expect(unit.path).toBeDefined()
    expect(fs.existsSync(path.join(root, unit.path as string))).toBe(true)
    expect(findUnit(structure.units, unit.id)?.parent?.id).toBe(chapterId)

    // Persisted
    const reloaded = await service.load(root)
    expect(findUnit(reloaded!.units, unit.id)).not.toBeNull()
  })

  it('suffixes the filename on collision instead of overwriting', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Original.')
    const structure = await service.loadReconciled(root)
    const chapterId = structure.units[0].id

    const unit = await service.createUnit(root, structure, {
      parentId: chapterId,
      type: 'scene',
      title: 'Opening Scene'
    })
    expect(unit.path).not.toBe('manuscript/chapter-one/opening-scene.md')
    expect(fs.readFileSync(path.join(root, 'manuscript/chapter-one/opening-scene.md'), 'utf8')).toBe(
      'Original.'
    )
  })

  it('creates container chapters without files', async() => {
    const structure = await service.loadReconciled(root)
    const unit = await service.createUnit(root, structure, {
      parentId: null,
      type: 'chapter',
      title: 'New Chapter'
    })
    expect(unit.path).toBeUndefined()
    expect(unit.children).toEqual([])
  })
})

describe('StructureService.deleteUnit', () => {
  it('removes files when asked', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Words.')
    const structure = await service.loadReconciled(root)
    const scene = collectLeaves(structure.units)[0]

    await service.deleteUnit(root, structure, scene.id, true)
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/opening-scene.md'))).toBe(false)
    expect(collectLeaves(structure.units)).toHaveLength(0)
  })

  it('keeps files when deleteFiles is false', async() => {
    write('manuscript/chapter-one/opening-scene.md', 'Words.')
    const structure = await service.loadReconciled(root)
    const scene = collectLeaves(structure.units)[0]

    await service.deleteUnit(root, structure, scene.id, false)
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/opening-scene.md'))).toBe(true)
  })

  it('folders are first-class: moving one keeps every unit underneath', async() => {
    write('manuscript/chapter-one/a.md', 'Scene A.')
    write('manuscript/chapter-one/b.md', 'Scene B.')
    await service.loadReconciled(root)

    type Handler = (a: Record<string, unknown>, c: unknown) => Promise<unknown>
    const toolService = new (await import('../../../src/main/services/ai/AgentToolService')).AgentToolService()
    const { registerNovelAgentToolHandlers } = await import(
      '../../../src/main/services/ai/NovelToolHandlers'
    )
    registerNovelAgentToolHandlers(toolService)
    const moveFile = (
      toolService as unknown as { _handlers: Map<string, Handler> }
    )._handlers.get('move_file')!

    const result = (await moveFile(
      { from: 'manuscript/chapter-one', to: 'manuscript/part-one', reason: 'reorg' },
      { projectRoot: root }
    )) as { moved: boolean; folder: boolean; unitsUpdated: number }
    expect(result.moved).toBe(true)
    expect(result.folder).toBe(true)
    expect(result.unitsUpdated).toBeGreaterThanOrEqual(2)
    expect(fs.existsSync(path.join(root, 'manuscript/part-one/a.md'))).toBe(true)

    // The binder followed the move — same units, new paths, nothing pruned.
    const after = await service.loadReconciled(root)
    const paths = collectLeaves(after.units).map((u) => u.path)
    expect(paths).toContain('manuscript/part-one/a.md')
    expect(paths).toContain('manuscript/part-one/b.md')
  })

  it('removes the unit summary regardless of deleteFiles (no orphans)', async() => {
    for (const deleteFiles of [true, false]) {
      write(`manuscript/chapter-one/scene-${deleteFiles}.md`, 'Words.')
      const structure = await service.loadReconciled(root)
      const scene = collectLeaves(structure.units).find(
        (u) => u.path === `manuscript/chapter-one/scene-${deleteFiles}.md`
      )!
      const summary = path.join(root, '.wordbird', 'summaries', `${scene.id}.md`)
      write(`.wordbird/summaries/${scene.id}.md`, 'A summary.')

      await service.deleteUnit(root, structure, scene.id, deleteFiles)
      expect(fs.existsSync(summary)).toBe(false)
    }
  })
})

describe('StructureService.compile', () => {
  it('compiles the tree to a single manuscript and writes the output file', async() => {
    write('manuscript/part-one/ch-01/01-a.md', 'Scene one.')
    write('manuscript/part-one/ch-01/02-b.md', 'Scene two.')
    const structure = await service.loadReconciled(root)

    const outputPath = path.join(root, 'exports', 'book.md')
    const result = await service.compile(root, structure, { outputPath })
    expect(result.ok).toBe(true)
    expect(result.content).toContain('# part one')
    expect(result.content).toContain('Scene one.\n\n* * *\n\nScene two.')
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(result.content)
    expect(result.wordCount).toBeGreaterThan(0)
  })

  it('reports structure with no units as empty output, not an error', async() => {
    const structure: INovelStructure = { version: 1, flavor: 'flat', units: [] }
    const result = await service.compile(root, structure)
    expect(result.ok).toBe(true)
    expect(result.content).toBe('\n')
  })
})

describe('StructureService.moveUnit (service path — persistence + integrity)', () => {
  const seed = async(): Promise<INovelStructure> => {
    write('manuscript/part-one/ch-01/01-opening.md', 'It began with rain.')
    write('manuscript/part-one/ch-01/02-inciting.md', 'Then the letter arrived.')
    write('manuscript/part-one/ch-02/01-turn.md', 'Everything changed.')
    const structure = await service.scan(root, 'chapters-scenes')
    await service.save(root, structure)
    return structure
  }

  it('persists the moved order to structure.json', async() => {
    const structure = await seed()
    const part = structure.units[0]
    const [ch1, ch2] = part.children!
    const scene = ch1.children![0]
    await service.moveUnit(root, structure, scene.id, ch2.id, 0)

    const saved = JSON.parse(
      fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    ) as INovelStructure
    const savedCh2 = findUnit(saved.units, ch2.id)!
    expect(savedCh2.unit.children!.map((c) => c.id)[0]).toBe(scene.id)
    // Files never move on reorder — order lives in the manifest.
    expect(fs.existsSync(path.join(root, 'manuscript/part-one/ch-01/01-opening.md'))).toBe(true)
  })

  it('a rejected move throws and leaves the saved manifest untouched', async() => {
    const structure = await seed()
    const before = fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    const part = structure.units[0]
    const ch1 = part.children![0]
    // Moving a chapter into its own subtree is illegal.
    await expect(
      service.moveUnit(root, structure, part.id, ch1.id, 0)
    ).rejects.toThrow(/cannot move/i)
    expect(fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')).toBe(before)
  })

  it('reconcile after an external file add preserves the moved order (ids stable)', async() => {
    const structure = await seed()
    const part = structure.units[0]
    const [ch1, ch2] = part.children!
    const moved = ch1.children![1]
    await service.moveUnit(root, structure, moved.id, ch2.id, 0)

    // A new scene lands on disk OUTSIDE the app (sync, editor, agent).
    write('manuscript/part-one/ch-02/02-aftermath.md', 'The dust settled.')
    const reconciled = await service.loadReconciled(root)

    const rCh2 = findUnit(reconciled.units, ch2.id)!
    const ids = rCh2.unit.children!.map((c) => c.id)
    // Moved unit KEPT its id and its position at the head…
    expect(ids[0]).toBe(moved.id)
    // …and the external file was ADOPTED — reconcile appends unknown
    // files at the TOP LEVEL (never guesses a chapter, never loses one).
    const everyLeaf = collectLeaves(reconciled.units)
    expect(everyLeaf.map((l) => l.title)).toContain('aftermath')
    const everyId = everyLeaf.map((l) => l.id)
    expect(new Set(everyId).size).toBe(everyId.length)
  })
})
