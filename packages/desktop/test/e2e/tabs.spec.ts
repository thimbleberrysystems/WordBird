import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, closeElectron } from './helpers'

const tabSelector = '.tabs-container > li'

test.describe('Tab management', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Tab base\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('Initial document loads as a single tab in the tab list', async() => {
    // Tab bar may be hidden by default (v-show), but the DOM still contains the list.
    await page.waitForSelector('.tabs-container', { state: 'attached', timeout: 5000 })
    const count = await page.locator(tabSelector).count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Creating a new untitled tab grows the tab count', async() => {
    const before = await page.locator(tabSelector).count()
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '')
    await page.waitForFunction(
      ({ selector, prev }) => {
        return document.querySelectorAll(selector).length > prev
      },
      { selector: tabSelector, prev: before },
      { timeout: 5000 }
    )
    const after = await page.locator(tabSelector).count()
    expect(after).toBeGreaterThan(before)
  })

  test('Ctrl+Tab cycles to the next tab and wraps around', async() => {
    // Ensure at least three tabs so the cycle is observable.
    while ((await page.locator(tabSelector).count()) < 3) {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '')
      await page.waitForTimeout(200)
    }
    const activeTitle = (): Promise<string | null> =>
      page.locator('.tabs-container > li.active').getAttribute('data-id')

    const start = await activeTitle()
    // The Ctrl+Tab accelerator resolves to this channel (keybindings map
    // tabs.cycleForward → mt::tabs-cycle-right); driving the channel tests
    // everything below the OS-level key hook.
    await sendIpcToRenderer(app, 'mt::tabs-cycle-right')
    await expect.poll(activeTitle).not.toBe(start)

    // Cycling back returns to where we started.
    await sendIpcToRenderer(app, 'mt::tabs-cycle-left')
    await expect.poll(activeTitle).toBe(start)
  })

  test('Middle-click closes a tab (browser behavior)', async() => {
    const before = await page.locator(tabSelector).count()
    expect(before).toBeGreaterThanOrEqual(2)
    // Close a non-active untitled tab — saved/untouched, so no save veto.
    await page.locator(tabSelector).last().click({ button: 'middle' })
    await expect.poll(() => page.locator(tabSelector).count()).toBe(before - 1)
  })

  test('Opened-files sidebar section is off by default (tabs are the one list)', async() => {
    await expect(page.locator('.side-bar .opened-files')).toHaveCount(0)
  })
})
