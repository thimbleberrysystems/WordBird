import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { closeElectron, ensureSidebar, expectNoRendererErrors, launchWithMarkdown, sendIpcToRenderer } from './helpers'

/**
 * The stop controls, end to end through the real UI wiring (mocked AI):
 * the Stop button that replaces Send while a run is live must invoke
 * mt::ai:abort; the agent tree's per-agent ✕ must invoke
 * mt::ai:cancel-agent with the right id; the root ✕ stops everything;
 * and managed runtimes (perAgentControl: false) hide per-agent controls
 * instead of offering silent no-ops. Born from the live "Stop doesn't
 * stop" report (2026-07-18): the runtime abort is pinned in
 * agent-sdk-runner.spec + the live suite — THIS spec pins that the
 * buttons the writer actually clicks reach those channels at all.
 *
 * Pattern notes: `sending` (Steer/Stop swap) is renderer state around a
 * PENDING mt::ai:send-message invoke, so the spec replaces main's
 * handler with one it can hold open and release; invoke-style channels
 * cannot be probed with ipcMain.on, so mt::ai:abort/cancel-agent are
 * also re-registered to record their calls.
 */

const patchMainHandlers = async(
  app: ElectronApplication,
  opts: { heartbeat?: boolean } = {}
): Promise<void> => {
  await app.evaluate(({ ipcMain, BrowserWindow }, { heartbeat }) => {
    const g = global as Record<string, unknown>
    g.__stopCalls = 0
    g.__cancelledAgents = []
    ipcMain.removeHandler('mt::ai:send-message')
    ipcMain.handle('mt::ai:send-message', () => {
      // Held open until the spec releases it — while pending, the
      // renderer is "sending" and shows Steer + Stop. A live main keeps
      // heartbeating while it works; a "dead" main (heartbeat:false) does
      // not, which is exactly what the renderer's liveness timer detects.
      let iv: ReturnType<typeof setInterval> | null = null
      if (heartbeat) {
        iv = setInterval(() => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed()) w.webContents.send('mt::ai:run-heartbeat', { at: Date.now() })
          }
        }, 200)
      }
      return new Promise((resolve) => {
        g.__releaseSend = () => {
          if (iv) clearInterval(iv)
          resolve({ content: 'ok (released by spec)', model: 'mock' })
        }
      })
    })
    ipcMain.removeHandler('mt::ai:abort')
    ipcMain.handle('mt::ai:abort', () => {
      g.__stopCalls = (g.__stopCalls as number) + 1
      return { success: true }
    })
    ipcMain.removeHandler('mt::ai:cancel-agent')
    ipcMain.handle('mt::ai:cancel-agent', (_e, agentId) => {
      ;(g.__cancelledAgents as unknown[]).push(agentId)
      return { ok: true }
    })
  }, { heartbeat: opts.heartbeat ?? true })
}

const readMain = async <T>(app: ElectronApplication, key: string): Promise<T> =>
  app.evaluate((_electron, k) => (global as Record<string, unknown>)[k] as never, key)

const connectedState = (perAgentControl: boolean): Record<string, unknown> => ({
  connected: true,
  provider: 'claude-code',
  model: 'sonnet',
  capabilities: { perAgentControl, boundaryPause: perAgentControl, manualCompact: false }
})

const runningAgent = (agentId: string): Record<string, unknown> => ({
  agentId,
  role: 'researcher',
  task: 'Research ancient Elam',
  status: 'running',
  startedAt: Date.now(),
  toolCalls: 2,
  paused: false,
  recentTools: ['wiki_read — {"title":"Elam"}']
})

