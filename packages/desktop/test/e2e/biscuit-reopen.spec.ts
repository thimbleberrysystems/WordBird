import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, expectNoRendererErrors, closeElectron } from './helpers'

/**
 * WRITER-REPORTED: "Biscuit auto-minimized to the right and refuses to undock
 * to the left."
 *
 * The collapse control lives inside RightPrompt (which unmounts when hidden),
 * and the sidebar's expand arrow — the other way back — is gated by
 * showSideBar, which defaults to hidden. So collapsing Biscuit with the
 * sidebar closed left no visible way to reopen it (only the View menu). The
 * always-available reopen handle on the app's right edge fixes that.
 */
test.describe('Biscuit reopen handle', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('collapsing Biscuit leaves a handle that brings it back', async() => {
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    // No reopen handle while Biscuit is open.
    await expect(page.locator('.biscuit-reopen-handle')).toHaveCount(0)

    // Collapse via Biscuit's own control.
    await page.locator('.toggle-biscuit-btn.collapse').click()
    await expect(page.locator('.right-prompt')).toHaveCount(0)

    // THE FIX: a reopen handle is now present, independent of the sidebar.
    const handle = page.locator('.biscuit-reopen-handle')
    await expect(handle).toBeVisible()

    await handle.click()
    await expect(page.locator('.right-prompt')).toBeVisible()
    // The handle retreats once Biscuit is back.
    await expect(page.locator('.biscuit-reopen-handle')).toHaveCount(0)
    await expectNoRendererErrors(app)
  })
})
