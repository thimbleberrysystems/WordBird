import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, closeElectron, expectNoRendererErrors } from './helpers'

/**
 * The project-creation wizard: flavor picker, writing method, structure
 * template — walked through the real UI (the directory dialog stubbed
 * main-side), asserting the scaffold that lands on disk. Previously
 * untested at any layer.
 */

test.describe('Project-creation wizard', () => {
  let app: ElectronApplication
  let page: Page
  let destination: string

  test.beforeAll(async() => {
    destination = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-e2e-wizard-'))
    const launched = await launchElectron([], { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    // Stub the native directory chooser so confirmCreate lands in our dir.
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async() => ({
        canceled: false,
        filePaths: [dir]
      })) as typeof dialog.showOpenDialog
    }, destination)
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    fs.rmSync(destination, { recursive: true, force: true })
  })

  test('no-args launch shows the project landing page', async() => {
    await expect(page.locator('.recent-files-projects')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.recent-files-projects')).toContainText('project', {
      ignoreCase: true
    })
  })

  test('flavor + method + template walk scaffolds the project on disk', async() => {
    await page.locator('.recent-files-projects button', { hasText: /create/i }).click()
    const dialog = page.locator('.el-dialog', { hasText: /flavor|structure|project/i })
    await expect(dialog).toBeVisible()

    // Flavor: chapters-scenes is the first card; pick it explicitly.
    const flavorCards = dialog.locator('.flavor-card')
    await expect(flavorCards.first()).toBeVisible()
    await flavorCards.first().click()
    await expect(flavorCards.first()).toHaveClass(/selected/)

    // Planning style: outline-first; structure template: three-act.
    const selects = dialog.locator('.method-row .el-select')
    await selects.nth(0).click()
    await page.locator('.el-select-dropdown__item', { hasText: /outline/i }).first().click()
    await selects.nth(1).click()
    await page.locator('.el-select-dropdown__item', { hasText: /three/i }).first().click()

    await dialog.locator('button', { hasText: /^Create$/i }).click()

    // The scaffold lands: marker with method fields + beat sheet + folders.
    await expect
      .poll(() => fs.existsSync(path.join(destination, '.wordbird', 'project.json')), {
        timeout: 20000
      })
      .toBe(true)
    const marker = JSON.parse(
      fs.readFileSync(path.join(destination, '.wordbird', 'project.json'), 'utf8')
    )
    expect(marker.flavor).toBe('chapters-scenes')
    expect(marker.planningStyle).toBe('outline-first')
    expect(marker.structureTemplate).toBe('three-act')
    expect(fs.existsSync(path.join(destination, 'manuscript'))).toBe(true)
    expect(fs.existsSync(path.join(destination, 'bible'))).toBe(true)
    // The chosen beat sheet seeds structural canon.
    const beatSheet = path.join(destination, 'bible', 'structure.md')
    expect(fs.existsSync(beatSheet)).toBe(true)
    expect(fs.readFileSync(beatSheet, 'utf8').toLowerCase()).toContain('act')

    await expectNoRendererErrors(app)
  })
})
