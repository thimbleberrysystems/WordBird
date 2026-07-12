import type {
  AIProvider,
  IAIConfig,
  ILangGraphMessage,
  ILangGraphResponse,
  IAgentToolCall,
  IAgentToolResult
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

  // Concurrent identical connects collapse into one: at startup several
  // watchers hydrate preferences at once and each passed the "already
  // connected" guard while the FIRST handshake was still in flight —
  // main ended up rebuilding the whole AI stack six times.
  private _inflightConnect: { key: string; promise: Promise<void> } | null = null

  async connect(config: IAIConfig): Promise<void> {
    const key = `${config.provider}|${config.model ?? ''}|${config.apiKey ?? ''}|${config.baseUrl ?? ''}`
    if (this._inflightConnect?.key === key) {
      return this._inflightConnect.promise
    }
    const promise = (async(): Promise<void> => {
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
      } finally {
        if (this._inflightConnect?.key === key) this._inflightConnect = null
      }
    })()
    this._inflightConnect = { key, promise }
    return promise
  }

  /**
   * Main is the source of truth for connection state — every transition
   * (connect success, failure, disconnect) is broadcast and mirrored here
   * so the redundant-connect guard can never go stale and block a
   * reconnect.
   */
  applyMainState(state: { connected: boolean; provider: string | null; model: string | null }): void {
    this._isConnected = state.connected
    if (!state.connected) {
      this._currentProvider = null
      this._currentModel = null
      this._currentApiKey = ''
    } else {
      this._currentProvider = (state.provider as typeof this._currentProvider) ?? this._currentProvider
      this._currentModel = state.model ?? this._currentModel
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
