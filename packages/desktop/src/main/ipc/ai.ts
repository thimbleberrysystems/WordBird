import { ipcMain } from 'electron'
import { langGraphManager } from '../services/ai/LangGraphManager'
import type { AIProvider, IAIConfig, ILangGraphMessage } from '../../shared/types/langgraph'

export const registerAIHandlers = (): void => {
  ipcMain.handle('mt::ai:connect', async (_e, config: IAIConfig) => {
    try {
      return await langGraphManager.connect(config)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to connect')
    }
  })

  ipcMain.handle('mt::ai:disconnect', async () => {
    return langGraphManager.disconnect()
  })

  ipcMain.handle('mt::ai:send-message', async (_e, messages: ILangGraphMessage[]) => {
    try {
      return await langGraphManager.sendMessage(messages)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to send message')
    }
  })

  ipcMain.handle('mt::ai:fetch-models', async (_e, provider: AIProvider, apiKey: string, baseUrl?: string) => {
    try {
      return await langGraphManager.fetchModels(provider, apiKey, baseUrl)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to fetch models')
    }
  })
}
