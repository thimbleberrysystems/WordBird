/**
 * Detached Biscuit window: the chat panel in its own resizable window so
 * the writer gets the full editor width back. A singleton — detaching
 * again focuses the existing window. Closing it tells every editor window
 * to bring the docked panel back (`mt::ai:biscuit-reattach`).
 */

import path from 'path'
import { BrowserWindow } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'
import log from 'electron-log'
import windowStateKeeper from 'electron-window-state'
import { isLinux, isOsx } from '../config'

let biscuitWindow: BrowserWindow | null = null

export interface BiscuitWindowOptions {
  conversationId?: string
  projectRoot?: string
}

const broadcastReattach = (): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mt::ai:biscuit-reattach', {})
  }
}

export const openBiscuitWindow = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accessor: any,
  options: BiscuitWindowOptions = {}
): BrowserWindow => {
  if (biscuitWindow && !biscuitWindow.isDestroyed()) {
    biscuitWindow.focus()
    return biscuitWindow
  }

  const { env, preferences } = accessor
  const { theme, titleBarStyle } = preferences.getAll()

  // Remember the writer's chosen size/position across detaches.
  const savedState = windowStateKeeper({
    defaultWidth: 520,
    defaultHeight: 780,
    file: 'biscuit-window-state.json'
  })

  const winOptions: BrowserWindowConstructorOptions = {
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 360,
    minHeight: 480,
    resizable: true,
    useContentSize: true,
    show: true,
    title: 'Biscuit',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  }
  if (!isOsx && titleBarStyle === 'native') {
    winOptions.frame = true
  }
  if (isLinux) {
    winOptions.icon = path.join(
      (global as unknown as { __static: string }).__static,
      'logo-96px.png'
    )
  }

  const win = new BrowserWindow(winOptions)
  savedState.manage(win)
  biscuitWindow = win

  const baseUrl =
    process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']
      ? process.env['ELECTRON_RENDERER_URL']
      : `file://${path.join(__dirname, '../renderer/index.html')}`
  const url = new URL(baseUrl)
  url.searchParams.set('udp', env.paths.userDataPath)
  url.searchParams.set('debug', env.debug ? '1' : '0')
  url.searchParams.set('wid', String(win.id))
  url.searchParams.set('type', 'biscuit')
  url.searchParams.set('theme', theme)
  if (options.conversationId) url.searchParams.set('conv', options.conversationId)
  if (options.projectRoot) url.searchParams.set('root', options.projectRoot)

  win.loadURL(url.toString())
  win.webContents.setIgnoreMenuShortcuts(true)

  win.webContents.on('did-fail-load', (_event, code, desc, failedUrl) => {
    log.error(`[biscuit-window] did-fail-load ${code} ${desc} @ ${failedUrl}`)
  })

  win.on('closed', () => {
    biscuitWindow = null
    broadcastReattach()
  })

  return win
}
