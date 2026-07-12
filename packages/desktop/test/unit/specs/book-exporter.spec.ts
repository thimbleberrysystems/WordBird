/**
 * Whole-book EPUB/DOCX export: chapter slicing, real container output
 * (both formats are zip archives — 'PK' magic; epub additionally carries
 * its mimetype entry), and the compile pipeline writing them to disk.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  splitChapters,
  exportEpub,
  exportDocx
} from '../../../src/main/services/novel/BookExporter'

const MANUSCRIPT = [
  '# Chapter One',
  '',
  'The lighthouse keeper counted the waves.',
  '',
  '# Chapter Two',
  '',
  'The storm arrived at midnight. *Nobody* slept.',
  ''
].join('\n')

describe('splitChapters', () => {
  it('slices on top-level headings and keeps prose with its chapter', () => {
    const chapters = splitChapters(MANUSCRIPT)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('Chapter One')
    expect(chapters[0].markdown).toContain('counted the waves')
    expect(chapters[1].title).toBe('Chapter Two')
  })

  it('prose before the first heading becomes a front section', () => {
    const chapters = splitChapters('An epigraph.\n\n# One\n\nText.')
    expect(chapters[0].title).toBe('')
    expect(chapters[0].markdown).toBe('An epigraph.')
    expect(chapters[1].title).toBe('One')
  })

  it('a heading-less manuscript is one slice', () => {
    expect(splitChapters('Just prose, no headings.')).toHaveLength(1)
  })
})

describe('exportEpub', () => {
  it('produces a real EPUB container (mimetype + OPF + chapter files)', async() => {
    const buffer = await exportEpub(MANUSCRIPT, { title: 'The Lighthouse' })
    const raw = buffer.toString('latin1')
    // Zip magic + the EPUB mimetype entry near the front of the archive,
    // and the package structure e-readers require (entry names are stored
    // uncompressed in zip local headers).
    expect(raw.slice(0, 2)).toBe('PK')
    expect(raw.slice(0, 200)).toContain('mimetype')
    expect(raw).toContain('.opf')
    expect(raw).toContain('toc')
    expect(buffer.length).toBeGreaterThan(1000)
  }, 30000)
})

describe('exportDocx', () => {
  it('produces a real DOCX container (word/document.xml present)', async() => {
    const buffer = await exportDocx(MANUSCRIPT, { title: 'The Lighthouse' })
    const raw = buffer.toString('latin1')
    expect(raw.slice(0, 2)).toBe('PK')
    expect(raw).toContain('word/document.xml')
    expect(buffer.length).toBeGreaterThan(1000)
  }, 30000)
})

describe('compile writes the chosen format', () => {
  it('epub/docx land on disk via the compile pipeline', async() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-export-'))
    fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.wordbird', 'project.json'),
      JSON.stringify({ name: 'Lighthouse', flavor: 'chapters-scenes' })
    )
    fs.mkdirSync(path.join(root, 'manuscript', 'chapter-one'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'manuscript', 'chapter-one', 'opening.md'),
      'The keeper counted the waves.\n'
    )
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)

    for (const format of ['epub', 'docx'] as const) {
      const outputPath = path.join(root, 'exports', `book.${format}`)
      const result = await structureService.compile(root, structure, { outputPath, format })
      expect(result.ok).toBe(true)
      const written = fs.readFileSync(outputPath)
      expect(written.subarray(0, 2).toString('latin1')).toBe('PK')
    }
    fs.rmSync(root, { recursive: true, force: true })
  }, 60000)
})
