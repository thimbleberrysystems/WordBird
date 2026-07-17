import { registerBootInfo } from './bootInfo'
import { registerFsHandlers } from './fs'
import { registerPathHandlers } from './paths'
import { registerRipgrepHandlers } from './ripgrep'
import { registerFontsHandlers } from './fonts'
import { registerShellHandlers } from './shell'
import { registerWindowHandlers } from './window'
import { registerI18nHandlers } from './i18n'
import { registerProjectHandlers } from './project'
import { registerNovelHandlers } from './novel'
import { registerAIHandlers } from './ai'

export const registerSandboxIpcHandlers = (): void => {
  registerBootInfo()
  registerFsHandlers()
  registerPathHandlers()
  registerRipgrepHandlers()
  registerFontsHandlers()
  registerShellHandlers()
  registerWindowHandlers()
  registerI18nHandlers()
  registerProjectHandlers()
  registerNovelHandlers()
  registerAIHandlers()
}
