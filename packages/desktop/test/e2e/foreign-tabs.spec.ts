import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { closeElectron, expectNoRendererErrors, launchElectron } from './helpers'
import { createNovelProject } from './fixtures'

/**
 * Tabs belonging to another project.
 *
 * WRITER-REPORTED: after opening a new project, files from a different (since
 * deleted) project were still open, and Biscuit described them as this book's
 * work in progress. Keeping the buffers is deliberate — unsaved work must
 * never be dropped — so the fix is to MARK them rather than let them pass as
 * part of the open project.
 */

test.describe('Tabs from another project are marked, not adopted', () => {
  let app: Awaited<ReturnType<typeof launchElectron>>['app']
  let page: Awaited<ReturnType<typeof launchElectron>>['page']
  let root: string
  let outsider: string

  test.beforeAll(async() => {
    root = createNovelProject()
    // A file that belongs to no project of ours, standing in for the leftover
    // buffer from a project the writer has left.
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-other-project-'))
    outsider = path.join(otherDir, 'braided-novel-elam-to-vanni.md')
    fs.writeFileSync(outsider, '# Braided Novel\n\nFrom another project.\n')

    const launched = await launchElectron([root], { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(path.dirname(outsider), { recursive: true, force: true })
  })

  test('a foreign tab is badged and dimmed; the project’s own tab is not', async() => {
    // Open one file from THIS project and one from outside it.
    const own = path.join(root, 'manuscript', 'chapter-one', 'the-alley.md')
    await page.evaluate((file) => {
      window.electron.ipcRenderer.send('mt::open-file', file, {})
    }, own)
    await expect(page.locator('.tabs-container > li')).toHaveCount(1, { timeout: 15000 })

    await page.evaluate((file) => {
      window.electron.ipcRenderer.send('mt::open-file', file, {})
    }, outsider)
    await expect(page.locator('.tabs-container > li')).toHaveCount(2, { timeout: 15000 })

    const foreign = page.locator('.tabs-container > li.foreign')
    await expect(foreign).toHaveCount(1)
    await expect(foreign).toContainText('braided-novel-elam-to-vanni')
    // The badge tells the writer why it looks different.
    await expect(foreign.locator('.foreign-marker')).toBeVisible()
    // …and the tooltip says it plainly.
    await expect(foreign).toHaveAttribute('title', /different project/)

    // The project's own tab is untouched.
    const mine = page.locator('.tabs-container > li', { hasText: 'the-alley' })
    await expect(mine).not.toHaveClass(/foreign/)
    await expectNoRendererErrors(app)
  })
})
