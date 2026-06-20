import type {
  AIProvider,
  IAIConfig,
  ILangGraphMessage,
  ILangGraphResponse,
  IAgentToolCall,
  IAgentToolResult,
  IAgentApplyEditRequest
} from '@shared/types/langgraph'

const toIpc = <T>(v: T): T => JSON.parse(JSON.stringify(v))

class LangGraphService {
  private _isConnected: boolean = false
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null
  private _currentApiKey: string = ''

  public get isConnected(): boolean {
    return this._isConnected
  }

  public get currentProvider(): AIProvider | null {
    return this._currentProvider
  }

  public get currentModel(): string | null {
    return this._currentModel
  }

  public get currentApiKey(): string {
    return this._currentApiKey
  }

  async connect(config: IAIConfig): Promise<void> {
    try {
      const cleanConfig = toIpc(config)
      await window.electron.ai.connect(cleanConfig)
      this._isConnected = true
      this._currentProvider = config.provider
      this._currentModel = config.model || null
      this._currentApiKey = config.apiKey || ''
    } catch (error) {
      this._isConnected = false
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await window.electron.ai.disconnect()
    this._isConnected = false
    this._currentProvider = null
    this._currentModel = null
    this._currentApiKey = ''
  }

  async fetchModels(provider: AIProvider, apiKey: string, baseUrl?: string): Promise<string[]> {
    return await window.electron.ai.fetchModels(provider, apiKey, baseUrl)
  }

  async sendMessage(messages: ILangGraphMessage[]): Promise<ILangGraphResponse> {
    return await window.electron.ai.sendMessage(toIpc(messages))
  }

  async executeTool(call: IAgentToolCall): Promise<IAgentToolResult> {
    return await window.electron.ai.executeTool(toIpc(call))
  }

  async applyEdit(request: IAgentApplyEditRequest): Promise<{ ok: boolean; error?: string }> {
    return await window.electron.ai.applyEdit(toIpc(request))
  }

  async applyEditInRenderer(request: IAgentApplyEditRequest): Promise<{ ok: boolean; error?: string }> {
    return await window.electron.ai.applyEditInRenderer(toIpc(request))
  }

  async abort(): Promise<void> {
    await window.electron.ai.abort()
  }

  async pullModel(model: string, baseUrl?: string): Promise<void> {
    await window.electron.ai.pullModel(model, baseUrl)
  }

  onPullProgress(handler: (progress: { percent?: number; status?: string; digest?: string }) => void): () => void {
    return window.electron.ai.onPullProgress(handler)
  }

  setModel(model: string): void {
    this._currentModel = model
  }
}

export const langGraphService = new LangGraphService()
