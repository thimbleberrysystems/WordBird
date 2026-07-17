import fs from 'fs'
import { ipcMain, shell, clipboard } from 'electron'
import log from 'electron-log'
import plist from 'plist'

/**
 * Renderer-supplied URLs may only open web/mail targets. Anything else
 * (file:, smb:, custom protocol handlers) is a local-execution primitive
 * a compromised renderer must not reach. Mirrors the chat-markdown anchor
 * guard, enforced here so main is the authority, not renderer callers.
 */
export const isAllowedExternalUrl = (url: string): boolean => {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * mt::shell::open-path exists for exactly one renderer flow: revealing the
 * image-save FOLDER from preferences. shell.openPath on a file launches it
 * with the default handler — an execution primitive with no caller — so
 * only real directories pass. Returns null when ok, an error string when not.
 */
export const validateOpenPath = (fullPath: string): string | null => {
  try {
    const real = fs.realpathSync(fullPath)
    if (!fs.statSync(real).isDirectory()) return 'Only directories can be opened'
    return null
  } catch {
    return 'Path does not exist'
  }
}

export const registerShellHandlers = (): void => {
  ipcMain.handle('mt::shell::open-external', async(_e, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      log.warn('shell.openExternal blocked non-web URL:', url)
      return false
    }
    try {
      await shell.openExternal(url)
      return true
    } catch (err) {
      log.error('shell.openExternal failed:', err)
      return false
    }
  })
  ipcMain.on('mt::shell::open-external', (_e, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      log.warn('shell.openExternal blocked non-web URL:', url)
      return
    }
    shell.openExternal(url).catch((err) => log.error('shell.openExternal failed:', err))
  })
  ipcMain.on('mt::shell::show-item', (_e, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath)
    } catch (err) {
      log.error('shell.showItemInFolder failed:', err)
    }
  })
  ipcMain.handle('mt::shell::open-path', async(_e, fullPath: string) => {
    const invalid = validateOpenPath(fullPath)
    if (invalid) {
      log.warn('shell.openPath blocked:', fullPath, invalid)
      return invalid
    }
    try {
      return await shell.openPath(fullPath)
    } catch (err) {
      log.error('shell.openPath failed:', err)
      return String(err instanceof Error ? err.message : err)
    }
  })

  ipcMain.on('mt::clipboard::write-text', (_e, text: string) => {
    try {
      clipboard.writeText(text)
    } catch (err) {
      log.error('clipboard.writeText failed:', err)
    }
  })
  ipcMain.handle('mt::clipboard::read-text', () => {
    try {
      return clipboard.readText()
    } catch {
      return ''
    }
  })

  ipcMain.handle('mt::clipboard::guess-file-path', () => {
    try {
      if (process.platform === 'darwin') {
        if (clipboard.has('NSFilenamesPboardType')) {
          const parsed = plist.parse(clipboard.read('NSFilenamesPboardType'))
          return Array.isArray(parsed) && parsed.length ? parsed[0] : ''
        }
        return ''
      }
      if (process.platform === 'win32') {
        const raw = clipboard.read('FileNameW')
        const filePath = raw ? raw.replace(new RegExp(String.fromCharCode(0), 'g'), '') : ''
        return typeof filePath === 'string' ? filePath : ''
      }
      return ''
    } catch (err) {
      log.error('clipboard.guess-file-path failed:', err)
      return ''
    }
  })
}
