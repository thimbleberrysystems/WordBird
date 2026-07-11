import { app, ipcMain } from 'electron'
import log from 'electron-log'
import { langGraphManager } from '../services/ai/LangGraphManager'
import { writeMarkdownFileWithDefaults } from '../filesystem/markdown'
import type {
  AIProvider,
  IAIConfig,
  ILangGraphMessage,
  IAgentToolCall,
  IAgentToolResult,
  IAgentApplyEditRequest
} from '../../shared/types/langgraph'

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
        throw new Error('Request aborted')
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

  ipcMain.handle('mt::ai:reset-thread', async() => {
    return { threadId: langGraphManager.resetThread() }
  })

  // Durable agent threads: make sure buffered checkpoints reach disk.
  app.on('will-quit', () => {
    langGraphManager.flushCheckpoints()
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

  ipcMain.handle('mt::ai:execute-tool', async(_e, call: IAgentToolCall): Promise<IAgentToolResult> => {
    try {
      return await langGraphManager.executeTool(call)
    } catch (error: unknown) {
      return {
        id: call.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      }
    }
  })

  ipcMain.handle('mt::ai:apply-edit', async(_e, request: IAgentApplyEditRequest) => {
    return await langGraphManager.applyEdit(request)
  })

  // Write an AI edit straight to disk — used by the global "Apply All" for
  // files that are not open in the editor.
  ipcMain.handle(
    'mt::ai:write-file',
    async(_e, pathname: string, content: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (!pathname) throw new Error('No file path provided')
        await writeMarkdownFileWithDefaults(pathname, content)
        return { ok: true }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to write file'
        log.error('[AI] write-file failed:', message)
        return { ok: false, error: message }
      }
    }
  )
}
