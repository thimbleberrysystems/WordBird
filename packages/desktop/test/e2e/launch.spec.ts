import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

// Centralized app name for test assertions
const APP_NAME = 'WordBird'
// Title can be just "WordBird" or "Untitled-1 - WordBird"
const APP_TITLE_REGEX = new RegExp(`^(${APP_NAME}|Untitled-1 - ${APP_NAME})$`)

test.describe('Check Launch WordBird', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('Empty WordBird', async() => {
    const title = await page.title()
    expect(APP_TITLE_REGEX.test(title)).toBeTruthy()
  })
})
