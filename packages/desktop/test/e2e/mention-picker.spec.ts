import { expect, test } from '@playwright/test'
import { expectNoRendererErrors } from './helpers'
import { useNovelProject } from './fixtures'

/**
 * The @-mention picker (P1, SOTA audit): filtering, keyboard navigation,
 * and dismissal — only the click-insert path was covered before
 * (biscuit-panel.spec). Cline-style file mentions are the writer's main
 * way to point Biscuit at a scene.
 */

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('@-mention picker: filter, keyboard, dismiss', () => {
  const ctx = useNovelProject()

  test.beforeAll(async() => {
    await ctx.page.waitForSelector('.right-prompt', { timeout: 15000 })
  })

  test('typing @ opens the picker listing scenes and bible pages', async() => {
    const input = ctx.page.locator('.right-prompt textarea')
    await input.click()
    await input.type('Look at @')
    const popover = ctx.page.locator('.mention-popover').first()
    await expect(popover).toBeVisible()
    const items = popover.locator('.mention-item')
    expect(await items.count()).toBeGreaterThanOrEqual(4)
    await expect(popover).toContainText(/alley/i)
    await expect(popover).toContainText(/zara/i)
  })

  test('typing narrows the list to matching items', async() => {
    await ctx.page.locator('.right-prompt textarea').type('lett')
    const popover = ctx.page.locator('.mention-popover').first()
    await expect(popover).toContainText(/letter/i)
    await expect(popover).not.toContainText(/rooftop/i)
  })

  test('keyboard navigation + Enter inserts the project-relative path', async() => {
    await ctx.page.keyboard.press('ArrowDown')
    await ctx.page.keyboard.press('Enter')
    const value = await ctx.page.locator('.right-prompt textarea').inputValue()
    expect(value).toContain('the-letter')
    expect(value).not.toContain('@lett')
    await expect(ctx.page.locator('.mention-popover')).toHaveCount(0)
  })

  test('Escape dismisses without inserting', async() => {
    const input = ctx.page.locator('.right-prompt textarea')
    const before = await input.inputValue()
    await input.type(' and @roo')
    await expect(ctx.page.locator('.mention-popover').first()).toBeVisible()
    await ctx.page.keyboard.press('Escape')
    await expect(ctx.page.locator('.mention-popover')).toHaveCount(0)
    // The literal typed text stays; no path was inserted.
    const after = await input.inputValue()
    expect(after).toBe(`${before} and @roo`)

    await expectNoRendererErrors(ctx.app)
  })
})
