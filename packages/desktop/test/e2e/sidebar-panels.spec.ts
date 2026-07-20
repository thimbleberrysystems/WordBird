import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ensureSidebar, expectNoRendererErrors, sendIpcToRenderer } from './helpers'
import { useNovelProject } from './fixtures'

/**
 * The novel sidebar panels — entities (deterministic index), continuity
 * (issue list), history (snapshot capture + restore), agents (activity
 * rendering via mocked events). Previously untested at every layer.
 */

const openPanel = async(page: Page, title: string): Promise<void> => {
  await page.locator(`.side-bar .left-column li[title="${title}"]`).click()
}

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Sidebar panels (seeded project)', () => {
  const ctx = useNovelProject({ issues: true })

  test.beforeAll(async() => {
    await ensureSidebar(ctx.app, ctx.page)
  })

  test('entities panel lists bible pages with mention counts', async() => {
    const page = ctx.page
    await openPanel(page, 'Entities')
    const panel = page.locator('.entities-panel')
    await expect(panel).toBeVisible({ timeout: 15000 })
    // Both seeded bible pages index (Zara appears in prose; Finn may not).
    await expect(panel.locator('.entity')).toHaveCount(2, { timeout: 15000 })
    await expect(panel).toContainText('Zara')
    const zaraRow = panel.locator('.entity', { hasText: 'Zara' })
    await expect(zaraRow.locator('.entity-mentions')).toBeVisible()
    // Expanding shows per-scene appearances.
    await zaraRow.locator('.entity-row').click()
    await expect(zaraRow).toContainText('Alley', { ignoreCase: true })
  })

  test('continuity panel shows the seeded open issue', async() => {
    const page = ctx.page
    await openPanel(page, 'Continuity')
    const panel = page.locator('.continuity')
    await expect(panel).toBeVisible({ timeout: 15000 })
    await expect(panel.locator('.issue-item')).toHaveCount(1)
    await expect(panel.locator('.issue-title')).toContainText('Zara eye colour drift')
  })

  test('history panel: named snapshot appears in the list, restore reverts a file', async() => {
    const page = ctx.page
    await openPanel(page, 'Snapshots')
    const panel = page.locator('.history')
    await expect(panel).toBeVisible({ timeout: 15000 })

    await panel.locator('.capture-input').fill('before-the-heist')
    await panel.locator('.capture-input').press('Enter')
    const item = panel.locator('.history-item', { hasText: 'before-the-heist' })
    await expect(item).toBeVisible({ timeout: 30000 })

    // Mutate a scene on disk, then restore the snapshot.
    const scenePath = path.join(ctx.root, 'manuscript/chapter-one/the-alley.md')
    const original = fs.readFileSync(scenePath, 'utf8')
    fs.writeFileSync(scenePath, 'Everything Zara knew was wrong.\n')

    await item.hover()
    await item.locator('.item-restore').click()
    // Restore may confirm via a dialog button — accept if one appears.
    const confirm = ctx.page.locator('.el-message-box button', { hasText: /restore|confirm|ok/i })
    if (await confirm.count()) await confirm.first().click()

    await expect
      .poll(() => fs.readFileSync(scenePath, 'utf8'), { timeout: 30000 })
      .toBe(original)
  })

  test('agents panel renders mocked activity + statuses', async() => {
    const { app, page } = ctx
    await openPanel(page, 'Agents')
    await expect(page.locator('.side-bar')).toContainText('Agents', { ignoreCase: true })
    await sendIpcToRenderer(app, 'mt::ai:agent-status', {
      id: 'agent-e2e',
      role: 'researcher',
      displayName: 'Researcher',
      status: 'running',
      task: 'Research Elam',
      toolCalls: 1,
      startedAt: Date.now(),
      paused: false
    })
    await sendIpcToRenderer(app, 'mt::ai:activity', {
      kind: 'tool',
      label: 'wiki_read',
      detail: '{"title":"Elam"}',
      at: Date.now()
    })
    await expect(page.locator('.side-bar')).toContainText('Researcher', { timeout: 10000 })
  })

  test('no renderer errors across panel interactions', async() => {
    await expectNoRendererErrors(ctx.app)
  })
})

