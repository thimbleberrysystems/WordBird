import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { closeElectron, launchElectron, type LaunchOptions, type LaunchResult } from './helpers'

/**
 * Shared fixtures for WordBird-feature E2E specs: a fully-seeded novel
 * project (structure metadata that the corkboard/outline/timeline render,
 * bible pages the entities panel indexes, continuity issues) plus the
 * mocked-AI helpers lifted from agent-review-flow.spec.ts so every spec
 * fakes `mt::ai:*` events the same way.
 *
 * Deliberately does NOT import test/live/harness.ts — that module pulls
 * the whole AI stack (langchain, the SDK runner) into the Playwright
 * process. The ~40-line project builder is duplicated here on purpose;
 * keep the two seed shapes roughly in sync when the project layout moves.
 */

export interface NovelProjectOptions {
  /** Seed .wordbird/continuity/issues.json with one open issue. */
  issues?: boolean
  /** Seed today's daily word stats so the binder ring/history render. */
  dailyStats?: boolean
}

export interface SeededScene {
  id: string
  title: string
  file: string
}

export const SCENES: SeededScene[] = [
  { id: 'scene-alley', title: 'The Alley', file: 'manuscript/chapter-one/the-alley.md' },
  { id: 'scene-letter', title: 'The Letter', file: 'manuscript/chapter-one/the-letter.md' },
  { id: 'scene-vault', title: 'The Vault', file: 'manuscript/chapter-two/the-vault.md' },
  { id: 'scene-rooftop', title: 'The Rooftop', file: 'manuscript/chapter-two/the-rooftop.md' }
]

/**
 * A real novel project on disk: two chapters, four scenes carrying the
 * FULL unit metadata the views render (synopsis/status/pov/when/thread/
 * label), bible pages with aliases, and optional continuity issues.
 * `when` values are deliberately OUT of narrative order so the timeline's
 * chronological toggle has something to prove.
 */
export const createNovelProject = (options: NovelProjectOptions = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-e2e-novel-'))
  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  write('.wordbird/project.json', JSON.stringify({ name: 'E2E Novel', flavor: 'chapters-scenes' }))
  write(SCENES[0].file, 'Zara stepped into the rain-slick alley, grey eyes scanning the dark.\n')
  write(SCENES[1].file, 'The letter named a house in Amityville, and a room no blueprint showed.\n')
  write(SCENES[2].file, 'The vault door hung open. Whatever had been inside was long gone.\n')
  write(SCENES[3].file, 'From the rooftop Zara watched the harbour lights and made her choice.\n')

  const scene = (
    index: number,
    meta: Record<string, string>
  ): Record<string, unknown> => ({
    id: SCENES[index].id,
    type: 'scene',
    title: SCENES[index].title,
    path: SCENES[index].file,
    ...meta
  })
  const structure = {
    version: 1,
    flavor: 'chapters-scenes',
    units: [
      {
        id: 'chapter-one',
        type: 'chapter',
        title: 'Chapter One',
        children: [
          scene(0, {
            synopsis: 'Zara finds the first clue.',
            status: 'draft',
            pov: 'Zara',
            when: '1954-03-12',
            thread: 'Main',
            label: 'act1'
          }),
          scene(1, {
            synopsis: 'A letter points at Amityville.',
            status: 'revised',
            pov: 'Zara',
            when: '1953-11-02',
            thread: 'Heist',
            label: 'act1'
          })
        ]
      },
      {
        id: 'chapter-two',
        type: 'chapter',
        title: 'Chapter Two',
        children: [
          scene(2, {
            synopsis: 'The vault is already empty.',
            status: 'idea',
            pov: 'Finn',
            when: '1954-05-01',
            thread: 'Heist',
            label: 'act2'
          }),
          scene(3, {
            synopsis: 'Zara decides to go alone.',
            status: 'draft',
            pov: 'Zara',
            when: '1954-04-20',
            thread: 'Main',
            label: 'act2'
          })
        ]
      }
    ]
  }
  write('.wordbird/structure.json', JSON.stringify(structure, null, 2))

  write(
    'bible/characters/zara.md',
    '---\naliases: [Zara, Detective Voss]\n---\n# Zara Voss\n\nEyes: grey. A skeptic.\n'
  )
  write(
    'bible/characters/finn.md',
    '---\naliases: [Finn]\n---\n# Finn Mercer\n\nThe safecracker. Eyes: brown.\n'
  )

  if (options.issues) {
    // Shape matches ContinuityService: a BARE ARRAY of IContinuityIssue.
    write(
      '.wordbird/continuity/issues.json',
      JSON.stringify([
        {
          id: 'issue-eyes',
          title: 'Zara eye colour drift',
          description: 'Bible says grey; a draft line says green.',
          severity: 'medium',
          relatedPaths: [SCENES[0].file],
          status: 'open',
          createdAt: new Date().toISOString()
        }
      ])
    )
  }

  if (options.dailyStats) {
    // Shape matches StructureService IDailyStats: manuscript total at the
    // first sighting of the day (start) and the latest total (last) — the
    // binder renders written = last - start. Keys are LOCAL date keys.
    const localKey = (date: Date): string => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    const days: Record<string, { start: number; last: number }> = {}
    for (let i = 1; i <= 5; i += 1) {
      const date = new Date(Date.now() - i * 86400000)
      days[localKey(date)] = { start: 1000 - i * 150, last: 1240 - i * 150 }
    }
    // Today: the app overwrites `last` with the REAL manuscript total on
    // load, so start must sit below it — 0 keeps "written today" ≥ 0.
    days[localKey(new Date())] = { start: 0, last: 0 }
    write('.wordbird/stats.json', JSON.stringify({ days }))
  }

  return root
}

