import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, closeElectron, expectNoRendererErrors } from './helpers'
import { readPreferences, sendPreloadIpc } from './fixtures'

/**
 * Preferences surface (P1, SOTA audit): the settings WINDOW was only
 * tested for the AI provider list; nothing proved that flipping a real
 * control persists to the electron-store file. One representative
 * control per area: General autoSave (bool), AI temperature (number).
 */

test.describe('Preferences window: controls persist to disk', () => {
  let app: ElectronApplication
  let page: Page
  let prefPage: Page

  const prefsOnDisk = async(): Promise<Record<string, unknown>> => readPreferences(app)

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page

    const windowPromise = app.waitForEvent('window')
    await sendPreloadIpc(page, 'mt::open-setting-window', 'general')
    await windowPromise
    await expect
      .poll(() => app.windows().find((w) => w.url().includes('settings')) ?? null, {
        timeout: 15000
      })
      .not.toBeNull()
    prefPage = app.windows().find((w) => w.url().includes('settings'))!
    await prefPage.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('General: toggling autoSave persists to preferences.json', async() => {
    const before = (await prefsOnDisk()).autoSave === true
    const autoSaveSwitch = prefPage
      .locator('.pref-general .el-switch, .pref-bool-item .el-switch')
      .first()
    await expect(autoSaveSwitch).toBeVisible({ timeout: 15000 })
    await autoSaveSwitch.click()
    await expect
      .poll(async() => (await prefsOnDisk()).autoSave, { timeout: 10000 })
      .toBe(!before)
    // Flip back — leave the store as found.
    await autoSaveSwitch.click()
    await expect
      .poll(async() => (await prefsOnDisk()).autoSave, { timeout: 10000 })
      .toBe(before)
  })

  test('AI: the temperature slider exists and reports a numeric value', async() => {
    // Navigate to the AI pane within the same window.
    await prefPage.evaluate(() => {
      window.location.hash = window.location.hash.replace(/general|spelling|editor/, 'ai')
    })
    const sidebarAi = prefPage.locator('.side-bar li, .pref-sidebar li', { hasText: /ai|biscuit/i })
    if (await sidebarAi.count()) await sidebarAi.first().click()
    await prefPage.waitForSelector('.pref-ai', { timeout: 15000 })
    const slider = prefPage.locator('.pref-ai .el-slider').first()
    await expect(slider).toBeVisible()
    const now = await slider.getAttribute('aria-valuenow').catch(() => null)
    const inner = slider.locator('[role="slider"]')
    const value = now ?? (await inner.getAttribute('aria-valuenow'))
    // The value must EXIST — a missing attribute used to pass, because
    // Number(null) is 0 and 0 satisfied the 0..2 bounds below.
    expect(value, 'temperature slider exposes no aria-valuenow').not.toBeNull()
    expect(Number.isNaN(Number(value))).toBe(false)
    expect(Number(value)).toBeGreaterThanOrEqual(0)
    expect(Number(value)).toBeLessThanOrEqual(2)

    await expectNoRendererErrors(app)
  })
})
