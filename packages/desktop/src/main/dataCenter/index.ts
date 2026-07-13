import fs from 'fs'
import path from 'path'
import { BrowserWindow, dialog, ipcMain, app, safeStorage } from 'electron'
import schema from './schema.json'
import Store from 'electron-store'
import log from 'electron-log'
import { ensureDirSync } from 'common/filesystem'
import { IMAGE_EXTENSIONS } from 'common/filesystem/paths'
import { TypedEmitter } from '@shared/types/typedEmitter'

const DATA_CENTER_NAME = 'dataCenter'

// API keys are stored via Electron safeStorage (DPAPI on Windows, Keychain
// on macOS, Chromium basic on Linux — pinned in main/index.ts so no OS
// keyring dialog ever appears). When safeStorage is unavailable the value
// falls back to light obfuscation: NOT encryption, it only keeps keys from
// being shoulder-surfed in the JSON file. Either way, nothing can ever
// lock the writer out — worst case a key is re-entered once.
const SECURE_SUFFIX = '__secure'
const FALLBACK_SUFFIX = '__insecureFallback'

export const obfuscate = (value: string): string =>
  Buffer.from(`wb1:${value}`, 'utf8').toString('base64')

export const deobfuscate = (value: string): string | null => {
  try {
    const raw = Buffer.from(value, 'base64').toString('utf8')
    return raw.startsWith('wb1:') ? raw.slice(4) : null
  } catch {
    return null
  }
}

// No events emitted directly on `this`. ipcMain.emit is used for cross-
// process broadcasts but those don't fire through this instance.
type DataCenterEvents = Record<string, unknown[]>

interface DataCenterPaths {
  dataCenterPath: string
  userDataPath: string
}

class DataCenter extends TypedEmitter<DataCenterEvents> {
  dataCenterPath: string
  userDataPath: string
  encryptKeys: string[]
  hasDataCenterFile: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: Store<any>

  constructor(paths: DataCenterPaths) {
    super()

    const { dataCenterPath, userDataPath } = paths
    this.dataCenterPath = dataCenterPath
    this.userDataPath = userDataPath
    this.encryptKeys = [
      'openai_apiKey',
      'anthropic_apiKey',
      'google_apiKey',
      'ollama_apiKey',
      'openrouter_apiKey',
      // Claude subscription setup-token (claude setup-token) — as much a
      // secret as any API key.
      'claude-code_apiKey'
    ]
    this.hasDataCenterFile = fs.existsSync(
      path.join(this.dataCenterPath, `./${DATA_CENTER_NAME}.json`)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.store = new Store<any>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: schema as any,
      name: DATA_CENTER_NAME
    })

