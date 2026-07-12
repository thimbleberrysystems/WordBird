import type { BrowserWindow } from 'electron'
import { COMMANDS, type CommandManager, type CommandCallback } from './index'
import { openFile, openFolder } from '../menu/actions/file'

const openQuickOpenDialog = (win: BrowserWindow | null | undefined): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::execute-command-by-id', 'file.quick-open')
  }
}

export const loadFileCommands = (commandManager: CommandManager): void => {
  commandManager.add(COMMANDS.FILE_QUICK_OPEN, openQuickOpenDialog as CommandCallback)
  // Same actions the File menu and command palette use — registering them
  // here keeps the keybinding dispatch path working and silences the
  // startup "[DEBUG] Default command … isn't available!" verification.
  commandManager.add(COMMANDS.FILE_OPEN_FILE, ((win: BrowserWindow | null) =>
    openFile(win)) as CommandCallback)
  commandManager.add(COMMANDS.FILE_OPEN_FOLDER, ((win: BrowserWindow | null) =>
    openFolder(win)) as CommandCallback)
}
