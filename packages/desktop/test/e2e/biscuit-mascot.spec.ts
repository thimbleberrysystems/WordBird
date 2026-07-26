import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { closeElectron, expectNoRendererErrors, launchWithMarkdown, sendIpcToRenderer } from './helpers'

/**
 * The Biscuit mascot, end to end through the real UI wiring (mocked AI):
 * a breathing character keeps the writer company. It must (1) greet from the
 * welcome card before any run, (2) switch to its busy animation with a
 * rotating caption while a run is live, (3) react to a click, and (4) vanish
 * when the run ends. This is companionship, not status — the factual detail
 * lives in the Agents tab.
 *
 * Pattern (see stop-controls.spec): `sending` is renderer state around a
 * PENDING mt::ai:send-message invoke, so the spec holds main's handler open
 * to keep the panel "sending", then releases it.
 */

const holdSendOpen = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const g = global as Record<string, unknown>
    ipcMain.removeHandler('mt::ai:send-message')
    ipcMain.handle('mt::ai:send-message', () => {
      // Keep a live main heartbeat so the liveness watchdog stays quiet.
      const iv = setInterval(() => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('mt::ai:run-heartbeat', { at: Date.now() })
        }
      }, 200)
      return new Promise((resolve) => {
        g.__releaseSend = () => {
          clearInterval(iv)
          resolve({ content: 'ok (released by spec)', model: 'mock' })
        }
      })
    })
  })
}

const connectedState = (): Record<string, unknown> => ({
  connected: true,
  provider: 'claude-code',
  model: 'sonnet',
  capabilities: { perAgentControl: false, boundaryPause: false, manualCompact: false }
})

test.describe('Biscuit mascot (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await holdSendOpen(app)
    await sendIpcToRenderer(app, 'mt::ai:connection-state', connectedState())
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('greets from the welcome card before any run', async() => {
    // Fresh panel: no messages, not sending → the welcome mascot is present.
    // The `welcome-mascot` class merges onto the mascot's own root element, so
    // it IS the `.mascot` (not a wrapper around it).
    await expect(page.locator('.right-prompt .biscuit-welcome .welcome-mascot.mascot')).toBeVisible({
      timeout: 10000
    })
    // Its accessible label is set (role=img + aria-label).
    const svg = page.locator('.right-prompt .welcome-mascot svg[role="img"]')
    await expect(svg).toHaveAttribute('aria-label', /.+/)
  })

  test('switches to the busy animation with a rotating caption while a run is live', async() => {
    await page.locator('.right-prompt textarea').fill('Write something long.')
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()

    // Sending: the working mascot appears in its busy mood…
    const working = page.locator('.right-prompt .biscuit-working')
    await expect(working).toBeVisible({ timeout: 10000 })
    await expect(working.locator('.mascot.mascot--busy')).toBeVisible()
    // …with a playful caption underneath.
    await expect(working.locator('.biscuit-working__caption')).not.toBeEmpty()
  })

  test('reacts to a click', async() => {
    // Poke the working mascot → the transient react mood (nibble + quip bubble).
    await page.locator('.right-prompt .biscuit-working .mascot').click()
    await expect(page.locator('.right-prompt .biscuit-working .mascot.mascot--react')).toBeVisible({
      timeout: 2000
    })
  })

  test('vanishes when the run ends (after a brief celebration)', async() => {
    // The finished run does a ~1.2s celebratory hop before bowing out — that
    // transient is pinned deterministically in biscuit-mood.spec (fake timers);
    // here we assert the robust lifecycle end state: the indicator is gone.
    await app.evaluate(() => {
      const release = (global as Record<string, unknown>).__releaseSend as (() => void) | undefined
      release?.()
    })
    await expect(page.locator('.right-prompt .biscuit-working')).toHaveCount(0, { timeout: 10000 })
    await expectNoRendererErrors(app)
  })
})
