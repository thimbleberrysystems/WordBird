import { expect, test } from '@playwright/test'
import { ensureSidebar, expectNoRendererErrors } from './helpers'
import { skipUnlessLiveApp, useNovelProject } from './fixtures'

/**
 * LIVE_APP lane: the STOP CONTROLS against the REAL subscription runtime
 * in the REAL app — the writer presses the actual buttons and the actual
 * run dies. Complements (never replaces) the free layers: UI→IPC wiring
 * is pinned mocked in stop-controls.spec.ts, the runtime abort mechanics
 * in agent-sdk-runner.spec.ts + the live claude-subscription suite.
 *
 * OPT-IN, dev machine only (same gate as app-live-golden). COST (per
 * MAINTENANCE POLICY): ~2-5 sonnet calls — one connect probe + ONE
 * research turn that is aborted early. sonnet only, never opus.
 *
 *   LIVE_APP=1 pnpm -C packages/desktop exec playwright test test/e2e/app-live-stop.spec.ts
 */

skipUnlessLiveApp()

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.describe('Stop controls: real app + real subscription run', () => {
  const ctx = useNovelProject()

  test('pressing Stop kills a live research run; per-agent ✕ is honestly hidden', async() => {
    const { app, page } = ctx
    await page.waitForSelector('.right-prompt', { timeout: 20000 })
    await page.evaluate(() =>
      window.electron.ai.connect({
        provider: 'claude-code',
        apiKey: '',
        model: 'sonnet'
      } as never)
    )
    await expect(page.locator('.right-prompt .status-indicator.connected')).toBeVisible({
      timeout: 60_000
    })
    // Ask mode: read-only research — nothing to review, cheap to abort.
    await page.evaluate(() => window.electron.ai.setMode('ask' as never))

    // Kick off a run that would take a while if left alone.
    await page.locator('.right-prompt textarea').fill(
      'Research the history of lighthouse construction: search and read at least six ' +
        'different sources one after another, summarizing each in detail.'
    )
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()

    // The run is genuinely live: Stop takes the prominent slot.
    const stopButton = page.locator('.right-prompt .prompt-input-actions button', {
      hasText: 'Stop'
    })
    await expect(stopButton).toBeVisible({ timeout: 30_000 })

    // While it runs: the agent tree on the SDK runtime shows the honest
    // control set — NO per-agent ✕ (perAgentControl:false broadcast by
    // the REAL connect), root "Stop everything" available.
    await ensureSidebar(app, page)
    await page.locator('.side-bar .left-column li[title="Agents"]').click()
    const tree = page.locator('.agents-panel .agent-tree')
    await expect(tree).toBeVisible({ timeout: 15_000 })
    await expect(tree.locator('button[title="Cancel this agent"]')).toHaveCount(0)
    await expect(
      tree.locator('.tree-row--root button[title="Stop everything"]')
    ).toBeVisible()

    // Let the model actually start working before pulling the plug.
    await expect
      .poll(async() => page.locator('.agents-panel').textContent(), { timeout: 120_000 })
      .toMatch(/running|thinking|tool|search|read/i)

    // THE WRITER PRESSES STOP.
    const stoppedAt = Date.now()
    await stopButton.click()

    // The run dies PROMPTLY: the panel returns to idle (Send back) well
    // before six sources' worth of work could have finished. The timeout is
    // the assertion — a 60s wait followed by a `< 60_000` check could never
    // fail, so the bound here is deliberately tight.
    await expect(
      page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' })
    ).toBeVisible({ timeout: 30_000 })
    expect(
      Date.now() - stoppedAt,
      'Stop took too long to return the panel to idle'
    ).toBeLessThan(30_000)

    // And it STAYS dead: the agents panel settles (no new activity text
    // churning) and no running rows remain.
    await page.waitForTimeout(3_000)
    const settledText = await page.locator('.agents-panel').textContent()
    await page.waitForTimeout(5_000)
    expect(await page.locator('.agents-panel').textContent()).toBe(settledText)
    await expect(page.locator('.agents-panel .agents-state--running')).toHaveCount(0)

    await expectNoRendererErrors(app)
  })
})