test.describe('Stop controls (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await patchMainHandlers(app)
    await sendIpcToRenderer(app, 'mt::ai:connection-state', connectedState(true))
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('while a run is live, Send swaps to Steer + Stop; Stop invokes mt::ai:abort', async() => {
    const input = page.locator('.right-prompt textarea')
    await input.fill('Write something long.')
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()

    // The roles swap: STOP takes the prominent rightmost slot.
    const stopButton = page.locator('.right-prompt .prompt-input-actions button', {
      hasText: 'Stop'
    })
    await expect(stopButton).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Steer' })
    ).toBeVisible()

    await stopButton.click()
    await expect.poll(() => readMain<number>(app, '__stopCalls'), { timeout: 5000 }).toBe(1)

    // Release the held send — the panel returns to idle (Send back).
    await app.evaluate(() => {
      const release = (global as Record<string, unknown>).__releaseSend as () => void
      release()
    })
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' })
    ).toBeVisible({ timeout: 10000 })
  })

  test('the agent tree per-agent ✕ cancels exactly that agent', async() => {
    // Surface the tree via the Agents sidebar panel.
    await ensureSidebar(app, page)
    await page.locator('.side-bar .left-column li[title="Agents"]').click()

    await sendIpcToRenderer(app, 'mt::ai:run-state', { state: 'running' })
    await sendIpcToRenderer(app, 'mt::ai:agent-status', runningAgent('agent-kill-me'))
    await sendIpcToRenderer(app, 'mt::ai:agent-status', runningAgent('agent-keep-me'))

    const tree = page.locator('.agents-panel .agent-tree')
    await expect(tree).toBeVisible({ timeout: 10000 })
    const rows = tree.locator('.tree-row', { hasText: 'Researcher' })
    await expect(rows).toHaveCount(2)

    // ✕ on the FIRST researcher row only.
    await rows.first().locator('button[title="Cancel this agent"]').click()
    await expect
      .poll(() => readMain<string[]>(app, '__cancelledAgents'), { timeout: 5000 })
      .toEqual(['agent-kill-me'])
  })

  test('the root ✕ (Stop everything) aborts the whole run', async() => {
    const before = await readMain<number>(app, '__stopCalls')
    await page
      .locator('.agents-panel .tree-row--root button[title="Stop everything"]')
      .click()
    await expect
      .poll(() => readMain<number>(app, '__stopCalls'), { timeout: 5000 })
      .toBe(before + 1)
  })

  test('managed runtimes (perAgentControl: false) hide per-agent ✕ but keep Stop everything', async() => {
    await sendIpcToRenderer(app, 'mt::ai:connection-state', connectedState(false))
    const tree = page.locator('.agents-panel .agent-tree')
    // Per-agent controls vanish — no silent no-ops on the SDK runtime…
    await expect(tree.locator('button[title="Cancel this agent"]')).toHaveCount(0)
    await expect(tree.locator('button[title="Pause this agent"]')).toHaveCount(0)
    // …but the writer can ALWAYS stop everything.
    await expect(
      tree.locator('.tree-row--root button[title="Stop everything"]')
    ).toBeVisible()

    await expectNoRendererErrors(app)
  })
})

test.describe('Stall watchdog (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await patchMainHandlers(app)
    await sendIpcToRenderer(app, 'mt::ai:connection-state', connectedState(true))
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('a run that goes silent raises an INFORMATIONAL notice, not an error', async() => {
    // The watchdog exists so "sending" never looks alive forever. Its real
    // budget is 90s; the renderer reads an override per-run so this can be
    // proven in ~2s instead of doubling the suite runtime. At this point the
    // run is quiet, NOT dead (main's own watchdog waits 5 min; a real crash
    // arrives as a separate error), so the card must read as info, never red.
    await page.evaluate(() => {
      ;(window as unknown as { __wordbirdStallMs?: number }).__wordbirdStallMs = 1200
    })

    await page.locator('.right-prompt textarea').fill('Research something slow.')
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()
    // The run is live and, crucially, emits NOTHING after this point.
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Stop' })
    ).toBeVisible({ timeout: 10000 })

    // The notice arrives as an INFO message (not an error card).
    const notice = page.locator('.right-prompt .message--notice')
    await expect(notice.first()).toBeVisible({ timeout: 15000 })
    await expect(notice.first()).toContainText(/still working|Stop/i)
    // It is NOT the red error card — a quiet run is not a failure.
    await expect(page.locator('.right-prompt .error-card')).toHaveCount(0)

    // It shows ONCE, not on every tick.
    await page.waitForTimeout(3000)
    expect(await notice.count()).toBe(1)

    // Releasing the run clears the "sending" state (watchdog stops).
    await app.evaluate(() => {
      const release = (global as Record<string, unknown>).__releaseSend as (() => void) | undefined
      release?.()
    })
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' })
    ).toBeVisible({ timeout: 15000 })
    await expectNoRendererErrors(app)
  })

  test('a run whose MAIN stops heartbeating raises an ERROR (dead, not quiet)', async() => {
    // The distinction the whole design turns on: main emits a liveness
    // heartbeat while a turn runs. Its ABSENCE means main itself is wedged or
    // gone — nothing is alive to wait for — so this is a real error, NOT the
    // info notice. Simulate by patching the send handler to withhold
    // heartbeats, and shrink the liveness budget (keeping the quiet budget
    // large so it cannot fire first).
    await patchMainHandlers(app, { heartbeat: false })
    // Fresh chat so a notice from the previous (quiet) test can't pollute the
    // "no info notice" assertion below.
    await page.locator('.right-prompt .new-chat-btn').click()
    await expect(page.locator('.right-prompt .message--notice')).toHaveCount(0)
    await page.evaluate(() => {
      ;(window as unknown as { __wordbirdLivenessMs?: number }).__wordbirdLivenessMs = 1200
      ;(window as unknown as { __wordbirdStallMs?: number }).__wordbirdStallMs = 60_000
    })

    await page.locator('.right-prompt textarea').fill('Do something; main will wedge.')
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Stop' })
    ).toBeVisible({ timeout: 10000 })

    // The dead-main error card appears; the quiet info notice does NOT.
    const errorCard = page.locator('.right-prompt .error-card')
    await expect(errorCard.first()).toBeVisible({ timeout: 15000 })
    await expect(errorCard.first()).toContainText(/responding|stuck/i)
    await expect(page.locator('.right-prompt .message--notice')).toHaveCount(0)

    // Restore a live main + release so the suite leaves a clean state.
    await patchMainHandlers(app, { heartbeat: true })
    await app.evaluate(() => {
      const release = (global as Record<string, unknown>).__releaseSend as (() => void) | undefined
      release?.()
    })
  })
})
