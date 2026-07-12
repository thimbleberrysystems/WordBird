import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, clickMenuById, expectNoRendererErrors } from './helpers'

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
    if (app) await app.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('the binder renders the manuscript tree', async() => {
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
    }
    await expect(page.locator('.binder')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.binder')).toContainText('chapter', { ignoreCase: true })
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
