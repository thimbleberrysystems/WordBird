import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { nextStatus } from '../../src/renderer/src/util/novelStatus'
import { expectNoRendererErrors, sendIpcToRenderer } from './helpers'
import {
  findUnitById,
  SCENES,
  switchView,
  useNovelProject,
  waitForWordCountSettle
} from './fixtures'

/**
 * The novel VIEWS — corkboard, outline, timeline, view switcher, project
 * home — rendered by the real app over a fully-seeded project. These are
 * the writer's primary planning surfaces and previously had ZERO coverage
 * at any layer (the live suite asserts the metadata, never the DOM).
 */

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Novel views (seeded project)', () => {
  const ctx = useNovelProject({ dailyStats: true })

  test.beforeAll(async() => {
    // Let the startup word-count refresh finish before driving views —
    // it rewrites structure.json (adding wordCount) and re-renders the
    // center pane; racing it makes view switches flaky.
    await waitForWordCountSettle(ctx.root)
  })

  test('project home renders for the seeded project', async() => {
    await expect(ctx.page.locator('.project-home')).toBeVisible({ timeout: 15000 })
  })

  test('corkboard renders one card per scene with synopsis and status', async() => {
    const page = ctx.page
    await switchView(page, 'Corkboard')
    const cards = page.locator('.corkboard .scene-card')
    await expect(cards).toHaveCount(SCENES.length)
    // Synopses render as editable textareas — assert the VALUE, not text.
    // Generous timeout: the corkboard paints as soon as the units arrive,
    // while the synopsis-carrying structure can land a beat later on a
    // loaded machine (observed flake, 2026-07-20).
    const alleyCard = cards.filter({ hasText: 'The Alley' })
    await expect(alleyCard.locator('textarea').first()).toHaveValue(
      'Zara finds the first clue.',
      { timeout: 15000 }
    )
    await expect(page.locator('.corkboard .status-dot').first()).toBeVisible()
  })

  test('thread filter narrows the card grid', async() => {
    const page = ctx.page
    await switchView(page, 'Corkboard')
    const threadFilter = page.locator('.corkboard .cork-filters .filter-select').first()
    await threadFilter.selectOption('Heist')
    await expect(page.locator('.corkboard .scene-card')).toHaveCount(2)
    await expect(page.locator('.corkboard')).toContainText('The Letter')
    await expect(page.locator('.corkboard')).not.toContainText('The Rooftop')
    await threadFilter.selectOption('')
    await expect(page.locator('.corkboard .scene-card')).toHaveCount(SCENES.length)
  })

  test('clicking a status dot cycles the status and persists to structure.json', async() => {
    const page = ctx.page
    await switchView(page, 'Corkboard')
    // Derive the expectation from the CURRENT status rather than assuming
    // the seed value: a retry of this group re-runs the click, and a
    // hardcoded 'revised' then fails against an already-cycled unit.
    const before = String(findUnitById(ctx.root, 'scene-alley').status ?? 'idea')
    const expected = nextStatus(before)
    const alleyCard = page.locator('.corkboard .scene-card', { hasText: 'The Alley' })
    await alleyCard.locator('.status-dot--clickable').click()
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-alley').status, { timeout: 10000 })
      .toBe(expected)
  })

  test('outline lists every scene; inline POV edit persists', async() => {
    const page = ctx.page
    await switchView(page, 'Outline')
    const rows = page.locator('.outline-view .scene-row')
    await expect(rows).toHaveCount(SCENES.length)

    const vaultRow = page.locator('.outline-view .scene-row', { hasText: 'The Vault' })
    const povInput = vaultRow.locator('.cell-input').first()
    await expect(povInput).toHaveValue('Finn')
    await povInput.fill('Zara')
    await povInput.blur()
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-vault').pov, { timeout: 10000 })
      .toBe('Zara')
  })

  test('outline status select persists', async() => {
    const vaultRow = ctx.page.locator('.outline-view .scene-row', { hasText: 'The Vault' })
    await vaultRow.locator('.cell-select').selectOption('draft')
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-vault').status, { timeout: 10000 })
      .toBe('draft')
  })

  test('the craft-columns toggle reveals Story Grid fields; editing goal persists', async() => {
    const page = ctx.page
    // Off by default — no craft cells visible.
    await expect(page.locator('.outline-view .cell-goal')).toHaveCount(0)
    await page.locator('.outline-view .craft-toggle-input').check()
    // The four craft columns appear, one input row per scene.
    await expect(page.locator('.outline-view .cell-goal')).toHaveCount(SCENES.length)
    await expect(page.locator('.outline-view .cell-value-shift').first()).toBeVisible()

    const alleyRow = page.locator('.outline-view .scene-row', { hasText: 'The Alley' })
    await alleyRow.locator('.cell-goal').fill('Zara wants the ledger')
    await alleyRow.locator('.cell-goal').blur()
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-alley').goal, { timeout: 10000 })
      .toBe('Zara wants the ledger')

    await alleyRow.locator('.cell-value-shift').fill('safe → hunted')
    await alleyRow.locator('.cell-value-shift').blur()
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-alley').valueShift, { timeout: 10000 })
      .toBe('safe → hunted')

    // Toggle off — columns collapse again.
    await page.locator('.outline-view .craft-toggle-input').uncheck()
    await expect(page.locator('.outline-view .cell-goal')).toHaveCount(0)
  })

  test('timeline: chronological toggle reorders by `when`', async() => {
    const page = ctx.page
    await switchView(page, 'Timeline')
    const view = page.locator('.timeline-view')
    await expect(view).toBeVisible()

    const titlesInOrder = async(): Promise<string[]> => {
      const entries = view.locator('.entry-title')
      const texts = await entries.allTextContents()
      return texts.map((t) => t.trim()).filter(Boolean)
    }

    // Narrative order = binder order: Alley, Letter, Vault, Rooftop.
    const narrative = await titlesInOrder()
    expect(narrative.indexOf('The Alley')).toBeLessThan(narrative.indexOf('The Letter'))

    // Chronological ("Story time"): The Letter (1953-11-02) predates The
    // Alley (1954-03-12), and The Rooftop (04-20) predates The Vault (05-01).
    await view.locator('.order-chip', { hasText: 'Story time' }).click()
    const chronological = await titlesInOrder()
    expect(chronological.indexOf('The Letter')).toBeLessThan(chronological.indexOf('The Alley'))
    expect(chronological.indexOf('The Rooftop')).toBeLessThan(chronological.indexOf('The Vault'))
  })

  test('timeline when-edit persists to structure.json', async() => {
    const view = ctx.page.locator('.timeline-view')
    // Back to narrative order for a stable target.
    await view.locator('.order-chip', { hasText: 'Narrative order' }).click()
    const rooftopEntry = view.locator('.timeline-entry', { hasText: 'The Rooftop' })
    const whenInput = rooftopEntry.locator('.when-input')
    await whenInput.fill('1954-06-01')
    await whenInput.blur()
    await expect
      .poll(() => findUnitById(ctx.root, 'scene-rooftop').when, { timeout: 10000 })
      .toBe('1954-06-01')
  })

  test('view switcher returns to the page view', async() => {
    const page = ctx.page
    await switchView(page, 'Page')
    await expect(page.locator('.timeline-view')).toHaveCount(0)
    // No file is open, so the page view falls back to the project home.
    await expect(page.locator('.project-home')).toBeVisible()
  })

  test('binder shows the word-target ring and daily history from seeded stats', async() => {
    const page = ctx.page
    if (!(await page.locator('.side-bar').isVisible())) {
      const { clickMenuById } = await import('./helpers')
      await clickMenuById(ctx.app, 'sideBarMenuItem')
    }
    await expect(page.locator('.binder')).toBeVisible({ timeout: 15000 })
    // Today's counter reflects the LIVE manuscript total minus the seeded
    // day-start (0) — always non-negative, never the "negative" style.
    const today = page.locator('.binder .binder-today')
    await expect(today).toBeVisible()
    await expect(today).not.toHaveClass(/negative/)
    // The 14-day history renders the seeded 240-word days.
    const bars = page.locator('.binder .binder-history [title*="240"]')
    expect(await bars.count()).toBeGreaterThan(0)
  })

  test('no renderer errors across all view interactions', async() => {
    await expectNoRendererErrors(ctx.app)
  })
})

