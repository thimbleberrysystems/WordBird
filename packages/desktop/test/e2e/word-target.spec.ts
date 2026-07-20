import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { ensureSidebar, expectNoRendererErrors } from './helpers'
import { switchView, useNovelProject } from './fixtures'

/**
 * Word target (P1, SOTA audit): set / progress / clear through the real
 * binder UI. Target mechanics existed with zero e2e coverage; the SOTA
 * matrix flags targets as table stakes (Scrivener/Dabble).
 */

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Manuscript word target', () => {
  const ctx = useNovelProject({ dailyStats: true })

  test.beforeAll(async() => {
    await ensureSidebar(ctx.app, ctx.page)
    await expect(ctx.page.locator('.binder')).toBeVisible({ timeout: 15000 })
  })

  const targetToggle = (): ReturnType<Page['locator']> =>
    ctx.page.locator('.binder [title*="target" i]').first()

  test('setting a target shows the progress bar', async() => {
    const page = ctx.page
    await expect(page.locator('.binder .binder-target-bar')).toHaveCount(0)
    await targetToggle().click()
    const prompt = page.locator('.el-message-box')
    await expect(prompt).toBeVisible()
    await prompt.locator('input').fill('50000')
    await prompt.locator('button', { hasText: /ok|confirm|set/i }).click()

    await expect(page.locator('.binder .binder-target-bar')).toBeVisible({ timeout: 10000 })
    // ~49 words of 50k → fill width is tiny but the bar exists and the
    // total label carries the target framing.
    await expect(page.locator('.binder .binder-target-fill')).toBeAttached()
  })

  test('the target survives a view round-trip (persisted per project)', async() => {
    const page = ctx.page
    await switchView(page, 'Corkboard')
    await switchView(page, 'Page')
    await expect(page.locator('.binder .binder-target-bar')).toBeVisible()
  })

  test('a deadline drives the Dabble-style daily quota line', async() => {
    const page = ctx.page
    // Set target + a far-future deadline via the "count by DATE" syntax.
    await targetToggle().click()
    const prompt = page.locator('.el-message-box')
    await expect(prompt).toBeVisible()
    await prompt.locator('input').fill('50000 by 2099-12-31')
    await prompt.locator('button', { hasText: /ok|confirm|set/i }).click()
    // The quota line appears (~49 words of 50k over many days = a small
    // but positive per-day number).
    const quota = page.locator('.binder .binder-quota')
    await expect(quota).toBeVisible({ timeout: 10000 })
    await expect(quota).toContainText(/day/i)
  })

  test('the 14-day streak chip renders from seeded stats', async() => {
    // dailyStats seeds 5 consecutive prior days with words → a streak.
    await expect(ctx.page.locator('.binder .binder-streak')).toBeVisible()
    await expect(ctx.page.locator('.binder .binder-streak')).toContainText('🔥')
  })

  test('clearing the target removes the bar', async() => {
    const page = ctx.page
    await targetToggle().click()
    const prompt = page.locator('.el-message-box')
    await expect(prompt).toBeVisible()
    await prompt.locator('input').fill('0')
    await prompt.locator('button', { hasText: /ok|confirm|set/i }).click()
    await expect(page.locator('.binder .binder-target-bar')).toHaveCount(0, { timeout: 10000 })

    await expectNoRendererErrors(ctx.app)
  })
})
