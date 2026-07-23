import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, closeElectron, expectNoRendererErrors } from './helpers'
import { sendPreloadIpc } from './fixtures'

/**
 * The connect (AI settings) window surfaces the model's DETECTED context /
 * max-output limits and the Anthropic 1M-context opt-in. The resolution logic
 * is unit-tested in model-limits.spec; this proves the panel renders those
 * numbers and controls end to end, with the three AI IPCs mocked so no real
 * provider is hit.
 */

const patchAiHandlers = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('mt::ai:connect')
    ipcMain.handle('mt::ai:connect', () => undefined)
    ipcMain.removeHandler('mt::ai:fetch-models')
    ipcMain.handle('mt::ai:fetch-models', () => ['claude-opus-4-6'])
    ipcMain.removeHandler('mt::ai:model-limits')
    ipcMain.handle('mt::ai:model-limits', () => ({
      contextWindow: 1000000,
      maxOutput: 64000,
      source: 'api'
    }))
  })
}

test.describe('AI settings: detected limits + 1M opt-in', () => {
  let app: ElectronApplication
  let page: Page
  let prefPage: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await patchAiHandlers(app)

    const windowPromise = app.waitForEvent('window')
    await sendPreloadIpc(page, 'mt::open-setting-window', 'ai')
    await windowPromise
    await expect
      .poll(() => app.windows().find((w) => w.url().includes('settings')) ?? null, { timeout: 15000 })
      .not.toBeNull()
    prefPage = app.windows().find((w) => w.url().includes('settings'))!
    await prefPage.waitForLoadState('domcontentloaded')
    await prefPage.waitForSelector('.pref-ai', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('selecting Anthropic + connecting shows detected limits and the 1M toggle', async() => {
    // Choose the Anthropic provider via the first el-select (provider row).
    await prefPage.locator('.pref-ai .el-select').first().click()
    await prefPage.locator('.el-select-dropdown__item', { hasText: 'Anthropic' }).first().click()

    // Enter any key so the connect button is meaningful (handler is mocked).
    const keyInput = prefPage.locator('.pref-ai .el-input__inner').first()
    await keyInput.fill('sk-test-key')

    // Connect (mocked → success), which triggers the model fetch.
    await prefPage.getByRole('button', { name: /connect/i }).first().click()

    // The model-select block appears; pick the model.
    await prefPage.waitForSelector('.model-select-container', { timeout: 15000 })
    const modelSelect = prefPage.locator('.model-select-container .el-select').first()
    await modelSelect.click()
    await prefPage.locator('.el-select-dropdown__item', { hasText: 'claude-opus-4-6' }).first().click()

    // Detected limits render with the compact numbers from the mocked IPC.
    const limits = prefPage.locator('.model-limits')
    await expect(limits).toBeVisible({ timeout: 10000 })
    await expect(limits).toContainText('1M')
    await expect(limits).toContainText('64k')

    // The Anthropic-only 1M opt-in and the override field are present.
    await expect(prefPage.locator('.beta-toggle')).toBeVisible()
    await expect(prefPage.locator('.model-limits')).toContainText(/detected/i)
    await expectNoRendererErrors(app)
  })
})
