import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById, expectNoRendererErrors } from './helpers'

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
    if (app) await app.close()
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
})
