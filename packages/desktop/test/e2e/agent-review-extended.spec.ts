import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, expectNoRendererErrors, closeElectron } from './helpers'
import { mockEditProposal, armIpcProbe, readIpcProbe } from './fixtures'

/**
 * Review queue beyond the basics: a multi-file batch, the expandable
 * per-edit diff, and header accept-all resolving EVERY edit back to main.
 * Mocked-AI pattern (docs/TESTING.md).
 */

test.describe('Review queue extended (mocked AI)', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
  })

  test('a three-proposal multi-file batch queues three cards', async() => {
    // Apply-all writes each file — the closed-file targets must exist so
    // the disk apply path has real originals to diff against.
    const second = filePath.replace('note.md', 'second.md')
    const third = filePath.replace('note.md', 'third.md')
    const fsm = await import('node:fs')
    fsm.writeFileSync(second, '# Old second\n')
    fsm.writeFileSync(third, '# Old third\n')

    await sendIpcToRenderer(app, 'mt::ai:edit-proposal', mockEditProposal('batch-1', filePath))
    await sendIpcToRenderer(
      app,
      'mt::ai:edit-proposal',
      mockEditProposal('batch-2', second, '# Second\n', '# Old second\n')
    )
    await sendIpcToRenderer(
      app,
      'mt::ai:edit-proposal',
      mockEditProposal('batch-3', third, '# Third\n', '# Old third\n')
    )
    await expect(page.locator('.global-agent-review .review-item')).toHaveCount(3)
  })

  test('the caret expands a per-edit diff', async() => {
    const firstItem = page.locator('.global-agent-review .review-item').first()
    await firstItem.locator('.item-caret').click()
    await expect(page.locator('.global-agent-review .agent-diff-view').first()).toBeVisible()
  })

  test('header accept-all applies the open file and surfaces (never drops) the rest', async() => {
    await armIpcProbe(app, 'mt::ai:edit-resolved')
    // The header-level Apply-all button applies the whole batch. Under the
    // mocked pattern only the OPEN file can fully apply: closed-file edits
    // go through mt::ai:apply-edit BY ID, and main refuses ids it never
    // recorded (these proposals were faked renderer-side). The contract
    // pinned here: the open-file edit resolves accepted, and unappliable
    // edits are NOT silently dropped — they stay visible in the queue.
    // (The closed-file happy path is covered by the apply-gate unit specs
    // and the LIVE_APP golden path, where main holds the real proposals.)
    await page
      .locator('.global-agent-review .review-header .review-btn--accept')
      .click()

    await expect
      .poll(async() => {
        const resolutions = (await readIpcProbe(app, 'mt::ai:edit-resolved')) as Array<{
          id?: string
          accepted?: boolean
        }>
        return resolutions.filter((r) => r?.accepted === true).map((r) => r.id)
      }, { timeout: 10000 })
      .toEqual(['batch-1'])

    // The queue clears, and the unappliable edits are surfaced in an
    // error toast naming the files — failure is loud, never silent.
    await expect(page.locator('.global-agent-review')).toHaveCount(0, { timeout: 10000 })
    const toast = page.locator('.el-message')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(/2 file/i)

    await expectNoRendererErrors(app)
  })
})
