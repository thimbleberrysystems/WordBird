import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, expectNoRendererErrors } from './helpers'

/**
 * Mocked-AI e2e: drives the real `mt::ai:*` IPC surface from the main
 * process (no model, no network) and asserts the renderer's review queue
 * and question card behave end to end — including the acceptance feedback
 * loop reporting back to main (mt::ai:edit-resolved).
 */

const proposal = (id: string, filePath: string) => ({
  edit: {
    id,
    filePath,
    newContent: '# Hello\n\nA new paragraph from Biscuit.\n',
    reason: 'e2e test proposal'
  },
  oldContent: '# Hello\n',
  originalPath: filePath
})

/** Arm a one-shot main-side listener for mt::ai:edit-resolved. */
const armResolutionProbe = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain }) => {
    const g = global as Record<string, unknown>
    g.__e2eResolved = null
    ipcMain.once('mt::ai:edit-resolved', (_event, resolution) => {
      g.__e2eResolved = resolution
    })
  })
}

const readResolution = async(
  app: ElectronApplication
): Promise<{ id: string; accepted: boolean } | null> =>
  app.evaluate(() => (global as Record<string, unknown>).__e2eResolved as never)

test.describe('Review queue + question card (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('an edit proposal appears in the review queue', async() => {
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await sendIpcToRenderer(app, 'mt::ai:edit-proposal', proposal('e2e-reject', filePath))
    await expect(page.locator('.global-agent-review')).toBeVisible()
    await expect(page.locator('.global-agent-review .review-item')).toHaveCount(1)
  })

  test('discarding reports the rejection back to main (feedback loop)', async() => {
    await armResolutionProbe(app)
    await page.locator('.global-agent-review .review-btn--discard').first().click()
    await expect(page.locator('.global-agent-review')).toHaveCount(0)

    await expect
      .poll(async() => readResolution(app), { timeout: 5000 })
      .toMatchObject({ id: 'e2e-reject', accepted: false })
  })

  test('accepting reports acceptance back to main', async() => {
    await sendIpcToRenderer(app, 'mt::ai:edit-proposal', proposal('e2e-accept', filePath))
    await expect(page.locator('.global-agent-review')).toBeVisible()

    await armResolutionProbe(app)
    await page.locator('.global-agent-review .review-btn--accept').first().click()
    await expect(page.locator('.global-agent-review')).toHaveCount(0)

    await expect
      .poll(async() => readResolution(app), { timeout: 5000 })
      .toMatchObject({ id: 'e2e-accept', accepted: true })
  })

  test('a pending-edits-cleared broadcast empties the queue silently', async() => {
    await sendIpcToRenderer(app, 'mt::ai:edit-proposal', proposal('e2e-clear', filePath))
    await expect(page.locator('.global-agent-review')).toBeVisible()

    await armResolutionProbe(app)
    await sendIpcToRenderer(app, 'mt::ai:pending-edits-cleared', {})
    await expect(page.locator('.global-agent-review')).toHaveCount(0)
    // A conversation switch is not a rejection — nothing is reported.
    expect(await readResolution(app)).toBeNull()
  })

  test('a writer question renders as a selectable option card', async() => {
    await sendIpcToRenderer(app, 'mt::ai:writer-question', {
      id: 'q-e2e',
      question: 'Which genre fits best?',
      options: [
        { label: 'Gothic mystery', description: 'Moody, slow-burn dread' },
        { label: 'Psychological thriller' }
      ]
    })
    const card = page.locator('.question-card')
    await expect(card).toBeVisible()
    await expect(card.locator('.question-card__text')).toHaveText('Which genre fits best?')
    await expect(card.locator('.question-option')).toHaveCount(2)
    await expect(card.locator('.question-freeform input')).toBeVisible()

    await expectNoRendererErrors(app)
  })
})