/** Launch the app opened on a project root; wait for the project shell. */
export const launchWithProject = async(
  root: string,
  options: LaunchOptions = {}
): Promise<LaunchResult> => {
  const launched = await launchElectron([root], {
    suppressErrorDialog: true,
    ...options
  })
  await launched.page.waitForSelector('.project-home, .editor-component', {
    state: 'attached',
    timeout: 20000
  })
  return launched
}

export interface UseNovelProjectOptions extends NovelProjectOptions {
  /**
   * Consulted at teardown; when it returns true the scratch project is
   * LEFT ON DISK and its path logged (the LIVE_APP lanes keep artifacts
   * for post-mortem via LIVE_KEEP_ARTIFACTS=1).
   */
  keepArtifacts?: () => boolean
}

/** Live accessors for the app/page/root owned by useNovelProject. */
export interface NovelProjectContext {
  readonly app: ElectronApplication
  readonly page: Page
  readonly root: string
}

/**
 * The seeded-project scaffold every WordBird-feature spec shares: create
 * the project, launch the app on it, and tear both down. Call it INSIDE a
 * test.describe body and keep spec-specific setup in a plain `beforeAll`
 * declared afterwards — hooks run in declaration order, so the returned
 * accessors are already populated by then.
 *
 * Accessors (not a plain object) because beforeAll assigns after this
 * function has already returned.
 */
export const useNovelProject = (options: UseNovelProjectOptions = {}): NovelProjectContext => {
  const { keepArtifacts, ...projectOptions } = options
  let app: ElectronApplication | undefined
  let page: Page | undefined
  let root = ''

  test.beforeAll(async() => {
    root = createNovelProject(projectOptions)
    const launched = await launchWithProject(root)
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeElectron(app)
    if (keepArtifacts?.()) {
      console.info(`[live-app] artifacts kept at ${root}`)
    } else if (root) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  return {
    get app(): ElectronApplication {
      if (!app) throw new Error('useNovelProject: app read before beforeAll ran')
      return app
    },
    get page(): Page {
      if (!page) throw new Error('useNovelProject: page read before beforeAll ran')
      return page
    },
    get root(): string {
      return root
    }
  }
}

/**
 * A binder unit as it sits in structure.json. The index signature carries
 * the metadata fields specs assert on (status/pov/when/goal/valueShift…)
 * without re-declaring the whole INovelUnit shape in test code.
 */
export interface UnitLike {
  id: string
  title: string
  path?: string
  children?: UnitLike[]
  [field: string]: unknown
}

export const readStructure = (root: string): { units: UnitLike[] } =>
  JSON.parse(fs.readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8'))

/** Depth-first search over the binder tree; null when nothing matches. */
export const findUnit = (
  units: UnitLike[],
  predicate: (unit: UnitLike) => boolean
): UnitLike | null => {
  for (const unit of units) {
    if (predicate(unit)) return unit
    const found = unit.children ? findUnit(unit.children, predicate) : null
    if (found) return found
  }
  return null
}

/** Throwing lookup by id — callers read metadata fields off the result. */
export const findUnitById = (root: string, id: string): UnitLike => {
  const found = findUnit(readStructure(root).units, (unit) => unit.id === id)
  if (!found) throw new Error(`unit ${id} not found in structure.json`)
  return found
}

/** Every id in the tree, in document order (duplicates preserved). */
export const allUnitIds = (units: UnitLike[]): string[] =>
  units.flatMap((unit) => [unit.id, ...allUnitIds(unit.children ?? [])])

/** Direct child ids of a TOP-LEVEL container (chapters live at the root). */
export const childUnitIds = (root: string, parentId: string): string[] => {
  const parent = readStructure(root).units.find((unit) => unit.id === parentId)
  return (parent?.children ?? []).map((child) => child.id)
}

/**
 * The app's STARTUP word-count refresh rewrites structure.json (adding
 * wordCount) and re-renders the center pane. Specs that drive views or
 * mutate structure must let it finish first, or they race it.
 */
export const waitForWordCountSettle = async(root: string, timeout = 20000): Promise<void> => {
  await expect
    .poll(
      () =>
        fs
          .readFileSync(path.join(root, '.wordbird', 'structure.json'), 'utf8')
          .includes('wordCount'),
      { timeout }
    )
    .toBe(true)
}

const VIEW_CONTAINERS: Record<string, string> = {
  Corkboard: '.corkboard',
  Outline: '.outline-view',
  Timeline: '.timeline-view',
  Page: '.project-home, .editor-component'
}

/**
 * Switch views with retries: the app's STARTUP word-count refresh writes
 * structure.json and briefly re-renders the center pane (structure is
 * momentarily null), which can bounce a just-opened view back to the
 * project home. Writers just click again; so do we.
 */
export const switchView = async(page: Page, label: string): Promise<void> => {
  const container = VIEW_CONTAINERS[label]
  if (!container) throw new Error(`unknown view: ${label}`)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.locator('.view-switcher .view-chip', { hasText: label }).click()
    try {
      await page.waitForSelector(container, { state: 'visible', timeout: 3000 })
      return
    } catch {
      // Transient re-render swallowed the switch — click again.
    }
  }
  throw new Error(`view "${label}" did not become visible after retries`)
}

/** The electron-store preferences file as main last wrote it ({} if absent). */
export const readPreferences = async(
  app: ElectronApplication
): Promise<Record<string, unknown>> => {
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'preferences.json'), 'utf8'))
  } catch {
    return {}
  }
}

