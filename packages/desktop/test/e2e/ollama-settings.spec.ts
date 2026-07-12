import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

/**
 * The provider list is honest: exactly one Ollama entry ("Ollama (Local)")
 * — the retired "Ollama (Bundled)" promised a binary we never shipped and
 * must not resurface.
 */
test.describe('AI provider settings', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('the provider list has one honest Ollama entry and no Bundled', async() => {
    // Arm the listener BEFORE triggering — the settings window can appear
    // faster than a late waitForEvent registration. Open straight to the
    // AI page via the same channel the in-app buttons use.
    const windowPromise = app.waitForEvent('window')
    await page.evaluate(() => {
      ;(window as unknown as {
        electron: { ipcRenderer: { send: (c: string, ...a: unknown[]) => void } }
      }).electron.ipcRenderer.send('mt::open-setting-window', 'ai')
    })
    await windowPromise
    // The window event can race window identity — find the settings page
    // by URL among all open windows.
    const prefPage = await expect
      .poll(
        () =>
          app
            .windows()
            .find((w) => w.url().includes('settings')) ?? null,
        { timeout: 15000 }
      )
      .not.toBeNull()
      .then(() => app.windows().find((w) => w.url().includes('settings'))!)
    await prefPage.waitForLoadState('domcontentloaded')

    // Opening with category 'ai' lands DIRECTLY on the Biscuit pane (the
    // router used to drop every category except spelling onto General).
    await prefPage.waitForSelector('.pref-ai', { timeout: 15000 })
    await prefPage.locator('.pref-ai .pref-select-item .el-select').first().click()

    const options = prefPage.locator('.el-select-dropdown__item')
    await expect(options.filter({ hasText: 'Ollama (Local)' })).toHaveCount(1)
    await expect(options.filter({ hasText: 'Bundled' })).toHaveCount(0)
    await expect(options.filter({ hasText: 'User Hosted' })).toHaveCount(0)
  })
})
