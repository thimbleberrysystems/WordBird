import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  closeElectron,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer,
  typeIntoEditor,
  waitForMenuReady
} from './helpers'
import { sendPreloadIpc, switchView, useNovelProject } from './fixtures'

/**
 * P2 additions from the SOTA audit: timeline thread lanes, BEHAVIORAL
 * focus/typewriter assertions (view-modes.spec only checks the CSS
 * class), i18n language switching, and the context-ring compaction
 * levels. Mocked/deterministic — zero tokens.
 */

test.describe('Timeline thread lanes (seeded threads)', () => {
  const ctx = useNovelProject()

  test('the thread filter narrows the timeline to one subplot lane', async() => {
    const page = ctx.page
    await switchView(page, 'Timeline')
    const view = page.locator('.timeline-view')
    await expect(view).toBeVisible({ timeout: 10000 })
    // All four seeded scenes render before filtering.
    await expect(view.locator('.timeline-entry')).toHaveCount(4)

    await view.locator('.thread-select').selectOption('Heist')
    await expect(view.locator('.timeline-entry')).toHaveCount(2)
    await expect(view).toContainText('The Letter')
    await expect(view).toContainText('The Vault')
    await expect(view).not.toContainText('The Rooftop')

    await view.locator('.thread-select').selectOption('')
    await expect(view.locator('.timeline-entry')).toHaveCount(4)
    await expectNoRendererErrors(ctx.app)
  })
})

test.describe('Focus & typewriter modes (behavioral)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph number ${i + 1}.`).join(
      '\n\n'
    )
    const launched = await launchWithMarkdown(`# Long doc\n\n${paragraphs}\n`, {
      suppressErrorDialog: true
    })
    app = launched.app
    page = launched.page
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('focus mode visually dims paragraphs away from the caret', async() => {
    await typeIntoEditor(page, ' Focus target sentence.')
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-wrapper, .editor-component').first()).toHaveClass(/focus/)
    // BEHAVIOR, not just the class: at least one distant paragraph must be
    // visually de-emphasized relative to full opacity. Polled — the dimming
    // rides a CSS transition, so a one-shot read races it.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('.editor-component p')).some((p) => {
              const opacity = Number(getComputedStyle(p).opacity)
              return opacity > 0 && opacity < 0.99
            })
          ),
        { timeout: 10000 }
      )
      .toBe(true)
    await clickMenuById(app, 'focusModeMenuItem')
  })

  test('typewriter mode keeps the active line vertically centered while typing', async() => {
    await clickMenuById(app, 'typewriterModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/typewriter/)

    // Get DEEP into the document first so typewriter scrolling engages
    // (near the top there is nothing to scroll under the caret).
    await typeIntoEditor(page, '\n\n' + Array.from({ length: 8 }, (_, i) => `Warmup ${i}.`).join('\n\n'))
    const lineCenter = async(): Promise<number> =>
      page.evaluate(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const rect = selection.getRangeAt(0).getBoundingClientRect()
        return rect.top + rect.height / 2
      })
    // The scroll container is Muya's own element, not a fixed selector —
    // walk up from the editor to the first genuinely scrollable ancestor.
    // Returns [scrollTop, scrollableHeight] so both reads share one walk.
    const scrollState = async(): Promise<[number, number]> =>
      page.evaluate(() => {
        let node: HTMLElement | null = document.querySelector('.editor-component')
        while (node) {
          if (node.scrollHeight - node.clientHeight > 4) {
            return [node.scrollTop, node.scrollHeight - node.clientHeight] as [number, number]
          }
          node = node.parentElement
        }
        const root = document.scrollingElement as HTMLElement | null
        return [root?.scrollTop ?? 0, (root?.scrollHeight ?? 0) - (root?.clientHeight ?? 0)] as [
          number,
          number
        ]
      })
    const scrollTop = async(): Promise<number> => (await scrollState())[0]

    // Settle on the SCROLL POSITION, not the caret. Typewriter scrolling is
    // animated (animatedScrollTo, ~300ms); polling the caret for stability
    // returns EARLY — before the animation starts, two consecutive caret
    // reads are identical, so the caret gets measured mid-flight. Waiting
    // for scrollTop to stop moving is what actually marks "animation done".
    const settledCenter = async(): Promise<number> => {
      let previous = Number.NaN
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await page.waitForTimeout(100)
        const current = await scrollTop()
        if (!Number.isNaN(previous) && current === previous) break
        previous = current
      }
      return lineCenter()
    }

    // PRECONDITION: typewriter scrolling can only engage on a document that
    // is actually taller than its container. Assert it rather than letting a
    // too-short document silently turn the check below into a no-op.
    const scrollable = (await scrollState())[1]
    expect(scrollable, 'document is not tall enough to exercise typewriter scrolling').toBeGreaterThan(0)

    const first = await settledCenter()
    const scrollBefore = await scrollTop()
    await typeIntoEditor(page, '\n\nTypewriter line two.\n\nTypewriter line three.')
    const later = await settledCenter()

    // THE CONTRACT, both halves: the container scrolls (the DOCUMENT moves
    // under the caret) AND the caret therefore stays in its vertical band.
    // A caret that walked freely would have moved 4 paragraphs (~200px+).
    expect(first).toBeGreaterThan(0)
    await expect
      .poll(async() => (await scrollTop()) > scrollBefore, { timeout: 10000 })
      .toBe(true)
    expect(Math.abs(later - first)).toBeLessThan(160)
    await clickMenuById(app, 'typewriterModeMenuItem')
    await expectNoRendererErrors(app)
  })
})

test.describe('i18n: switching language re-renders real UI text', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('French locale reaches the application menu; English restores', async() => {
    const fileMenuLabel = async(): Promise<string> =>
      app.evaluate(({ Menu }) => {
        const menu = Menu.getApplicationMenu()
        const labels = (menu?.items ?? []).map((i) => i.label)
        return labels.join('|')
      })
    expect(await fileMenuLabel()).toMatch(/File/)

    await sendPreloadIpc(page, 'mt::set-user-preference', { language: 'fr' })
    await expect
      .poll(async() => fileMenuLabel(), { timeout: 15000 })
      .toMatch(/Fichier|Édition|Affichage/)

    await sendPreloadIpc(page, 'mt::set-user-preference', { language: 'en' })
    await expect.poll(async() => fileMenuLabel(), { timeout: 15000 }).toMatch(/File/)
    await expectNoRendererErrors(app)
  })
})

test.describe('Context ring compaction levels (mocked usage)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('the ring escalates its level as usage approaches the budget', async() => {
    const usage = (used: number): Record<string, unknown> => ({
      usedTokens: used,
      budgetTokens: 100_000,
      contextWindow: 200_000,
      usedChars: used * 4,
      budgetChars: 400_000,
      // The ring's level classes key off this ratio.
      ratio: used / 100_000
    })
    await sendIpcToRenderer(app, 'mt::ai:context-usage', usage(10_000))
    const ringFill = page.locator('.context-ring .ring-fill')
    await expect(ringFill).toBeVisible()
    const calmClass = (await ringFill.getAttribute('class')) ?? ''

    await sendIpcToRenderer(app, 'mt::ai:context-usage', usage(95_000))
    await expect
      .poll(async() => (await ringFill.getAttribute('class')) ?? '', { timeout: 5000 })
      .not.toBe(calmClass)
    await expectNoRendererErrors(app)
  })
})
