import { BrowserWindow, dialog, ipcMain } from 'electron'
import log from 'electron-log'
import path from 'path'
import fs from 'fs'
import fsExtra from 'fs-extra'
import * as git from 'isomorphic-git'
import { isDirectory2 } from 'common/filesystem'
import { isValidProjectPath } from '../filesystem/markdown'
import { structureService } from '../services/novel/StructureService'
import { STRUCTURE_TEMPLATES } from '../services/novel/structureTemplates'
import { isPlanningStyle, isStructureTemplate } from '../services/novel/ProjectMeta'
import { snapshotService } from '../services/novel/SnapshotService'
import type {
  ProjectCreateArgs,
  ProjectLoadArgs
} from '@shared/types/ipc'
import type { ProjectFlavor } from '@shared/types/novel'

const normalizePath = (pathname: string): string => path.resolve(pathname)

const chooseDirectory = async(win: BrowserWindow | null): Promise<string | null> => {
  if (!win) {
    return null
  }

  const { filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (!filePaths || filePaths.length === 0) {
    return null
  }
  return normalizePath(filePaths[0])
}

// Per-flavor novel project scaffolding. All flavors share the story bible
// and notes; they differ only in how prose files are laid out on disk
// (see @shared/types/novel for the flavor descriptions).
const BIBLE_README =
  '# Story Bible\n\n' +
  'Everything that is true about your story lives here — characters, places,\n' +
  'plot threads, and research. Biscuit reads these pages to stay consistent\n' +
  'with your canon and keeps them up to date as the story grows.\n\n' +
  '- `characters/` — one page per character\n' +
  '- `places/` — locations and settings\n' +
  '- `threads/` — plot threads, arcs, and open questions\n' +
  '- `research/` — real-world research notes with sources\n\n' +
  '## Locking canon\n\n' +
  'Add `locked: true` to a page\'s front matter to make it hard canon:\n\n' +
  '```\n---\nlocked: true\n---\n```\n\n' +
  'Biscuit can read locked pages but may never change them — if prose\n' +
  'conflicts with locked canon, the prose gets fixed, not the canon.\n\n' +
  '## Aliases\n\n' +
  'List every name a character or place goes by so searches and revisions\n' +
  'never miss a reference:\n\n' +
  '```\n---\naliases: [Liz, Lizzy, the Widow Hale]\n---\n# Elizabeth Hale\n```\n'

const COMMON_FOLDERS = [
  'bible/characters',
  'bible/places',
  'bible/threads',
  'bible/research',
  'notes'
]

const STYLE_TEMPLATE =
  '# Style Guide\n\n' +
  'Biscuit reads this page before writing or polishing prose. Fill in what\n' +
  'matters to you; delete what doesn\'t.\n\n' +
  '## Voice & tense\n\n- Point of view: (e.g. third limited, single POV per scene)\n' +
  '- Tense: (e.g. past)\n- Narrator voice: (e.g. wry, restrained; no purple prose)\n\n' +
  '## Prose rules\n\n- Dialogue tags: (e.g. said/asked only)\n' +
  '- Words/phrases to avoid: (e.g. suddenly, very, "little did they know")\n' +
  '- Profanity/content boundaries:\n\n' +
  '## Character voices\n\n- (Name): speech habits, vocabulary, rhythm\n'

const COMMON_FILES: Record<string, string> = {
  'bible/README.md': BIBLE_README,
  'bible/style.md': STYLE_TEMPLATE,
  'README.md': '# {{name}}\n\nA novel written with WordBird.',
  // Compiled output and agent thread state are derived/machine-local —
  // keep them out of snapshots.
  '.gitignore': 'exports/\n.wordbird/agent-state/\n'
}

const FLAVOR_TEMPLATES: Record<
  ProjectFlavor,
  { folders: string[]; files: Record<string, string> }
> = {
  // No placeholder chapters/scenes: the binder starts empty and the first
  // unit is the writer's (or Biscuit's onboarding playbook's) to create.
  'chapters-scenes': {
    folders: [...COMMON_FOLDERS, 'manuscript'],
    files: { ...COMMON_FILES }
  },
  'scene-pool': {
    folders: [...COMMON_FOLDERS, 'scenes'],
    files: { ...COMMON_FILES }
  },
  flat: {
    folders: [...COMMON_FOLDERS],
    files: { ...COMMON_FILES }
  }
}

const isProjectFlavor = (value: unknown): value is ProjectFlavor =>
  value === 'chapters-scenes' || value === 'scene-pool' || value === 'flat'

const updateLastOpenedFolder = (win: BrowserWindow | null, pathname: string): void => {
  if (!win) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessor = (win as any)._accessor
  if (accessor?.preferences) {
    accessor.preferences.setItems({ lastOpenedFolder: pathname })
  }
}

export const registerProjectHandlers = (): void => {
  ipcMain.handle('mt::project:create', async(e, args: ProjectCreateArgs = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const location = args.location ? normalizePath(args.location) : await chooseDirectory(win)
    if (!location) {
      return { projectPath: null }
    }

    // Phase 2: Create project structure for the chosen flavor
    try {
      const flavor: ProjectFlavor = isProjectFlavor(args.flavor)
        ? args.flavor
        : 'chapters-scenes'
      const template = FLAVOR_TEMPLATES[flavor]

      // Create directories
      for (const folder of template.folders) {
        const folderPath = path.join(location, folder)
        fs.mkdirSync(folderPath, { recursive: true })
      }

      // Create files with placeholder interpolation
      const name = args.name || path.basename(location)
      const slug = name.toLowerCase().replace(/\s+/g, '-')
      for (const [filename, content] of Object.entries(template.files)) {
        const interpolated = String(content).replace(/\{\{name\}\}/g, name).replace(/\{\{slug\}\}/g, slug)
        fs.writeFileSync(path.join(location, filename), interpolated, 'utf8')
      }

      // Write project marker file
      const dotWordbirdPath = path.join(location, '.wordbird')
      if (!fs.existsSync(dotWordbirdPath)) {
        fs.mkdirSync(dotWordbirdPath, { recursive: true })
      }
      const planningStyle = isPlanningStyle(args.planningStyle) ? args.planningStyle : 'unset'
      const structureTemplate = isStructureTemplate(args.structureTemplate)
        ? args.structureTemplate
        : 'unset'
      const markerPath = path.join(dotWordbirdPath, 'project.json')
      fs.writeFileSync(markerPath, JSON.stringify({
        name,
        createdAt: new Date().toISOString(),
        flavor,
        planningStyle,
        structureTemplate
      }, null, 2), 'utf8')

      // A chosen framework seeds its beat sheet as writer-editable canon.
      const beatSheet = STRUCTURE_TEMPLATES[structureTemplate]
      if (beatSheet) {
        fs.writeFileSync(path.join(location, 'bible', 'structure.md'), beatSheet, 'utf8')
      }

      // Build the initial structure manifest from the scaffolded files
      try {
        const structure = await structureService.scan(location, flavor)
        await structureService.save(location, structure)
      } catch (structureErr) {
        log.warn('Initial structure manifest creation failed:', structureErr)
      }

      // Phase 3: Initialize git repository + first snapshot
      try {
        await git.init({ fs, dir: location })
        await snapshotService.snapshot(location, 'Project created')
      } catch (gitErr) {
        log.warn('Git initialization failed:', gitErr)
      }

      // Update lastOpenedFolder preference
      updateLastOpenedFolder(win, location)

      // Open new window with the project and close current window
      if (win) {
        ipcMain.emit('app-open-directory-by-id', win.id, location, false, true)
        win.close()
      }

      return { projectPath: location }
    } catch (err) {
      log.error('Project creation failed:', err)
      return { projectPath: null }
    }
  })

  ipcMain.handle('mt::project:load', async(e, args: ProjectLoadArgs = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const loadPath = args.path ? normalizePath(args.path) : await chooseDirectory(win)
    if (!loadPath || !isDirectory2(loadPath)) {
      return { projectPath: null, valid: false }
    }

    // Phase 2: Validate project marker
    const markerPath = path.join(loadPath, '.wordbird', 'project.json')
    const hasMarker = fs.existsSync(markerPath)

    if (!hasMarker) {
      // Not a valid project - don't open it
      return { projectPath: null, valid: false }
    }

    // Update lastOpenedFolder preference
    updateLastOpenedFolder(win, loadPath)

    // Open new window with the project and close current window
    if (win) {
      ipcMain.emit('app-open-directory-by-id', win.id, loadPath, false, true)
      win.close()
    }

    return { projectPath: loadPath, valid: true }
  })

  ipcMain.handle('mt::project:save-as', async(e, currentPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const destPath = await chooseDirectory(win)

    if (!destPath || destPath === currentPath) {
      return { success: false }
    }

    try {
      await fsExtra.copy(currentPath, destPath, {
        overwrite: true,
        errorOnExist: false
      })

      updateLastOpenedFolder(win, destPath)

      if (win) {
        ipcMain.emit('app-open-directory-by-id', win.id, destPath, false, true)
        win.close()
      }

      return { success: true, projectPath: destPath }
    } catch (err) {
      log.error('Project save-as failed:', err)
      return { success: false }
    }
  })

  ipcMain.handle('mt::project:validate', async(_e, path: string) => {
    return isValidProjectPath(path)
  })
}
