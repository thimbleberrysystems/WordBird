import { expect, test } from '@playwright/test'
import { ensureSidebar, expectNoRendererErrors, focusEditor, waitForEditor } from './helpers'
import { SCENES, useNovelProject } from './fixtures'

/**
 * SelectionActions — the inline rewrite/expand/describe affordance on a
 * prose selection. Disconnected AI keeps the composed instruction in the
 * Biscuit prompt (exactly what a writer sees before connecting), which
 * lets this spec assert the full instruction shape with zero tokens.
 */

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Selection actions over a prose selection', () => {
  const ctx = useNovelProject()

  test('selecting prose surfaces the action bar; Rewrite composes the instruction', async() => {
    const page = ctx.page
    // Open the first scene from the binder.
    await ensureSidebar(ctx.app, page)
    await page.locator('.binder', { hasText: 'The Alley' }).getByText('The Alley').click()
    await waitForEditor(page)

    // Select the paragraph — the action bar appears on a real selection.
    await focusEditor(page)
    const bar = page.locator('.selection-actions')
    await expect(bar).toBeVisible({ timeout: 10000 })
    // Draft + Rewrite + Expand + Describe + Custom.
    await expect(bar.locator('.sel-btn')).toHaveCount(5)

    await bar.locator('.sel-btn', { hasText: /rewrite/i }).click()

    // Disconnected: the composed instruction lands in the prompt textarea.
    const prompt = page.locator('.right-prompt textarea')
    await expect(prompt).toHaveValue(/Rewrite this passage/, { timeout: 10000 })
    const value = await prompt.inputValue()
    // The instruction quotes the passage and names the file + review path.
    expect(value).toContain('rain-slick alley')
    expect(value).toContain(SCENES[0].file)
    expect(value).toContain('propose_project_file_edit')

    await expectNoRendererErrors(ctx.app)
  })

  test('the Draft action composes a beat→prose instruction', async() => {
    const page = ctx.page
    // Re-open the scene and select its line as a "beat".
    await page.locator('.binder', { hasText: 'The Alley' }).getByText('The Alley').click()
    await waitForEditor(page)
    await focusEditor(page)
    const bar = page.locator('.selection-actions')
    await expect(bar).toBeVisible({ timeout: 10000 })

    await bar.locator('.sel-btn', { hasText: /^Draft$/i }).click()
    const prompt = page.locator('.right-prompt textarea')
    // The composed instruction is beat-expansion, review-gated.
    await expect(prompt).toHaveValue(/Draft this BEAT into full prose/, { timeout: 10000 })
    const value = await prompt.inputValue()
    expect(value).toContain('rain-slick alley')
    expect(value).toContain('propose_project_file_edit')

    await expectNoRendererErrors(ctx.app)
  })
})
