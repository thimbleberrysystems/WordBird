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
  IAgentApplyEditRequest,
  AgentPermissionMode
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
      const message = error instanceof Error ? error.message : 'Failed to send message'
      // Auth failures read like line noise ("401 User not found…") — point
      // the writer at the actual fix.
      if (/\b401\b|\b403\b|User not found|MODEL_AUTHENTICATION|invalid[_ ]api[_ ]key/i.test(message)) {
        throw new Error(
          `Your API key was rejected by the provider (${message.slice(0, 120)}). ` +
          'Open Settings → AI and check the key for the selected provider.'
        )
      }
      throw new Error(message)
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

  ipcMain.handle('mt::ai:set-mode', async(_e, mode: AgentPermissionMode) => {
    if (mode === 'plan' || mode === 'ask' || mode === 'auto' || mode === 'full-auto') {
      langGraphManager.setPermissionMode(mode)
    }
    return { mode: langGraphManager.permissionMode }
  })

  ipcMain.handle('mt::ai:get-mode', async() => {
    return { mode: langGraphManager.permissionMode }
  })

  ipcMain.handle('mt::ai:approve', async(_e, approvalId: string, approved: boolean) => {
    return { handled: langGraphManager.resolveApproval(approvalId, approved) }
  })

  ipcMain.handle('mt::ai:cancel-agent', async(_e, agentId: string) => {
    return { cancelled: langGraphManager.cancelAgent(agentId) }
  })

  ipcMain.handle('mt::ai:pause-agent', async(_e, agentId: string) => {
    return { paused: langGraphManager.pauseAgent(agentId) }
  })

  ipcMain.handle('mt::ai:resume-agent', async(_e, agentId: string) => {
    return { resumed: langGraphManager.resumeAgent(agentId) }
  })

  ipcMain.handle('mt::ai:pause', async() => {
    return { paused: langGraphManager.pause() }
  })

  ipcMain.handle('mt::ai:resume', async() => {
    return { resumed: langGraphManager.resume() }
  })

  ipcMain.handle('mt::ai:steer', async(_e, text: string) => {
    return { queued: langGraphManager.steer(text) }
  })

  ipcMain.handle('mt::ai:compact-now', async() => {
    return langGraphManager.compactNow()
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
