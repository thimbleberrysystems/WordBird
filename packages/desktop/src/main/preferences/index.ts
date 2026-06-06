import fs from 'fs'
import path from 'path'
import Store from 'electron-store'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import log from 'electron-log'
import { isWindows } from '../config'
import { hasSameKeys } from '../utils'
import { getSupportedLanguages, isLanguageSupported } from 'common/i18n'
import { TypedEmitter } from '@shared/types/typedEmitter'
import type { IUserPreferences } from '@shared/types/preferences'
import schema from './schema.json'

const PREFERENCES_FILE_NAME = 'preferences'

// The Preference class extends EventEmitter but does not currently emit any
// events itself — keep the event map empty until concrete events are added.
type PreferenceEvents = Record<string, unknown[]>

// Structural subset of EnvPaths/AppPaths — only `preferencesPath` is read here.
interface AppPaths {
  readonly preferencesPath: string
}

class Preference extends TypedEmitter<PreferenceEvents> {
  public readonly preferencesPath: string
  public readonly hasPreferencesFile: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly store: Store<any>
  public readonly staticPath: string

  /**
   * @param paths The path instance.
   *
   * NOTE: This throws an exception when validation fails.
   */
  constructor(paths: AppPaths) {
    // TODO: Preferences should not loaded if global.MARKTEXT_SAFE_MODE is set.
    super()

    const { preferencesPath } = paths
    this.preferencesPath = preferencesPath
    this.hasPreferencesFile = fs.existsSync(
      path.join(this.preferencesPath, `./${PREFERENCES_FILE_NAME}.json`)
    )
    this.store = new Store({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: schema as any,
      name: PREFERENCES_FILE_NAME,
      migrations: {
        '0.18.6': (store) => {
          if (store.get('startUpAction') === 'lastState') {
            store.set('startUpAction', 'openLastFolder')
          }
        }
      },
      beforeEachMigration: (_store, context) => {
        log.info(`Preferences migration: ${context.fromVersion} -> ${context.toVersion}`)
      }
    })

    this.staticPath = path.join(global.__static, 'preference.json')
    this.init()
  }

  init = (): void => {
    let defaultSettings: Record<string, unknown> | null = null
    try {
      defaultSettings = JSON.parse(fs.readFileSync(this.staticPath, { encoding: 'utf8' }) || '{}')

      // Set best theme on first application start.
      if (nativeTheme.shouldUseDarkColors) {
        defaultSettings!.theme = 'dark'
      }

      // Set system language on first application start
      if (!this.hasPreferencesFile) {
        const systemLanguage = this._getSystemLanguage()
        if (systemLanguage) {
          defaultSettings!.language = systemLanguage
        }
      }
    } catch (err) {
      log.error(err)
    }

    if (!defaultSettings) {
      throw new Error('Can not load static preference.json file')
    }

    // I don't know why `this.store.size` is 3 when first load, so I just check file existed.
    if (!this.hasPreferencesFile) {
      this.store.set(defaultSettings)
    } else {
      // Because `this.getAll()` will return a plainObject, so we can not use `hasOwnProperty` method
      // const plainObject = () => Object.create(null)
      const userSetting = this.getAll() as Record<string, unknown>
      // Update outdated settings
      const requiresUpdate = !hasSameKeys(defaultSettings, userSetting)
      const userSettingKeys = Object.keys(userSetting)
      const defaultSettingKeys = Object.keys(defaultSettings)

      if (requiresUpdate) {
        // TODO(fxha): For performance reasons, we should try to replace 'electron-store' because
        //   it does multiple blocking I/O calls when changing entries. There is no transaction or
        //   async I/O available. The core reason we changed to it was JSON scheme validation.

        // Remove outdated settings
        for (const key of userSettingKeys) {
          if (!defaultSettingKeys.includes(key)) {
            delete userSetting[key]
            this.store.delete(key)
          }
        }

        // Add new setting options
        let addedNewEntries = false
        for (const key in defaultSettings) {
          if (!userSettingKeys.includes(key)) {
            addedNewEntries = true
            userSetting[key] = defaultSettings[key]
          }
        }
        if (addedNewEntries) {
          this.store.set(userSetting)
        }
      }
    }

    this._listenForIpcMain()
  }

  getAll(): IUserPreferences {
    return this.store.store as IUserPreferences
  }

