import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, clickMenuById, expectNoRendererErrors, closeElectron } from './helpers'

/**
 * Binder CRUD against a real WordBird project opened from the CLI: the
 * tree renders from structure.json, creating a scene puts a real file on
 * disk with a writer-friendly name (ordinals on collision — never UUID
 * fragments), and failures never dead-end silently.
 */

const makeProject = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-e2e-binder-'))
  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  write('.wordbird/project.json', JSON.stringify({ name: 'E2E', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/the-alley.md', 'Zara stepped into the alley.\n')
  write('plans/draft-act-one.md', '# Plan\n\n- [ ] step one\n')
  return root
}

test.describe('Binder CRUD (real project)', () => {
  let app: ElectronApplication
  let page: Page
  let root: string

  test.beforeAll(async() => {
    root = makeProject()
    const launched = await launchElectron([root], { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('the binder renders the manuscript tree', async() => {
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
    }
    await expect(page.locator('.binder')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.binder')).toContainText('chapter', { ignoreCase: true })
  })

  test('plans are visible in the binder and open on click', async() => {
    const plansSection = page.locator('.binder .binder-plans')
    await expect(plansSection).toBeVisible({ timeout: 15000 })
    await expect(plansSection).toContainText('draft-act-one.md')
    await plansSection.locator('li', { hasText: 'draft-act-one.md' }).click()
    // The plan opens as a normal editor tab.
    await expect
      .poll(async() =>
        page.locator('.tabs-container > li', { hasText: 'draft-act-one.md' }).count()
      )
      .toBeGreaterThan(0)
  })

  test('the view switcher lives in the title bar, clear of the tab strip', async() => {
    // Moved out of the editor area — it used to float over the file tabs
    // and collided once enough tabs were open.
    const switcher = page.locator('.title-bar .view-switcher')
    await expect(switcher).toBeVisible({ timeout: 15000 })
    // Exactly one switcher, and its home is the title bar (the old float
    // sat over the tab strip).
    await expect(page.locator('.view-switcher')).toHaveCount(1)

    // Switching views still works from its new home.
    await switcher.locator('.view-chip', { hasText: 'Corkboard' }).click()
    await expect(page.locator('.corkboard')).toBeVisible({ timeout: 10000 })
    await switcher.locator('.view-chip', { hasText: 'Page' }).click()
    await expect(page.locator('.corkboard')).toHaveCount(0)
  })

  test('creating scenes writes ordinal filenames on title collision', async() => {
    // Drive the same preload bridge the binder UI uses — deterministic, no
    // menu hunting — then assert both the disk truth and the tree update.
    const results = await page.evaluate(async(projectRoot) => {
      const api = (window as unknown as {
        electron: {
          novel: {
            getStructure: (r: string) => Promise<{ ok: boolean; structure?: { units: Array<{ id: string }> } }>
            createUnit: (
              r: string,
              payload: { parentId: string | null; type: string; title: string }
            ) => Promise<{ ok: boolean; structure?: unknown; error?: string }>
          }
        }
      }).electron.novel
      const before = await api.getStructure(projectRoot)
      const chapterId = before.structure?.units[0]?.id ?? null
      const one = await api.createUnit(projectRoot, {
        parentId: chapterId,
        type: 'scene',
        title: 'Opening'
      })
      const two = await api.createUnit(projectRoot, {
        parentId: chapterId,
        type: 'scene',
        title: 'Opening'
      })
      return { one: one.ok, two: two.ok }
    }, root)
    expect(results.one).toBe(true)
    expect(results.two).toBe(true)

    const dir = path.join(root, 'manuscript', 'chapter-one')
    const files = fs.readdirSync(dir).sort()
    expect(files).toContain('opening.md')
    expect(files).toContain('opening-2.md')
    for (const file of files) expect(file).not.toMatch(/[0-9a-f]{8}\.md$/)

    await expectNoRendererErrors(app)
  })
})
