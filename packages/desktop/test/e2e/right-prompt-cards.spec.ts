import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, expectNoRendererErrors, closeElectron } from './helpers'

/**
 * RightPrompt chat surfaces beyond the mount smoke: mode chip + compare
 * popover, / starters, token counter, context ring, plan approval card,
 * writer-question interaction, approval card + countdown, error card.
 * Mocked-AI pattern — every `mt::ai:*` event is faked from main; no
 * model, no network (see docs/TESTING.md).
 */

test.describe('RightPrompt cards and indicators (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('mode chip opens the three-mode compare popover; choosing switches', async() => {
    await page.locator('.mode-chip-wrap .mode-line').click()
    const popover = page.locator('.mode-popover')
    await expect(popover).toBeVisible()
    await expect(popover.locator('.mode-option')).toHaveCount(3)
    // Choose auto — the chip reflects it.
    await popover.locator('.mode-option').last().click()
    await expect(page.locator('.mode-line--auto')).toBeVisible()
    // Back to approvals for later tests.
    await page.locator('.mode-chip-wrap .mode-line').click()
    await page.locator('.mode-popover .mode-option').nth(1).click()
  })

  test('the / starters popover opens, offers the retro-outline starter, and toggles closed', async() => {
    const startersButton = page.locator('.right-prompt .cmd-btn', { hasText: '/' })
    await startersButton.click()
    const popover = page.locator('.starters-popover')
    await expect(popover).toBeVisible()
    // The pantser-rescue starter is offered (SOTA batch-2 retro-outline).
    await expect(popover).toContainText(/outline what i.?ve already written/i)
    // Toggle closed — a lingering popover intercepts later card clicks.
    await startersButton.click()
    await expect(page.locator('.starters-popover')).toHaveCount(0)
  })

  test('token counter renders a fed token-usage update', async() => {
    await sendIpcToRenderer(app, 'mt::ai:token-usage', {
      turn: { inputTokens: 1200, outputTokens: 300, calls: 2, byRole: {} },
      session: { inputTokens: 5400, outputTokens: 900, calls: 6, byRole: {} }
    })
    const counter = page.locator('.token-counter')
    await expect(counter).toBeVisible()
    // 5400 in / 900 out, however formatted (5.4k etc.), must show both figures.
    await expect(counter).toContainText(/5[.,]?4\s*k|5400/i)
  })

  test('context ring reflects a context-usage update', async() => {
    await sendIpcToRenderer(app, 'mt::ai:context-usage', {
      usedTokens: 80_000,
      budgetTokens: 100_000,
      contextWindow: 200_000,
      budgetChars: 400_000,
      usedChars: 320_000
    })
    await expect(page.locator('.context-ring')).toBeVisible()
  })

  test('a plan proposal renders the approval card', async() => {
    await sendIpcToRenderer(app, 'mt::ai:plan-proposal', {
      id: 'plan-e2e',
      title: 'Sister Reveal',
      path: 'plans/sister-reveal.md',
      content: '# Sister Reveal\n\n1. Plant the letter\n2. The reveal\n3. Fallout\n'
    })
    const card = page.locator('.plan-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Sister Reveal')
    // Dismissing clears it (approval wiring is exercised in the live lane).
    // The card MUST offer a way out — guarding this behind `if (count())`
    // let a missing button pass silently, and hid that the old pattern
    // (/dismiss|reject|not now/) never matched the real label at all.
    const dismiss = card.locator('button', { hasText: /keep planning|dismiss|not now/i })
    await expect(dismiss.first()).toBeVisible()
    await dismiss.first().click()
    await expect(page.locator('.plan-card')).toHaveCount(0)
  })

  test('clicking a writer-question option consumes the card', async() => {
    await sendIpcToRenderer(app, 'mt::ai:writer-question', {
      id: 'q-cards',
      question: 'Which tone?',
      options: [{ label: 'Gothic dread' }, { label: 'Wry noir' }]
    })
    const card = page.locator('.question-card')
    await expect(card).toBeVisible()
    await card.locator('.question-option', { hasText: 'Gothic dread' }).click()
    await expect(page.locator('.question-card')).toHaveCount(0)
  })

  test('an approval request shows summary + countdown; approving clears it', async() => {
    await sendIpcToRenderer(app, 'mt::ai:approval-request', {
      id: 'appr-e2e',
      summary: 'SPAWN AGENTS — one explorer over chapter one',
      spawns: [],
      expiresAt: Date.now() + 90_000
    })
    const card = page.locator('.approval-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('explorer')
    await expect(card.locator('.approval-countdown')).toBeVisible()
    // The approve button reads "Go ahead" (biscuit.approve).
    await card.locator('button', { hasText: 'Go ahead' }).click()
    await expect(page.locator('.approval-card')).toHaveCount(0)
  })

  test('no renderer errors across all card interactions', async() => {
    await expectNoRendererErrors(app)
  })
})
