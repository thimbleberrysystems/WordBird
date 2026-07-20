import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, expectNoRendererErrors, closeElectron } from './helpers'
import {
  broadcastIpcToRenderer,
  mockEditProposal,
  readPreferences,
  sendPreloadIpc
} from './fixtures'

/**
 * P2 surfaces: the export-settings dialog renders (HTML export options),
 * preferences persist to the electron-store file, and the DETACHED
 * Biscuit window still receives and renders AI events.
 */

test.describe('Export dialog, preferences persistence, detached Biscuit', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n\nSome prose.\n', {
      suppressErrorDialog: true
    })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('the export dialog opens with page/theme options and closes', async() => {
    await sendIpcToRenderer(app, 'mt::show-export-dialog', 'styledHtml')
    // The Element Plus dialog teleports to <body> — target the dialog
    // itself, not the (always-hidden) component wrapper.
    const dialog = page.locator('.el-dialog', { hasText: /export/i })
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 10000 })
  })

  test('a preference toggle persists to the preferences store on disk', async() => {
    const readAutoSave = async(): Promise<boolean> =>
      (await readPreferences(app)).autoSave === true
    const before = await readAutoSave()
    // Flip autoSave through the SAME bridge the preferences window uses.
    await sendPreloadIpc(page, 'mt::set-user-preference', { autoSave: !before })
    await expect
      .poll(() => readAutoSave(), { timeout: 10000 })
      .toBe(!before)
  })

  test('the detached Biscuit window renders review events', async() => {
    // Detach into its own window (same flow biscuit-panel.spec covers).
    const before = app.windows().length
    await page.locator('.right-prompt .header-actions .header-action').first().click()
    await expect
      .poll(async() => app.windows().length, { timeout: 15000 })
      .toBe(before + 1)
    const detached = app
      .windows()
      .find((w) => w !== page && w.url().includes('type=biscuit'))!
    await detached.waitForSelector('.right-prompt--detached', { timeout: 15000 })

    // The window-level fallback (agentReviewFallback.ts) ingests
    // proposals in EVERY window — the detached queue renders them live.
    // (Before the fix, ingestion lived in editor.vue only and proposals
    // arriving while detached were invisible until reattach.)
    await broadcastIpcToRenderer(app, 'mt::ai:edit-proposal', mockEditProposal('det-1', filePath))
    await expect(detached.locator('.global-agent-review .review-item')).toHaveCount(1, {
      timeout: 10000
    })
    await broadcastIpcToRenderer(app, 'mt::ai:pending-edits-cleared', {})
    await expect(detached.locator('.global-agent-review')).toHaveCount(0)

    // Reattach for a clean teardown.
    await detached.close()
    await expect(page.locator('.right-prompt')).toBeVisible({ timeout: 10000 })

    await expectNoRendererErrors(app)
  })
})
