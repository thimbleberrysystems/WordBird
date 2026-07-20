import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ensureSidebar, expectNoRendererErrors } from './helpers'
import {
  allUnitIds,
  childUnitIds,
  readStructure,
  SCENES,
  switchView,
  useNovelProject,
  waitForWordCountSettle
} from './fixtures'

/**
 * P0 (SOTA audit 2026-07): drag-reorder is how writers restructure the
 * book, and the renderer dnd→IPC→persist path had ZERO coverage — a
 * regression here silently scrambles or loses structure. These tests
 * dispatch synthetic DragEvents (constructed DataTransfer + zone-precise
 * clientY) because Playwright's pointer-driven dragTo cannot reliably
 * target the before/after/inside zones binderNode computes from cursor
 * position.
 *
 * Invariants after EVERY drag: all seeded files still exist on disk,
 * every unit id still present exactly once, order matches the drop.
 */

interface DragOptions {
  sourceText: string
  targetText: string
  zone: 'before' | 'after' | 'inside'
  container?: string
}

const dragInBinder = async(page: Page, options: DragOptions): Promise<void> => {
  await page.evaluate(({ sourceText, targetText, zone, container }) => {
    const scope = document.querySelector(container ?? '.binder')
    if (!scope) throw new Error('drag scope not found')
    const rows = Array.from(scope.querySelectorAll('[draggable="true"]'))
    const rowFor = (text: string): HTMLElement => {
      const row = rows.find((r) => (r.textContent ?? '').includes(text))
      if (!row) throw new Error(`draggable row not found: ${text}`)
      return row as HTMLElement
    }
    const source = rowFor(sourceText)
    const target = rowFor(targetText)
    const dataTransfer = new DataTransfer()
    source.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
    )
    const rect = target.getBoundingClientRect()
    const clientY =
      zone === 'before'
        ? rect.top + 1
        : zone === 'after'
          ? rect.bottom - 1
          : rect.top + rect.height / 2
    const clientX = rect.left + 10
    target.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY })
    )
    target.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY })
    )
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
  }, { ...options })
}

/** The invariant every drag must preserve: nothing lost, nothing doubled. */
const expectStructureIntact = (root: string): void => {
  const ids = allUnitIds(readStructure(root).units)
  expect(new Set(ids).size).toBe(ids.length)
  for (const scene of SCENES) {
    expect(ids).toContain(scene.id)
    expect(fs.existsSync(path.join(root, scene.file))).toBe(true)
  }
}

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Binder & corkboard drag-reorder (P0: structure integrity)', () => {
  const ctx = useNovelProject()

  test.beforeAll(async() => {
    // Let the startup word-count refresh settle before mutating structure.
    await waitForWordCountSettle(ctx.root)
    await ensureSidebar(ctx.app, ctx.page)
    await expect(ctx.page.locator('.binder')).toContainText('The Alley', { timeout: 15000 })
  })

  test('reorder within a chapter persists the new order', async() => {
    const root = ctx.root
    expect(childUnitIds(root, 'chapter-one')).toEqual(['scene-alley', 'scene-letter'])
    await dragInBinder(ctx.page, {
      sourceText: 'The Letter',
      targetText: 'The Alley',
      zone: 'before'
    })
    await expect
      .poll(() => childUnitIds(root, 'chapter-one'), { timeout: 10000 })
      .toEqual(['scene-letter', 'scene-alley'])
    expectStructureIntact(root)
  })

  test('cross-chapter move re-parents the scene; the backing file survives untouched', async() => {
    const root = ctx.root
    const before = fs.readFileSync(path.join(root, SCENES[2].file), 'utf8')
    // Drop The Vault INSIDE Chapter One (containers take mid-height drops).
    await dragInBinder(ctx.page, {
      sourceText: 'The Vault',
      targetText: 'Chapter One',
      zone: 'inside'
    })
    await expect
      .poll(() => childUnitIds(root, 'chapter-one'), { timeout: 10000 })
      .toContain('scene-vault')
    expect(childUnitIds(root, 'chapter-two')).not.toContain('scene-vault')
    // Order = source of truth in structure.json; the FILE does not move.
    expect(fs.readFileSync(path.join(root, SCENES[2].file), 'utf8')).toBe(before)
    expectStructureIntact(root)
  })

  test('a chapter cannot be dropped into its own subtree (guarded no-op)', async() => {
    const root = ctx.root
    const before = JSON.stringify(readStructure(root).units)
    await dragInBinder(ctx.page, {
      sourceText: 'Chapter One',
      targetText: 'The Alley',
      zone: 'inside'
    })
    // The guard rejects self-subtree moves; structure must be unchanged.
    await ctx.page.waitForTimeout(500)
    expect(JSON.stringify(readStructure(root).units)).toBe(before)
    expectStructureIntact(root)
  })

  test('a drop with no drag payload is a no-op', async() => {
    const { page, root } = ctx
    const before = JSON.stringify(readStructure(root).units)
    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('.binder [draggable="true"]')).find((r) =>
        (r.textContent ?? '').includes('The Rooftop')
      ) as HTMLElement
      const dataTransfer = new DataTransfer() // empty — no x-wordbird-unit
      const rect = row.getBoundingClientRect()
      row.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientY: rect.top + 1,
          clientX: rect.left + 5
        })
      )
    })
    await page.waitForTimeout(300)
    expect(JSON.stringify(readStructure(root).units)).toBe(before)
  })

  test('corkboard card drag re-sections a scene and syncs the binder', async() => {
    const { page, root } = ctx
    await switchView(page, 'Corkboard')
    await page.waitForSelector('.corkboard .scene-card', { timeout: 10000 })

    // Drag The Rooftop card onto Chapter One's card grid.
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.corkboard .scene-card'))
      const source = cards.find((c) => (c.textContent ?? '').includes('The Rooftop')) as HTMLElement
      if (!source) throw new Error('rooftop card not found')
      const sections = Array.from(document.querySelectorAll('.corkboard .cork-section'))
      const targetSection = sections.find((s) =>
        (s.textContent ?? '').includes('Chapter One')
      ) as HTMLElement
      const grid = targetSection.querySelector('.card-grid') as HTMLElement
      const dataTransfer = new DataTransfer()
      source.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
      )
      const rect = grid.getBoundingClientRect()
      grid.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: rect.left + rect.width - 5,
          clientY: rect.top + 10
        })
      )
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
    })

    await expect
      .poll(() => childUnitIds(root, 'chapter-one'), { timeout: 10000 })
      .toContain('scene-rooftop')
    expectStructureIntact(root)

    // The binder mirrors the corkboard move (linked-triad contract).
    // POLLED: the binder re-renders asynchronously after the structure
    // write, so a single textContent read races it under load.
    await switchView(page, 'Page')
    await expect
      .poll(
        async() => {
          const text = (await page.locator('.binder').textContent()) ?? ''
          const chapterOne = text.indexOf('Chapter One')
          const chapterTwo = text.indexOf('Chapter Two')
          const rooftop = text.indexOf('The Rooftop')
          return chapterOne >= 0 && rooftop > chapterOne && rooftop < chapterTwo
        },
        { timeout: 10000 }
      )
      .toBe(true)
  })

  test('no renderer errors across all drag operations', async() => {
    await expectNoRendererErrors(ctx.app)
  })
})