    this.init()
  }

  init(): void {
    const defaultData = {
      imageFolderPath: path.join(this.userDataPath, 'images'),
      screenshotFolderPath: path.join(this.userDataPath, 'screenshot'),
      webImages: [],
      cloudImages: [],
      currentUploader: 'picgo'
    }

    if (!this.hasDataCenterFile) {
      this.store.set(defaultData)
      ensureDirSync(this.store.get('screenshotFolderPath') as string)
    } else {
      // Migrate legacy uploader values that no longer exist
      const stored = this.store.get('currentUploader') as string | undefined
      if (stored === 'none' || stored === 'github') {
        this.store.set('currentUploader', 'picgo')
      }
    }
    this._listenForIpcMain()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAll(): Promise<Record<string, any>> {
    const { encryptKeys } = this
    const data = this.store.store
    try {
      const encryptData = await Promise.all(
        encryptKeys.map((key) => this._readSecret(key))
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encryptObj = encryptKeys.reduce<Record<string, any>>((acc, k, i) => {
        return {
          ...acc,
          [k]: encryptData[i]
        }
      }, {})

      return Object.assign(data, encryptObj)
    } catch (err) {
      log.error('Failed to decrypt secure keys:', err)
      return data
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addImage(key: string, url: string): any {
    const items = this.store.get(key) as Array<{ url: string; timeStamp: number }>
    const alreadyHas = items.some((item) => item.url === url)
    let item
    if (alreadyHas) {
      item = items.find((it) => it.url === url)
      if (item) item.timeStamp = +new Date()
    } else {
      item = { url, timeStamp: +new Date() }
      items.push(item)
    }

    ipcMain.emit('broadcast-web-image-added', { type: key, item })
    return this.store.set(key, items)
  }

  removeImage(type: string, url: string): unknown {
    const items = this.store.get(type) as unknown[]
    const index = items.indexOf(url)
    const item = items[index]
    if (index === -1) return
    items.splice(index, 1)
    ipcMain.emit('broadcast-web-image-removed', { type, item })
    return this.store.set(type, items)
  }

  /** Read a secret: safeStorage first, legacy obfuscated fallback second. */
  private async _readSecret(key: string): Promise<string | null> {
    await app.whenReady()
    const secure = this.store.get(`${key}${SECURE_SUFFIX}`) as string | undefined
    if (secure) {
      try {
        return safeStorage.decryptString(Buffer.from(secure, 'base64'))
      } catch (err) {
        log.warn(`[dataCenter] Could not decrypt stored ${key}; falling back:`, err)
      }
    }
    const fallback = this.store.get(`${key}${FALLBACK_SUFFIX}`) as string | undefined
    return fallback ? deobfuscate(fallback) : null
  }

  private async _writeSecret(key: string, value: string): Promise<void> {
    await app.whenReady()
    if (safeStorage.isEncryptionAvailable()) {
      this.store.set(
        `${key}${SECURE_SUFFIX}`,
        safeStorage.encryptString(value).toString('base64')
      )
      this.store.delete(`${key}${FALLBACK_SUFFIX}`)
    } else {
      log.warn(
        `[dataCenter] safeStorage unavailable — storing ${key} with light obfuscation only`
      )
      this.store.set(`${key}${FALLBACK_SUFFIX}`, obfuscate(value))
      this.store.delete(`${key}${SECURE_SUFFIX}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getItem(key: string): Promise<any> | any {
    const { encryptKeys } = this
    if (encryptKeys.includes(key)) {
      return this._readSecret(key)
    } else {
      const value = this.store.get(key)
      return Promise.resolve(value)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async setItem(key: string, value: any): Promise<any> {
    const { encryptKeys } = this
    if (key === 'screenshotFolderPath') {
      ensureDirSync(value as string)
    }
    ipcMain.emit('broadcast-user-data-changed', { [key]: value })
    if (encryptKeys.includes(key)) {
      return this._writeSecret(key, String(value))
    } else {
      return this.store.set(key, value)
    }
  }

  /**
   * Change multiple setting entries.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setItems(settings: Record<string, any>): void {
    if (!settings) {
      log.error('Cannot change settings without entires: object is undefined or null.')
      return
    }

    Object.keys(settings).forEach((key) => {
      this.setItem(key, settings[key])
    })
  }

  _listenForIpcMain(): void {
    ipcMain.on('set-image-folder-path', (newPath) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.setItem('imageFolderPath', newPath as any)
    })

    ipcMain.on('mt::ask-for-user-data', async(e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      const userData = await this.getAll()
      win.webContents.send('mt::user-preference', userData)
    })

    ipcMain.on('mt::ask-for-modify-image-folder-path', async(e, imagePath?: string) => {
      if (!imagePath) {
        const win = BrowserWindow.fromWebContents(e.sender)
        if (!win) return
        const { filePaths } = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (filePaths && filePaths[0]) {
          imagePath = filePaths[0]
        }
      }
      if (imagePath) {
        this.setItem('imageFolderPath', imagePath)
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcMain.on('mt::set-user-data', (_e, userData: Record<string, any>) => {
      this.setItems(userData)
    })

    ipcMain.handle('mt::ask-for-image-path', async(e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return ''
      const { filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: [...IMAGE_EXTENSIONS]
          }
        ]
      })

      if (filePaths && filePaths[0]) {
        return filePaths[0]
      } else {
        return ''
      }
    })
  }
}

export default DataCenter