  setDataCenter(dataCenter: DataCenter): void {
    this.dataCenter = dataCenter
  }

  setItem(key: string, value: unknown): void {
    if (key === 'aiConfigs' && this.dataCenter) {
      const aiConfigs = value as Record<string, any>
      for (const provider of Object.keys(aiConfigs)) {
        const config = aiConfigs[provider]
        // ONLY attempt to encrypt if there is an actual non-empty string to encrypt
        if (config && typeof config.apiKey === 'string' && config.apiKey.trim().length > 0) {
          // Move apiKey to DataCenter (keytar)
          try {
            this.dataCenter.setItem(`${provider}_apiKey`, config.apiKey)
            // Store empty string in preferences.json to keep schema valid but avoid duplication
            config.apiKey = ''
          } catch (err) {
            log.error(`[AI-Config] Failed to encrypt ${provider} key:`, err)
            // If encryption fails, we leave it as-is in the preference file 
            // rather than losing the user's key entirely.
          }
        }
      }
    }
    this.store.set(key, value)
    ipcMain.emit('broadcast-preferences-changed', { [key]: value })
  }

  getItem<T = unknown>(key: string): T {
    return this.store.get(key) as T
  }

  /**
   * Change multiple setting entries.
   *
   * @param settings A settings object or subset object with key/value entries.
   */
  setItems(settings: Record<string, unknown> | null | undefined): void {
    if (!settings) {
      log.error('Cannot change settings without entires: object is undefined or null.')
      return
    }

    Object.keys(settings).forEach((key) => {
      this.setItem(key, settings[key])
    })
  }

  getPreferredEol(): 'lf' | 'crlf' {
    const endOfLine = this.getItem<string>('endOfLine')
    if (endOfLine === 'lf') {
      return 'lf'
    }
    return endOfLine === 'crlf' || isWindows ? 'crlf' : 'lf'
  }

  exportJSON(): void {
    // todo
  }

  importJSON(): void {
    // todo
  }

  _listenForIpcMain(): void {
    ipcMain.on('mt::ask-for-user-preference', async (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (win) {
        const prefs = this.getAll()

        // Hydrate AI configs with encrypted keys from DataCenter
        if (this.dataCenter && prefs.aiConfigs) {
          for (const provider of Object.keys(prefs.aiConfigs)) {
            try {
              const apiKey = await this.dataCenter.getItem(`${provider}_apiKey`)
              if (apiKey) {
                prefs.aiConfigs[provider].apiKey = apiKey
              }
            } catch (err) {
              log.warn(`[AI-Config] Could not decrypt ${provider} key for hydration`)
            }
          }
        }

        win.webContents.send('mt::user-preference', prefs)
      }
    })
    ipcMain.on('mt::set-user-preference', (_e, settingsValue: Record<string, unknown>) => {
      this.setItems(settingsValue)
    })
    ipcMain.on('mt::cmd-toggle-autosave', () => {
      this.setItem('autoSave', !this.getItem('autoSave'))
    })

    // Note: dispatched via `ipcMain.emit(...)`. The payload arrives as the
    // first positional argument.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcMain.on('set-user-preference', (settings: any) => {
      this.setItems(settings as Record<string, unknown>)
    })
  }

  /**
   * Gets the system language, or null if it's not in the supported list
   * @returns Supported system language code or null
   */
  _getSystemLanguage(): string | null {
    try {
      // Get the system language
      const systemLocale = app.getLocale()
      log.info(`System locale detected: ${systemLocale}`)

      // Get the list of supported languages
      const supportedLanguages = getSupportedLanguages()

      // Directly match the full language code (e.g. zh-CN)
      if (isLanguageSupported(systemLocale)) {
        log.info(`Using system language: ${systemLocale}`)
        return systemLocale
      }

      // Attempt to match the primary part of the language (e.g. zh)
      const primaryLanguage = systemLocale.split('-')[0]!
      const matchedLanguage = supportedLanguages.find((lang) => lang.startsWith(primaryLanguage))

      if (matchedLanguage) {
        log.info(`Using matched language: ${matchedLanguage} for system locale: ${systemLocale}`)
        return matchedLanguage
      }

      log.info(`System language ${systemLocale} not supported, will use default language`)
      return null
    } catch (error) {
      log.error('Error detecting system language:', error)
      return null
    }
  }
}

export default Preference
