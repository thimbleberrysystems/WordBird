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
