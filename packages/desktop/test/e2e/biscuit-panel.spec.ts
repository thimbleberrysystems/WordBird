import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById, expectNoRendererErrors, closeElectron } from './helpers'

// Regression guard: the Biscuit panel and the Agents sidebar view render
// without renderer exceptions, and the View menu can always bring the
// Biscuit panel back.
test.describe('Biscuit panel + Agents sidebar', () => {
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

  test('Biscuit panel renders and toggles from the View menu', async() => {
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await expect(page.locator('.right-prompt .prompt-title')).toHaveText('Biscuit')

    await clickMenuById(app, 'aiPanelMenuItem')
    await expect(page.locator('.right-prompt')).toHaveCount(0)
    await clickMenuById(app, 'aiPanelMenuItem')
    await expect(page.locator('.right-prompt')).toBeVisible()
  })

  test('Agents view opens from the sidebar rail', async() => {
    // Ensure the sidebar is visible, then open the Agents view.
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
      await expect(page.locator('.side-bar')).toBeVisible()
    }
    const agentsIcon = page.locator('.side-bar .left-column li[title="Agents"]')
    await expect(agentsIcon).toBeVisible()
    await agentsIcon.click()
    await expect(page.locator('.agents-panel')).toBeVisible()
    await expect(page.locator('.agent-tree')).toBeVisible()

    await expectNoRendererErrors(app)
  })

  test('Biscuit detaches into its own window and reattaches on close', async() => {
    const before = app.windows().length
    // The detach button is the first header action in the panel.
    await page.locator('.right-prompt .header-actions .header-action').first().click()

    // A second renderer window appears hosting the detached panel.
    await expect
      .poll(async() => app.windows().length, { timeout: 15000 })
      .toBe(before + 1)
    const biscuitWin = app
      .windows()
      .find((w) => w !== page && w.url().includes('type=biscuit'))
    expect(biscuitWin).toBeTruthy()
    await biscuitWin!.waitForSelector('.right-prompt--detached', { timeout: 15000 })

    // The docked panel is hidden while detached…
    await expect(page.locator('.right-prompt')).toHaveCount(0)

    // …and returns when the detached window closes.
    await biscuitWin!.close()
    await expect(page.locator('.right-prompt')).toBeVisible({ timeout: 10000 })
  })
})
