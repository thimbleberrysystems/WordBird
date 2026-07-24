import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchWithMarkdown, closeElectron, expectNoRendererErrors } from './helpers'

/**
 * WRITER-REPORTED: with many tabs open, the Biscuit panel got squeezed to the
 * right and eventually pushed off-screen with no way to pull it back.
 *
 * Cause: the editor's width was a manual `calc(100vw - sidebar)` that ignored
 * the Biscuit panel, so a crowded tab strip / wide editor grew into Biscuit's
 * space and pushed the flex row past the viewport. The panel is a flex sibling
 * with a reserved width, so the fix is to let flex size the editor (min-width:0
 * down the chain) rather than a hand-rolled viewport calc.
 */

test.describe('Biscuit stays on-screen with many tabs', () => {
  let app: ElectronApplication
  let page: Page
  const tmp: string[] = []

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.waitForSelector('.right-prompt', { timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    for (const f of tmp) fs.rmSync(f, { force: true })
  })

  test('the Biscuit panel remains visible and within the viewport', async() => {
    // Open many files so the tab strip is crowded and the editor is pressured
    // to grow.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-tabs-'))
    for (let i = 0; i < 18; i += 1) {
      const file = path.join(dir, `a-fairly-long-scene-file-name-number-${i}.md`)
      fs.writeFileSync(file, `# Scene ${i}\n\nSome prose for scene ${i}.\n`)
      tmp.push(file)
      await page.evaluate((f) => {
        window.electron.ipcRenderer.send('mt::open-file', f, {})
      }, file)
    }
    // Let the tabs render.
    await expect
      .poll(async() => page.locator('.tabs-container > li').count(), { timeout: 15000 })
      .toBeGreaterThan(10)

    // THE INVARIANT: Biscuit is still visible and fully within the viewport —
    // never pushed off the right edge.
    const prompt = page.locator('.right-prompt')
    await expect(prompt).toBeVisible()

    const geom = await page.evaluate(() => {
      const el = document.querySelector('.right-prompt') as HTMLElement | null
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth }
    })
    expect(geom, 'right-prompt not found').not.toBeNull()
    // Held its width (never squeezed to nothing) …
    expect(geom!.width, `panel width collapsed: ${geom!.width}`).toBeGreaterThan(200)
    // … and its right edge is at/inside the viewport (never pushed off).
    expect(geom!.right, `panel pushed off-screen: right=${geom!.right} vw=${geom!.vw}`)
      .toBeLessThanOrEqual(geom!.vw + 1)
    // … and it actually sits on the right side, not overlapped away.
    expect(geom!.left).toBeLessThan(geom!.vw)
    expect(geom!.left).toBeGreaterThan(0)

    await expectNoRendererErrors(app)
  })
})
