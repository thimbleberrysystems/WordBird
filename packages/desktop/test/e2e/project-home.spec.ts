import { expect, test } from '@playwright/test'
import { expectNoRendererErrors } from './helpers'
import { useNovelProject } from './fixtures'

/**
 * ProjectHome — the centre pane when a project is open but no file is.
 *
 * That is NOT the same as an empty project, which is what its copy used to
 * assume: closing every tab on a populated manuscript showed "A fresh
 * manuscript. Create your first chapter." (writer-reported). The pane must
 * describe what the binder actually holds and offer a way back into it.
 */

test.describe('ProjectHome on a populated project', () => {
  const ctx = useNovelProject()

  test('offers a way back into the prose, never "create your first chapter"', async() => {
    const { page, app } = ctx
    const home = page.locator('.project-home')
    await expect(home).toBeVisible({ timeout: 15000 })

    // THE BUG: a seeded project has four scenes, so none of the empty-project
    // copy may appear.
    await expect(home).not.toContainText('first chapter')
    await expect(home).not.toContainText('fresh manuscript')
    await expect(home).not.toContainText('set it up')

    // Instead it reports the real manuscript and offers to resume.
    await expect(home).toContainText('words so far')
    const resume = home.locator('.home-action--primary')
    await expect(resume).toContainText('Continue')
    await expectNoRendererErrors(app)
  })

  test('the resume button actually opens a scene', async() => {
    const { page, app } = ctx
    const home = page.locator('.project-home')
    await expect(home).toBeVisible({ timeout: 15000 })

    await home.locator('.home-action--primary').click()
    // A file is now open, so ProjectHome yields to the editor.
    await expect(page.locator('.editor-component')).toBeVisible({ timeout: 15000 })
    await expect(home).toHaveCount(0)
    await expectNoRendererErrors(app)
  })
})
