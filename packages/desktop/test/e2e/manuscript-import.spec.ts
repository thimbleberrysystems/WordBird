import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, closeElectron } from './helpers'

/**
 * Manuscript import (SOTA batch-3): a writer arrives with a finished
 * markdown draft and WordBird splits it into a chapters-scenes project.
 * Driven through the real recent-page button with the native file +
 * directory dialogs stubbed main-side (same pattern as project-wizard).
 */

test.describe('Manuscript import → project', () => {
  let app: ElectronApplication
  let page: Page
  let sourceFile: string
  let destination: string

  test.beforeAll(async() => {
    // A realistic manuscript: two chapters, scenes split by ## headings
    // and a horizontal rule.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-e2e-import-src-'))
    sourceFile = path.join(dir, 'my-novel.md')
    fs.writeFileSync(
      sourceFile,
      [
        '# Chapter One',
        '',
        '## The Alley',
        'Zara stepped into the rain-slick alley.',
        '',
        '## The Letter',
        'A letter waited on her desk.',
        '',
        '# Chapter Two',
        '',
        'The vault stood open.',
        '',
        '* * *',
        '',
        'From the rooftop she watched the harbour.'
      ].join('\n'),
      'utf8'
    )
    destination = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-e2e-import-dst-'))

    const launched = await launchElectron([], { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    // Stub the two dialogs the import flow raises: file chooser → the
    // source manuscript, directory chooser → the destination.
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = (async(_win: unknown, opts: { properties?: string[] }) => {
          const wantsDir = (opts?.properties ?? []).includes('openDirectory')
          return { canceled: false, filePaths: [wantsDir ? paths.dest : paths.src] }
        }) as typeof dialog.showOpenDialog
      },
      { src: sourceFile, dest: destination }
    )
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.rmSync(path.dirname(sourceFile), { recursive: true, force: true })
  })

  test('the recent page offers an Import Manuscript action', async() => {
    await expect(page.locator('.recent-files-projects')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.import-manuscript-btn')).toBeVisible()
  })

  test('importing splits the manuscript into a chapters-scenes project on disk', async() => {
    await page.locator('.import-manuscript-btn').click()

    // Main writes the scaffold + scenes, then opens the project (closing
    // this window). Assert the on-disk result.
    await expect
      .poll(() => fs.existsSync(path.join(destination, '.wordbird', 'structure.json')), {
        timeout: 20000
      })
      .toBe(true)

    // Two chapter folders, four scene files.
    expect(fs.existsSync(path.join(destination, 'manuscript/chapter-one/the-alley.md'))).toBe(true)
    expect(fs.existsSync(path.join(destination, 'manuscript/chapter-one/the-letter.md'))).toBe(true)
    const chapterTwoScenes = fs.readdirSync(path.join(destination, 'manuscript/chapter-two'))
    expect(chapterTwoScenes.length).toBe(2) // vault + rooftop (split on * * *)

    // Prose survived the round-trip.
    expect(
      fs.readFileSync(path.join(destination, 'manuscript/chapter-one/the-alley.md'), 'utf8')
    ).toContain('rain-slick alley')

    // The binder reflects two chapters.
    const structure = JSON.parse(
      fs.readFileSync(path.join(destination, '.wordbird', 'structure.json'), 'utf8')
    ) as { flavor: string; units: unknown[] }
    expect(structure.flavor).toBe('chapters-scenes')
    expect(structure.units).toHaveLength(2)

    // The import marker was recorded.
    const marker = JSON.parse(
      fs.readFileSync(path.join(destination, '.wordbird', 'project.json'), 'utf8')
    )
    expect(marker.importedFrom).toBe('my-novel.md')
  })
})
