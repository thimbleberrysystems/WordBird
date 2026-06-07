import { ipcMain } from 'electron'
import { langGraphManager } from '../services/ai/LangGraphManager'
import type { AIProvider, IAIConfig, ILangGraphMessage } from '../../shared/types/langgraph'

export const registerAIHandlers = (): void => {
  ipcMain.handle('mt::ai:connect', async(_e, config: IAIConfig) => {
    try {
      return await langGraphManager.connect(config)
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : 'Failed to connect')
    }
  })

  ipcMain.handle('mt::ai:disconnect', async() => {
    return langGraphManager.disconnect()
  })

  ipcMain.handle('mt::ai:send-message', async(e, messages: ILangGraphMessage[]) => {
    try {
      // Create a signal that can be aborted via mt::ai:abort
      const controller = new AbortController()
      langGraphManager.setCurrentAbortController(controller)

      // Also abort if the renderer destroys the web contents
      e.sender.once('destroyed', () => controller.abort())

      return await langGraphManager.sendMessage(messages, controller.signal)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('A pigeon flew off with the breadcrumbs. Request aborted.')
      }
      throw new Error(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      langGraphManager.clearAbortController()
    }
  })

  ipcMain.handle('mt::ai:abort', async() => {
    langGraphManager.abort()
    return { success: true }
  })

  ipcMain.handle('mt::ai:fetch-models', async(_e, provider: AIProvider, apiKey: string, baseUrl?: string) => {
    try {
      return await langGraphManager.fetchModels(provider, apiKey, baseUrl)
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch models')
    }
  })

  ipcMain.handle('mt::ai:pull-model', async(_e, model: string, baseUrl?: string) => {
    try {
      await langGraphManager.pullModel(model, baseUrl)
      return { success: true }
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : 'Failed to pull model')
    }
  })
}
