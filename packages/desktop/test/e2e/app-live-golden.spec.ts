import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ensureSidebar, expectNoRendererErrors } from './helpers'
import { armIpcProbe, readIpcProbe, skipUnlessLiveApp, useNovelProject } from './fixtures'

/**
 * THE GOLDEN PATH — the only test anywhere that drives the REAL app with
 * the REAL Claude-subscription AI end to end: connect through the real
 * IPC (local Claude Code login), type into the real chat, watch a real
 * agent produce a review-queue proposal, accept it, and see the file land
 * on disk with the binder refreshing.
 *
 * OPT-IN, dev machine only — never CI (gated below; CI has no login and
 * no LIVE_APP env). COST (per MAINTENANCE POLICY): ~2-6 sonnet calls —
 * one connect probe + ONE tightly-scoped writer message in approvals
 * mode. sonnet only, never opus. Keep this spec at ≤1 writer message.
 *
 *   LIVE_APP=1 pnpm -C packages/desktop exec playwright test test/e2e/app-live-golden.spec.ts
 */

skipUnlessLiveApp()

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.describe('Golden path: real app + real subscription AI', () => {
  const ctx = useNovelProject({
    keepArtifacts: () => process.env.LIVE_KEEP_ARTIFACTS === '1'
  })

  test('connects the claude-code provider through the real IPC', async() => {
    const page = ctx.page
    await page.waitForSelector('.right-prompt', { timeout: 20000 })
    // Renderer auto-connect deliberately skips empty-key providers, so
    // connect explicitly — the REAL mt::ai:connect → AgentSDKRunner.probe()
    // (one sonnet turn; auth = local login or CLAUDE_CODE_OAUTH_TOKEN).
    await page.evaluate(() =>
      window.electron.ai.connect({
        provider: 'claude-code',
        apiKey: '',
        model: 'sonnet'
      } as never)
    )
    // The connection-state broadcast flips the status indicator.
    await expect(page.locator('.right-prompt .status-indicator.connected')).toBeVisible({
      timeout: 60_000
    })
  })

  test('one writer message yields a real review-queue proposal; accept lands it on disk', async() => {
    const { app, page, root } = ctx
    const mode = await page.evaluate(() => window.electron.ai.setMode('approvals' as never))
    expect((mode as { mode: string }).mode).toBe('approvals')

    await armIpcProbe(app, 'mt::ai:edit-resolved')

    const input = page.locator('.right-prompt textarea')
    await input.fill(
      'Write a TWO-sentence scene where Zara finds a brass key under the jetty, and save ' +
        'it as a new scene file in chapter one. Do nothing else — no research, no other edits.'
    )
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()

    // The real agent runs (SDK subprocess, sonnet). Its proposal must
    // surface in the review queue.
    const reviewItem = page.locator('.global-agent-review .review-item')
    await expect(reviewItem.first()).toBeVisible({ timeout: 240_000 })

    // NOTE: propose_new_unit creates the scene SHELL file at proposal
    // time (structural ops are direct); only the PROSE waits for review.
    // Snapshot content-per-file now, then prove the accept CHANGED it.
    const chapterDir = path.join(root, 'manuscript/chapter-one')
    const contentsOf = (): Map<string, string> =>
      new Map(
        fs
          .readdirSync(chapterDir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => [f, fs.readFileSync(path.join(chapterDir, f), 'utf8')])
      )
    const before = contentsOf()

    await page.locator('.global-agent-review .review-btn--accept').first().click()

    // Acceptance flows back to main (EditResolutionTracker feedback loop)…
    await expect
      .poll(async() => {
        const resolutions = (await readIpcProbe(app, 'mt::ai:edit-resolved')) as Array<{
          accepted?: boolean
        }>
        return resolutions.some((r) => r?.accepted === true)
      }, { timeout: 30_000 })
      .toBe(true)

    // …and the accepted prose is REAL on disk: some chapter-one file is
    // new or changed, and the changed prose mentions the requested key.
    const changedProse = (): string => {
      const changed: string[] = []
      for (const [file, content] of contentsOf()) {
        if (before.get(file) !== content) changed.push(content)
      }
      return changed.join('\n')
    }
    await expect
      .poll(() => changedProse().toLowerCase().includes('key'), { timeout: 30_000 })
      .toBe(true)

    // The binder shows the scene (shell creation + project-changed
    // refresh): assert on the actual changed/new file's name.
    const changedFile =
      fs
        .readdirSync(chapterDir)
        .filter((f) => f.endsWith('.md'))
        .find((f) => before.get(f) !== fs.readFileSync(path.join(chapterDir, f), 'utf8')) ?? ''
    const stemWord = changedFile.replace(/\.md$/, '').split('-').pop() ?? ''
    expect(stemWord.length).toBeGreaterThan(0)
    await ensureSidebar(app, page)
    await expect(page.locator('.binder')).toContainText(stemWord, {
      timeout: 15_000,
      ignoreCase: true
    })

    await expectNoRendererErrors(app)
  })
})
