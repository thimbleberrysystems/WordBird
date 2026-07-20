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

const patchMainHandlers = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain }) => {
    const g = global as Record<string, unknown>
    g.__stopCalls = 0
    g.__cancelledAgents = []
    ipcMain.removeHandler('mt::ai:send-message')
    ipcMain.handle('mt::ai:send-message', () => {
      // Held open until the spec releases it — while pending, the
      // renderer is "sending" and shows Steer + Stop.
      return new Promise((resolve) => {
        g.__releaseSend = () => resolve({ content: 'ok (released by spec)', model: 'mock' })
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
  })
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

  test('a run that goes silent raises the advisory card telling the writer to Stop', async() => {
    // The watchdog exists so "sending" never looks alive forever. Its real
    // budget is 90s; the renderer reads an override per-run so this can be
    // proven in ~2s instead of doubling the suite runtime.
    await page.evaluate(() => {
      ;(window as unknown as { __wordbirdStallMs?: number }).__wordbirdStallMs = 1200
    })

    await page.locator('.right-prompt textarea').fill('Research something slow.')
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()
    // The run is live and, crucially, emits NOTHING after this point.
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Stop' })
    ).toBeVisible({ timeout: 10000 })

    // The advisory arrives and names Stop as the way out.
    const advisory = page.locator('.right-prompt .message-error, .right-prompt .error-card')
    await expect(advisory.first()).toBeVisible({ timeout: 15000 })
    await expect(advisory.first()).toContainText(/stalled|Stop/i)

    // It warns ONCE, not on every tick.
    await page.waitForTimeout(3000)
    expect(await advisory.count()).toBe(1)

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
})
