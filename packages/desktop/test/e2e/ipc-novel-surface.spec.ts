import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { expectNoRendererErrors } from './helpers'
import { findUnit, type UnitLike, useNovelProject } from './fixtures'

/**
 * IPC wiring round-trips through the REAL preload bridge — the layer no
 * unit test exercises (services beneath are unit-covered; the handler
 * registration, argument serialization, and guardRoot validation are
 * what this spec pins). Driven via page.evaluate(window.electron.…).
 */

test.describe('mt::novel / mt::ai IPC surface (bridge round-trips)', () => {
  const ctx = useNovelProject({ dailyStats: true })

  test('get-structure returns the tree for a real root, refuses a non-project', async() => {
    const good = await ctx.page.evaluate(
      (r) => window.electron.novel.getStructure(r),
      ctx.root
    ) as { ok: boolean; structure?: { units: unknown[] } }
    expect(good.ok).toBe(true)
    expect(good.structure?.units).toHaveLength(2)

    const bad = await ctx.page.evaluate(() =>
      window.electron.novel.getStructure('/definitely/not/a/project')
    ) as { ok: boolean }
    expect(bad.ok).toBe(false)
  })

  test('unit CRUD round-trips land on disk', async() => {
    const { page, root } = ctx
    const created = await page.evaluate(
      (r) =>
        window.electron.novel.createUnit(r, {
          parentId: 'chapter-one',
          type: 'scene',
          title: 'The Interrogation'
        }),
      root
    ) as { ok: boolean; structure?: { units: UnitLike[] } }
    expect(created.ok).toBe(true)
    const scene = findUnit(created.structure!.units, (u) => u.title === 'The Interrogation')
    expect(scene?.path).toContain('the-interrogation')
    expect(fs.existsSync(path.join(root, scene!.path!))).toBe(true)

    const updated = await page.evaluate(
      ({ r, id }) => window.electron.novel.updateUnit(r, id, { synopsis: 'Questions asked.' }),
      { r: root, id: scene!.id }
    ) as { ok: boolean }
    expect(updated.ok).toBe(true)
    expect(
      fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
    ).toContain('Questions asked.')

    const deleted = await page.evaluate(
      ({ r, id }) => window.electron.novel.deleteUnit(r, id, true),
      { r: root, id: scene!.id }
    ) as { ok: boolean }
    expect(deleted.ok).toBe(true)
    expect(fs.existsSync(path.join(root, scene!.path!))).toBe(false)
  })

  test('compile (md) assembles the manuscript and clamps output inside the project', async() => {
    const { page, root } = ctx
    const result = await page.evaluate(
      (r) =>
        window.electron.novel.compile(r, {
          format: 'md',
          // An ESCAPING path must be clamped back into <root>/exports/.
          outputPath: '/tmp/escape-attempt.md'
        }),
      root
    ) as { ok: boolean; content?: string; outputPath?: string }
    expect(result.ok).toBe(true)
    expect(result.content).toContain('rain-slick alley')
    expect(result.content).toContain('harbour lights')
    expect(result.outputPath).toContain(path.join(root, 'exports'))
    expect(fs.existsSync(result.outputPath!)).toBe(true)
  })

  test('entity-index and word-stats round-trip', async() => {
    const { page, root } = ctx
    const index = await page.evaluate(
      (r) => window.electron.novel.entityIndex(r),
      root
    ) as { entities: Array<{ name: string }> }
    expect(index.entities.some((e) => e.name.includes('Zara'))).toBe(true)

    const stats = await page.evaluate(
      (r) => window.electron.novel.wordStats(r),
      root
    ) as Array<{ date: string; written: number }>
    expect(Array.isArray(stats)).toBe(true)
    expect(stats.some((d) => d.written === 240)).toBe(true)
  })

  test('ai mode set/get round-trips through main', async() => {
    const page = ctx.page
    const set = await page.evaluate(() =>
      window.electron.ai.setMode('ask' as never)
    ) as { mode: string }
    expect(set.mode).toBe('ask')
    const got = await page.evaluate(() => window.electron.ai.getMode()) as { mode: string }
    expect(got.mode).toBe('ask')
    await page.evaluate(() => window.electron.ai.setMode('approvals' as never))
  })

  test('pending edits start empty; apply-edit refuses an unknown id', async() => {
    const page = ctx.page
    const pending = await page.evaluate(() =>
      window.electron.ai.getPendingEdits()
    ) as unknown[]
    expect(pending).toEqual([])

    const applied = await page.evaluate(() =>
      window.electron.ai.applyEdit('no-such-edit-id')
    ) as { ok: boolean }
    expect(applied.ok).toBe(false)
  })

  test('no renderer errors across the IPC round-trips', async() => {
    await expectNoRendererErrors(ctx.app)
  })
})