test.describe('Sidebar activity dots (mocked project change)', () => {
  const ctx = useNovelProject()

  test.beforeAll(async() => {
    await ensureSidebar(ctx.app, ctx.page)
  })

  test('a project change dots the views it invalidates, and opening one clears it', async() => {
    const page = ctx.page
    // Park on a view that a project change does NOT invalidate, so the
    // dots under test are unambiguous.
    await page.locator('.side-bar .left-column li[title="Search"]').click()

    const dotFor = (title: string): ReturnType<typeof page.locator> =>
      page.locator(`.side-bar .left-column li[title="${title}"] .view-activity-dot`)

    // Clean rail to start.
    await expect(page.locator('.side-bar .view-activity-dot')).toHaveCount(0)

    // Biscuit edited the project.
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    // The invalidated views light up…
    await expect(dotFor('Manuscript')).toBeVisible({ timeout: 10000 })
    await expect(dotFor('Files')).toBeVisible()
    // …and views the change does not touch stay clean.
    await expect(dotFor('Search')).toHaveCount(0)
    await expect(dotFor('Table of Contents')).toHaveCount(0)

    // Opening a dotted view clears ONLY that view.
    await page.locator('.side-bar .left-column li[title="Manuscript"]').click()
    await expect(dotFor('Manuscript')).toHaveCount(0)
    await expect(dotFor('Files')).toBeVisible()

    await expectNoRendererErrors(ctx.app)
  })

  test('the view being looked at is never dotted', async() => {
    const page = ctx.page
    // Sitting on Files while the project changes: it refreshes live, so a
    // dot there would be noise.
    await page.locator('.side-bar .left-column li[title="Files"]').click()
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })
    await page.waitForTimeout(500)
    await expect(
      page.locator('.side-bar .left-column li[title="Files"] .view-activity-dot')
    ).toHaveCount(0)
    await expectNoRendererErrors(ctx.app)
  })
})

test.describe('Sidebar activity dots: severity', () => {
  const ctx = useNovelProject({ issues: true })

  test.beforeAll(async() => {
    await ensureSidebar(ctx.app, ctx.page)
  })

  test('a NEW high-severity continuity issue dots Continuity red', async() => {
    const page = ctx.page
    // Park somewhere unrelated so the dot under test is unambiguous.
    await page.locator('.side-bar .left-column li[title="Search"]').click()
    const dot = page.locator('.side-bar .left-column li[title="Continuity"] .view-activity-dot')

    // First project change adopts the CURRENT issues as the baseline —
    // pre-existing issues must not dot the rail on startup.
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })
    await page.waitForTimeout(600)
    await expect(dot).toHaveCount(0)

    // Biscuit logs a NEW high-severity issue.
    const issuesFile = path.join(ctx.root, '.wordbird', 'continuity', 'issues.json')
    const existing = JSON.parse(fs.readFileSync(issuesFile, 'utf8')) as unknown[]
    existing.push({
      id: 'issue-timeline',
      title: 'Vault heist predates the letter',
      description: 'Chapter two happens before chapter one.',
      severity: 'high',
      relatedPaths: [],
      status: 'open',
      createdAt: new Date().toISOString()
    })
    fs.writeFileSync(issuesFile, JSON.stringify(existing))
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })

    // Red: this one needs a decision.
    await expect(dot).toBeVisible({ timeout: 10000 })
    await expect(dot).toHaveClass(/error/)

    // Opening Continuity clears it and re-baselines, so it stays clear.
    await page.locator('.side-bar .left-column li[title="Continuity"]').click()
    await expect(dot).toHaveCount(0)
    await sendIpcToRenderer(ctx.app, 'mt::novel:project-changed', { root: ctx.root })
    await page.waitForTimeout(600)
    await expect(dot).toHaveCount(0)

    await expectNoRendererErrors(ctx.app)
  })
})
