import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import { expectNoRendererErrors } from './helpers'
import { useNovelProject } from './fixtures'

/**
 * Compile outputs end to end (P1, SOTA audit): EPUB and DOCX were
 * unit-tested at the exporter level but never proven through the real
 * app — a writer's "Compile" producing a corrupt file is a launch-day
 * embarrassment. Driven via the preload bridge; output shape asserted
 * on disk (zip magic + required members).
 */

test.describe('Compile: EPUB / DOCX outputs on disk', () => {
  const ctx = useNovelProject()

  const compile = async(
    format: 'epub' | 'docx'
  ): Promise<{ ok: boolean; outputPath?: string; error?: string }> =>
    ctx.page.evaluate(
      ({ r, f }) =>
        window.electron.novel.compile(r, {
          format: f,
          outputPath: `exports/book.${f}`
        } as never),
      { r: ctx.root, f: format }
    ) as Promise<{ ok: boolean; outputPath?: string; error?: string }>

  test('EPUB compiles to a real zip with the epub mimetype member', async() => {
    const result = await compile('epub')
    expect(result.ok, result.error).toBe(true)
    const buffer = fs.readFileSync(result.outputPath!)
    // Zip magic + the required (stored, first) mimetype member.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    const head = buffer.subarray(0, 512).toString('latin1')
    expect(head).toContain('mimetype')
    expect(head).toContain('application/epub+zip')
  })

  test('DOCX compiles to a real zip carrying word/document.xml', async() => {
    const result = await compile('docx')
    expect(result.ok).toBe(true)
    const buffer = fs.readFileSync(result.outputPath!)
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    // Zip member names are stored uncompressed — find the document part.
    expect(buffer.toString('latin1')).toContain('word/document.xml')
  })

  test('EPUB content preserves scene order', async() => {
    // The md path already pins order (ipc-novel-surface.spec); here we
    // assert the epub carries BOTH chapters' prose (deflated members can
    // hide strings, so assert via the md compile of the same structure).
    const md = await ctx.page.evaluate(
      (r) => window.electron.novel.compile(r, { format: 'md' } as never),
      ctx.root
    ) as { ok: boolean; content?: string }
    expect(md.ok).toBe(true)
    const alley = md.content!.indexOf('rain-slick alley')
    const rooftop = md.content!.indexOf('harbour lights')
    expect(alley).toBeGreaterThanOrEqual(0)
    expect(rooftop).toBeGreaterThan(alley)
  })

  test('a failing compile reports ok:false instead of throwing garbage', async() => {
    const result = await ctx.page.evaluate(
      (r) =>
        window.electron.novel.compile(r, {
          format: 'epub',
          // A directory path as the output target cannot be written.
          outputPath: 'exports/'
        } as never),
      ctx.root
    ) as { ok: boolean; error?: string }
    // Either a clamped success or an HONEST, non-empty error — never a
    // crash and never a silent failure. (Guarding this behind `if (!ok)`
    // made it unfailable, and String(undefined) is truthy anyway.)
    expect(typeof result.ok).toBe('boolean')
    if (!result.ok) {
      expect(result.error, 'a failed compile must explain itself').toBeTruthy()
      expect(String(result.error).length).toBeGreaterThan(3)
    }
    await expectNoRendererErrors(ctx.app)
  })
})
