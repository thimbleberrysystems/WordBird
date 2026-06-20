import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

test.describe('Ollama Bundled Settings', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('AI preferences panel shows Ollama (Bundled) option', async () => {
    // Open preferences via keyboard shortcut (Ctrl+,)
    await page.keyboard.press('Control+,')

    // Wait for preferences window
    const prefPage = await app.waitForEvent('window')

    // Navigate to AI tab
    await prefPage.click('text=AI')

    // Check that Ollama (Bundled) is in the provider dropdown
    const providerSelect = prefPage.locator('.pref-ai cur-select')
    await providerSelect.click()

    // Verify both Ollama options exist
    await expect(prefPage.locator('text=Ollama (User Hosted)')).toBeVisible()
    await expect(prefPage.locator('text=Ollama (Bundled)')).toBeVisible()
  })

  test('Ollama (Bundled) hides endpoint URL field', async () => {
    // Open preferences via keyboard shortcut
    await page.keyboard.press('Control+,')

    const prefPage = await app.waitForEvent('window')
    await prefPage.click('text=AI')

    // Select Ollama (Bundled)
    await prefPage.click('text=Ollama (Bundled)')

    // Endpoint URL field should be hidden for bundled
    const endpointField = prefPage.locator('text=Enter endpoint URL')
    await expect(endpointField).not.toBeVisible()
  })
})
