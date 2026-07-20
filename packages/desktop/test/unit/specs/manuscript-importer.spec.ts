/**
 * ManuscriptImporter (SOTA batch-3): split an existing manuscript into
 * chapters/scenes and write it into a WordBird project. Pins the pure
 * split across heading layouts + scene breaks, and the disk write +
 * binder build.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  splitManuscript,
  writeImportedManuscript
} from '../../../src/main/services/novel/ManuscriptImporter'

describe('splitManuscript', () => {
  it('splits # chapters with ## scenes', () => {
    const md = [
      '# Chapter One',
      '',
      '## The Alley',
      'Zara stepped into the rain.',
      '',
      '## The Letter',
      'A letter waited on her desk.',
      '',
      '# Chapter Two',
      '',
      '## The Vault',
      'The vault was empty.'
    ].join('\n')
    const { chapters } = splitManuscript(md)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('Chapter One')
    expect(chapters[0].scenes.map((s) => s.title)).toEqual(['The Alley', 'The Letter'])
    expect(chapters[0].scenes[0].content).toContain('Zara stepped')
    expect(chapters[1].scenes[0].title).toBe('The Vault')
  })

  it('treats the shallowest heading level as the chapter boundary', () => {
    // Only ## headings → chapters are ##, scenes fall back to the body.
    const md = '## Part I\nOpening prose.\n\n## Part II\nMore prose.'
    const { chapters } = splitManuscript(md)
    expect(chapters.map((c) => c.title)).toEqual(['Part I', 'Part II'])
    expect(chapters[0].scenes).toHaveLength(1)
    expect(chapters[0].scenes[0].content).toContain('Opening prose')
  })

  it('keeps text that precedes the first chapter heading (title page/epigraph)', () => {
    // Import is content-preserving: a preamble belongs to no chapter, so it
    // rides the first chapter's body rather than being dropped silently.
    const md = 'AN EPIGRAPH\n\nby the author\n\n# Chapter One\n\nbody one\n\n# Chapter Two\n\nbody two'
    const { chapters } = splitManuscript(md)
    expect(chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    const firstChapterText = chapters[0].scenes.map((s) => s.content).join('\n')
    expect(firstChapterText).toContain('AN EPIGRAPH')
    expect(firstChapterText).toContain('body one')
    // …and it is not duplicated into later chapters.
    expect(chapters[1].scenes.map((s) => s.content).join('\n')).not.toContain('AN EPIGRAPH')
  })

  it('splits a chapter body on horizontal-rule scene breaks', () => {
    const md = ['# One', 'Scene A here.', '', '* * *', '', 'Scene B here.', '', '---', '', 'Scene C.'].join(
      '\n'
    )
    const { chapters } = splitManuscript(md)
    expect(chapters[0].scenes).toHaveLength(3)
    expect(chapters[0].scenes[0].content).toContain('Scene A')
    expect(chapters[0].scenes[2].content).toContain('Scene C')
  })

  it('keeps a chapter body as one scene when there are no scene markers', () => {
    const md = '# Solo\nOne continuous scene with no breaks at all.'
    const { chapters } = splitManuscript(md)
    expect(chapters[0].scenes).toHaveLength(1)
    expect(chapters[0].scenes[0].content).toContain('continuous scene')
  })

  it('prose before the first scene heading becomes an Opening scene', () => {
    const md = '# One\nA cold open before any scene heading.\n\n## Real Scene\nThe scene proper.'
    const { chapters } = splitManuscript(md)
    expect(chapters[0].scenes[0].title).toBe('Opening')
    expect(chapters[0].scenes[0].content).toContain('cold open')
    expect(chapters[0].scenes[1].title).toBe('Real Scene')
  })

  it('a heading-less document becomes one chapter split on scene breaks', () => {
    const md = 'First beat.\n\n* * *\n\nSecond beat.'
    const { chapters } = splitManuscript(md)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].scenes).toHaveLength(2)
  })

  it('ignores headings and rules inside fenced code blocks', () => {
    const md = ['# Real Chapter', 'Prose.', '', '```', '# not a heading', '* * *', '```', '', 'More prose.'].join(
      '\n'
    )
    const { chapters } = splitManuscript(md)
    expect(chapters).toHaveLength(1)
    // The fenced "* * *" did not split the scene.
    expect(chapters[0].scenes).toHaveLength(1)
    expect(chapters[0].scenes[0].content).toContain('# not a heading')
  })
})

describe('writeImportedManuscript', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-import-'))
    fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.wordbird', 'project.json'),
      JSON.stringify({ name: 'Imported', flavor: 'chapters-scenes' })
    )
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('writes scene files with writer-friendly slugs and builds the binder', async() => {
    const md = '# Chapter One\n\n## The Alley\nZara stepped into the rain.\n\n## The Letter\nA letter.'
    const result = await writeImportedManuscript(root, splitManuscript(md))
    expect(result.chapters).toBe(1)
    expect(result.scenes).toBe(2)
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/the-alley.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/the-letter.md'))).toBe(true)
    expect(fs.readFileSync(path.join(root, 'manuscript/chapter-one/the-alley.md'), 'utf8')).toContain(
      'Zara stepped'
    )

    // The binder was built from the written files.
    const structure = JSON.parse(
      fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    ) as { flavor: string; units: Array<{ title: string; children?: unknown[] }> }
    expect(structure.flavor).toBe('chapters-scenes')
    expect(structure.units).toHaveLength(1)
    expect(structure.units[0].children).toHaveLength(2)
  })

  it('de-duplicates colliding chapter and scene slugs', async() => {
    const md = '# Chapter\n\n## Scene\nA.\n\n## Scene\nB.\n\n# Chapter\n\n## Scene\nC.'
    const result = await writeImportedManuscript(root, splitManuscript(md))
    // Every scene lands on its own file — nothing overwritten.
    expect(new Set(result.files).size).toBe(result.files.length)
    expect(result.scenes).toBe(3)
  })
})
