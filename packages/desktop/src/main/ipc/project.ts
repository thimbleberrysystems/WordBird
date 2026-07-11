import { BrowserWindow, dialog, ipcMain } from 'electron'
import log from 'electron-log'
import path from 'path'
import fs from 'fs'
import fsExtra from 'fs-extra'
import * as git from 'isomorphic-git'
import { isDirectory2 } from 'common/filesystem'
import { isValidProjectPath } from '../filesystem/markdown'
import { structureService } from '../services/novel/StructureService'
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
  '- `research/` — real-world research notes with sources\n'

const COMMON_FOLDERS = [
  'bible/characters',
  'bible/places',
  'bible/threads',
  'bible/research',
  'notes'
]

const COMMON_FILES: Record<string, string> = {
  'bible/README.md': BIBLE_README,
  'README.md': '# {{name}}\n\nA novel written with WordBird.'
}

const FLAVOR_TEMPLATES: Record<
  ProjectFlavor,
  { folders: string[]; files: Record<string, string> }
> = {
  'chapters-scenes': {
    folders: [...COMMON_FOLDERS, 'manuscript/chapter-one'],
    files: {
      ...COMMON_FILES,
      'manuscript/chapter-one/opening-scene.md': ''
    }
  },
  'scene-pool': {
    folders: [...COMMON_FOLDERS, 'scenes'],
    files: {
      ...COMMON_FILES,
      'scenes/opening-scene.md': ''
    }
  },
  flat: {
    folders: [...COMMON_FOLDERS],
    files: {
      ...COMMON_FILES,
      'chapter-one.md': ''
    }
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
      const markerPath = path.join(dotWordbirdPath, 'project.json')
      fs.writeFileSync(markerPath, JSON.stringify({
        name,
        createdAt: new Date().toISOString(),
        flavor
      }, null, 2), 'utf8')

      // Build the initial structure manifest from the scaffolded files
      try {
        const structure = await structureService.scan(location, flavor)
        await structureService.save(location, structure)
      } catch (structureErr) {
        log.warn('Initial structure manifest creation failed:', structureErr)
      }

      // Phase 3: Initialize git repository
      try {
        await git.init({ fs, dir: location })
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
