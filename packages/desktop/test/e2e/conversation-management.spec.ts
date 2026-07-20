import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { expectNoRendererErrors, sendIpcToRenderer } from './helpers'
import { useNovelProject } from './fixtures'

/**
 * Conversation management (P1, SOTA audit): history list, switching,
 * deletion, and transcript export to disk — previously untested. Uses
 * the held-open/instant send-message patch pattern (docs/TESTING.md) to
 * create real conversation entries without a model.
 */

const patchSend = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('mt::ai:send-message')
    let n = 0
    ipcMain.handle('mt::ai:send-message', () => {
      n += 1
      return { content: `Mock reply ${n}`, model: 'mock' }
    })
  })
}

// These tests share one app + one seeded project and mutate it as they go,
// so they must run (and retry) as an ordered group.
test.describe.configure({ mode: 'serial' })

test.describe('Conversations: list, switch, delete, export', () => {
  const ctx = useNovelProject()

  test.beforeAll(async() => {
    const { app, page } = ctx
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
    await patchSend(app)
    await sendIpcToRenderer(app, 'mt::ai:connection-state', {
      connected: true,
      provider: 'claude-code',
      model: 'sonnet',
      capabilities: { perAgentControl: false, boundaryPause: false, manualCompact: false }
    })
  })

  const send = async(text: string): Promise<void> => {
    const page = ctx.page
    await page.locator('.right-prompt textarea').fill(text)
    await page.locator('.right-prompt .prompt-input-actions button', { hasText: 'Send' }).click()
    await expect(page.locator('.right-prompt')).toContainText(/Mock reply/, { timeout: 10000 })
  }

  test('a chat exchange lands in the history list', async() => {
    const page = ctx.page
    await send('First conversation opener about Zara.')
    await page.locator('.right-prompt button[title*="conversations" i], .right-prompt button:has-text("Past conversations")').first().click()
    const list = page.locator('.history-list')
    await expect(list).toBeVisible()
    await expect(list.locator('.history-row')).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('New starts a fresh conversation; switching restores the old one', async() => {
    const page = ctx.page
    await page.locator('.right-prompt button', { hasText: 'New' }).click()
    await expect(page.locator('.right-prompt')).not.toContainText('Mock reply 1')
    await send('Second conversation about Finn.')

    await page.locator('.right-prompt button[title*="conversations" i], .right-prompt button:has-text("Past conversations")').first().click()
    const rows = page.locator('.history-list .history-row')
    await expect(rows).toHaveCount(2)
    // Load the FIRST conversation back.
    await rows.filter({ hasText: /Zara/i }).first().click()
    await expect(page.locator('.right-prompt')).toContainText('Mock reply 1', {
      timeout: 10000
    })
  })

  test('export transcript writes a markdown file under notes/transcripts/', async() => {
    const page = ctx.page
    await page.locator('.right-prompt button[title*="conversations" i], .right-prompt button:has-text("Past conversations")').first().click()
    await page.locator('.history-export').click()
    const dir = path.join(ctx.root, 'notes', 'transcripts')
    await expect
      .poll(() => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []), {
        timeout: 10000
      })
      .not.toEqual([])
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    const transcript = fs.readFileSync(path.join(dir, files[0]), 'utf8')
    expect(transcript).toContain('## Writer')
    expect(transcript).toContain('Mock reply')
  })

  test('deleting a conversation removes it from the list', async() => {
    const page = ctx.page
    await page.locator('.right-prompt button[title*="conversations" i], .right-prompt button:has-text("Past conversations")').first().click()
    const rows = page.locator('.history-list .history-row')
    await expect(rows).toHaveCount(2)
    await rows.first().locator('.history-row__delete').click()
    // A confirm dialog may guard deletion.
    const confirm = page.locator('.el-message-box button', { hasText: /delete|ok|confirm/i })
    if (await confirm.count()) await confirm.first().click()
    await expect(page.locator('.history-list .history-row')).toHaveCount(1, { timeout: 10000 })

    await expectNoRendererErrors(ctx.app)
  })
})
