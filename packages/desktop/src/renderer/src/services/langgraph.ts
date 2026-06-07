import type { AIProvider, IAIConfig, ILangGraphMessage, ILangGraphResponse } from '@shared/types/langgraph'

class LangGraphService {
  private _isConnected: boolean = false
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null

  public get isConnected(): boolean {
    return this._isConnected
  }

  public get currentProvider(): AIProvider | null {
    return this._currentProvider
  }

  public get currentModel(): string | null {
    return this._currentModel
  }

  async connect(config: IAIConfig): Promise<void> {
    try {
      // Ensure config is POJO
      const cleanConfig = JSON.parse(JSON.stringify(config))
      await window.electron.ai.connect(cleanConfig)
      this._isConnected = true
      this._currentProvider = config.provider
      this._currentModel = config.model || null
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
  }

  async fetchModels(provider: AIProvider, apiKey: string, baseUrl?: string): Promise<string[]> {
    return await window.electron.ai.fetchModels(provider, apiKey, baseUrl)
  }

  async sendMessage(messages: ILangGraphMessage[]): Promise<ILangGraphResponse> {
    // Ensure data is POJO before sending over IPC to avoid "An object could not be cloned"
    const cleanMessages = JSON.parse(JSON.stringify(messages))
    return await window.electron.ai.sendMessage(cleanMessages)
  }

  setModel(model: string): void {
    this._currentModel = model
  }
}

export const langGraphService = new LangGraphService()
