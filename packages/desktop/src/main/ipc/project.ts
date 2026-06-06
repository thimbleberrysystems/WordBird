import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { isDirectory2 } from 'common/filesystem'
import { isValidProjectPath } from '../filesystem/markdown'
import type {
  ProjectCreateArgs,
  ProjectCreateResult,
  ProjectLoadArgs,
  ProjectLoadResult
} from '@shared/types/ipc'

const normalizePath = (pathname: string): string => path.resolve(pathname)

// Allow any valid directory path - users should be able to create projects anywhere
const isAllowedProjectPath = (pathname: string): boolean => {
  return !!pathname
}

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

// Default project template embedded in code
// This is used when the static/projectTemplate.json file is not available
const DEFAULT_PROJECT_TEMPLATE = {
  folders: ['src', 'docs'],
  files: {
    'README.md': '# {{name}}\n\nA new project created with MarkText.',
    'src/index.md': '<!-- Main content file -->\n\n# Welcome to {{name}}'
  }
}

const loadProjectTemplate = (): { folders?: string[]; files?: Record<string, string> } | null => {
  // In production: resources/static/projectTemplate.json
  // In development: packages/desktop/static/projectTemplate.json
  // __dirname in compiled code is out/main/, so we need to go up 2 levels to reach packages/desktop/
  const templatePath = path.join(__dirname, '..', '..', 'static', 'projectTemplate.json')
  
  try {
    if (fs.existsSync(templatePath)) {
      const templateContent = fs.readFileSync(templatePath, 'utf8')
      return JSON.parse(templateContent)
    }
  } catch (err) {
    console.warn('Failed to load project template from file, using default:', err)
  }
  
  // Fallback to embedded template
  return DEFAULT_PROJECT_TEMPLATE
}

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
    if (!location || !isAllowedProjectPath(location)) {
      return { projectPath: null }
    }

    // Phase 2: Create project structure
    try {
      const template = loadProjectTemplate()
      if (!template) {
        console.error('Failed to load project template')
        return { projectPath: null }
      }

      // Create directories
      for (const folder of template.folders || []) {
        const folderPath = path.join(location, folder)
        fs.mkdirSync(folderPath, { recursive: true })
      }

      // Create files with placeholder interpolation
      const name = args.name || path.basename(location)
      const slug = name.toLowerCase().replace(/\s+/g, '-')
      for (const [filename, content] of Object.entries(template.files || {})) {
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
        templateId: 'default'
      }, null, 2), 'utf8')

      // Update lastOpenedFolder preference
      updateLastOpenedFolder(win, location)

      // Open new window with the project and close current window
      if (win) {
        ipcMain.emit('app-open-directory-by-id', win.id, location, false, true)
        win.close()
      }

      return { projectPath: location }
    } catch (err) {
      console.error('Project creation failed:', err)
      return { projectPath: null }
    }
  })

  ipcMain.handle('mt::project:load', async(e, args: ProjectLoadArgs = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const loadPath = args.path ? normalizePath(args.path) : await chooseDirectory(win)
    if (!loadPath || !isAllowedProjectPath(loadPath) || !isDirectory2(loadPath)) {
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
      const fsExtra = require('fs-extra')
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
      console.error('Project save-as failed:', err)
      return { success: false }
    }
  })

  ipcMain.handle('mt::project:validate', async(_e, path: string) => {
    return isValidProjectPath(path)
  })
}