/** Fire-and-forget send on the preload ipcRenderer bridge, from the page. */
export const sendPreloadIpc = async(
  page: Page,
  channel: string,
  ...args: unknown[]
): Promise<void> => {
  await page.evaluate(
    ({ ch, payload }) => {
      ;(
        window as unknown as {
          electron: { ipcRenderer: { send: (c: string, ...a: unknown[]) => void } }
        }
      ).electron.ipcRenderer.send(ch, ...payload)
    },
    { ch: channel, payload: args }
  )
}

/**
 * The LIVE_APP gate shared by the app-live-* specs: opt-in, dev machine
 * only (CI has neither the env nor a Claude login), and every run bills
 * the plan. Call at module scope so it skips the whole file.
 */
export const hasClaudeAuth = (): boolean =>
  Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN) ||
  fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'))

export const skipUnlessLiveApp = (): void => {
  test.skip(
    process.env.LIVE_APP !== '1' || !hasClaudeAuth(),
    'LIVE_APP lane: needs LIVE_APP=1 and a Claude login (bills the plan)'
  )
}

/** Standard edit-proposal payload for mocked-AI specs. */
export const mockEditProposal = (
  id: string,
  filePath: string,
  newContent = '# Hello\n\nA new paragraph from Biscuit.\n',
  oldContent = ''
): Record<string, unknown> => ({
  edit: { id, filePath, newContent, reason: 'e2e test proposal' },
  oldContent,
  originalPath: filePath
})

/**
 * Arm a main-side collector on an ipcMain channel; every event's first
 * payload is pushed into a per-channel global sink. Read back with
 * readIpcProbe. Multiple listeners per channel are fine (ipcMain.on).
 */
export const armIpcProbe = async(app: ElectronApplication, channel: string): Promise<void> => {
  await app.evaluate(({ ipcMain }, ch) => {
    const g = global as Record<string, unknown>
    const sinks = (g.__e2eIpcSinks ??= {}) as Record<string, unknown[]>
    if (!sinks[ch]) {
      sinks[ch] = []
      ipcMain.on(ch, (_event, payload) => {
        sinks[ch].push(payload)
      })
    } else {
      sinks[ch].length = 0
    }
  }, channel)
}

export const readIpcProbe = async(
  app: ElectronApplication,
  channel: string
): Promise<unknown[]> =>
  app.evaluate((_electron, ch) => {
    const g = global as Record<string, unknown>
    const sinks = (g.__e2eIpcSinks ?? {}) as Record<string, unknown[]>
    return (sinks[ch] ?? []).slice()
  }, channel)

/** Like helpers.sendIpcToRenderer, but to EVERY window (detached Biscuit). */
export const broadcastIpcToRenderer = async(
  app: ElectronApplication,
  channel: string,
  ...args: unknown[]
): Promise<void> => {
  await app.evaluate(
    ({ BrowserWindow }, payload) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(payload.channel, ...payload.args)
      }
    },
    { channel, args }
  )
}