/**
 * THE AGENT→VIEW LOOP. The live suite proves an agent's update_unit_meta
 * lands on disk; the tests above prove the views render seeded data. What
 * neither covers is the join: when Biscuit changes metadata, do the
 * writer's views actually update — without a reload?
 *
 * Simulated exactly as main does it: rewrite structure.json, then broadcast
 * mt::novel:project-changed (what the tool service emits after a
 * project-mutating tool).
 */
test.describe('Views refresh when an agent changes the project', () => {
  const ctx = useNovelProject()

  /** Patch one unit's metadata on disk, the way update_unit_meta would. */
  const patchUnit = (id: string, patch: Record<string, unknown>): void => {
    const file = path.join(ctx.root, '.wordbird', 'structure.json')
    // Tolerate a TORN READ: main rewrites this file in place, so a raw
    // JSON.parse can catch it truncated (the same trap readStructure fixes).
    let structure: { units: Array<Record<string, unknown>> } | null = null
    for (let attempt = 0; attempt < 10 && !structure; attempt += 1) {
      try {
        structure = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch {
        const until = Date.now() + 20
        while (Date.now() < until) { /* spin */ }
      }
    }
    expect(structure, 'structure.json unreadable').not.toBeNull()
    const walk = (units: Array<Record<string, unknown>>): boolean => {
      for (const unit of units) {
        if (unit.id === id) {
          Object.assign(unit, patch)
          return true
        }
        if (Array.isArray(unit.children) && walk(unit.children as Array<Record<string, unknown>>)) {
          return true
        }
      }
      return false
    }
    expect(walk(structure!.units), `unit ${id} not found`).toBe(true)
    fs.writeFileSync(file, JSON.stringify(structure, null, 2))
  }

  test('corkboard picks up an agent-written synopsis and status', async() => {
    const page = ctx.page
    await switchView(page, 'Corkboard')
    const alleyCard = page.locator('.corkboard .scene-card', { hasText: 'The Alley' })
    await expect(alleyCard).toBeVisible({ timeout: 10000 })

    patchUnit('scene-alley', {
      synopsis: 'Biscuit rewrote this synopsis.',
      status: 'revised'
    })
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    // No reload, no manual refresh — the card must show the new text.
    await expect(alleyCard.locator('textarea').first()).toHaveValue(
      'Biscuit rewrote this synopsis.',
      { timeout: 15000 }
    )
  })

  test('outline picks up agent-written POV and craft fields', async() => {
    const page = ctx.page
    await switchView(page, 'Outline')
    patchUnit('scene-vault', { pov: 'Ilsabet', goal: 'Crack the vault before dawn' })
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    const vaultRow = page.locator('.outline-view .scene-row', { hasText: 'The Vault' })
    await expect(vaultRow.locator('.cell-input').first()).toHaveValue('Ilsabet', { timeout: 15000 })
    // Craft columns render the same refreshed data.
    await page.locator('.outline-view .craft-toggle-input').check()
    await expect(vaultRow.locator('.cell-goal')).toHaveValue('Crack the vault before dawn')
    await page.locator('.outline-view .craft-toggle-input').uncheck()
  })

  test('timeline picks up an agent-written story time', async() => {
    const page = ctx.page
    await switchView(page, 'Timeline')
    patchUnit('scene-rooftop', { when: '1955-01-09' })
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    const rooftop = page.locator('.timeline-view .timeline-entry', { hasText: 'The Rooftop' })
    await expect(rooftop.locator('.when-input')).toHaveValue('1955-01-09', { timeout: 15000 })
  })

  test('a NEW unit added by an agent appears in the binder without a reload', async() => {
    const page = ctx.page
    await switchView(page, 'Page')
    const file = path.join(ctx.root, '.wordbird', 'structure.json')
    const structure = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      units: Array<Record<string, unknown>>
    }
    const chapter = structure.units[0]
    const scenePath = 'manuscript/chapter-one/the-cistern.md'
    fs.mkdirSync(path.dirname(path.join(ctx.root, scenePath)), { recursive: true })
    fs.writeFileSync(path.join(ctx.root, scenePath), 'The cistern breathed cold.\n')
    ;(chapter.children as Array<Record<string, unknown>>).push({
      id: 'scene-cistern',
      type: 'scene',
      title: 'The Cistern',
      path: scenePath,
      status: 'draft'
    })
    fs.writeFileSync(file, JSON.stringify(structure, null, 2))
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    await expect(page.locator('.binder')).toContainText('The Cistern', { timeout: 15000 })
    await expectNoRendererErrors(ctx.app)
  })
})
