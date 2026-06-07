import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOllama } from '@langchain/ollama'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, StateSchema, MessagesValue } from '@langchain/langgraph'
import type { AIProvider, IAIConfig, ILangGraphMessage, ILangGraphResponse } from '../../../shared/types/langgraph'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MODELS } from '../../../shared/constants/ai'
import axios from 'axios'

// Define the shape of our graph state
const AgentState = new StateSchema({
  messages: MessagesValue
})

export class LangGraphManager {
  private _agent: any | null = null
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null
  private _currentAbortController: AbortController | null = null

  public get isConnected(): boolean {
    return !!this._agent
  }

  public get currentProvider(): AIProvider | null {
    return this._currentProvider
  }

  public get currentModel(): string | null {
    return this._currentModel
  }

  setCurrentAbortController(controller: AbortController): void {
    this._currentAbortController = controller
  }

  clearAbortController(): void {
    this._currentAbortController = null
  }

  abort(): void {
    if (this._currentAbortController) {
      this._currentAbortController.abort()
      this._currentAbortController = null
    }
  }

  async connect(config: IAIConfig): Promise<void> {
    const { provider, apiKey, baseUrl } = config
    this._currentProvider = provider
    this._currentModel = config.model || null

    try {
      // 1. Test connectivity and credentials FIRST
      const models = await this.fetchModels(provider, apiKey, baseUrl)
      
      if (models && models.length > 0) {
        // Models found
      } else {
        // For Ollama providers, models list may be empty but we can still proceed
        // For other providers, we'll still try to connect - the model client will validate
      }

      // 2. Only build the model client and graph AFTER validation succeeds
      this._agent = null 
      
      const modelClient = this._createChatModel(config)
      
      this._agent = this._buildGraph(modelClient)

    } catch (error) {
      console.error('[LangGraphMain] Connect error details:', error)
      this.disconnect()
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to connect to ${provider}: ${errorMessage}`)
    }
  }

  disconnect(): void {
    this._agent = null
    this._currentProvider = null
    this._currentModel = null
  }

  async fetchModels(provider: AIProvider, apiKey: string, baseUrl?: string): Promise<string[]> {
    const actualBaseUrl = baseUrl || PROVIDER_BASE_URLS[provider]
    
    try {
      if (provider === 'openai' || provider === 'ollama' || provider === 'ollama_bundled' || provider === 'openrouter') {
        const url = (provider === 'ollama' || provider === 'ollama_bundled') ? `${actualBaseUrl}/api/tags` : `${actualBaseUrl}/models`
        const headers = (provider === 'openai' || provider === 'openrouter') ? { Authorization: `Bearer ${apiKey}` } : {}
        
        const response = await axios.get(url, { headers })
        
        if (provider === 'openai' || provider === 'openrouter') {
          // OpenRouter and OpenAI share the same /models structure
          return response.data.data
            .map((m: any) => m.id)
            .filter((id: string) => {
              if (provider === 'openai') {
                return id.startsWith('gpt') || id.startsWith('o1')
              }
              return true // OpenRouter models vary wildy
            })
        } else {
          return response.data.models.map((m: any) => m.name)
        }
      } else if (provider === 'anthropic') {
        if (!apiKey) return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
        const url = `${actualBaseUrl}/models`
        const response = await axios.get(url, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        })
        return response.data.data?.map((m: any) => m.id) || []
      } else if (provider === 'google') {
        if (!apiKey) {
          throw new Error('API Key is required for Google Gemini')
        }
        // Google Generative AI doesn't have a simple REST endpoint for models that is easily accessible without the SDK
        // but we can use the hardcoded list while ensuring the key exists, 
        // OR better, we just return the hardcoded list if the key is present.
        // For a more robust check, we'd need to hit a discovery endpoint:
        // https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          await axios.get(url)
          return ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash-exp']
        } catch (error) {
          console.error('[LangGraphMain] Google model verification failed:', error)
          throw new Error('Invalid Google API Key or connection issue')
        }
      }
      return []
    } catch (error) {
      console.error(`[LangGraphMain] Error fetching models for ${provider}:`, error)
      return []
    }
  }

  /**
   * Pull an Ollama model via the REST API with streaming progress.
   * Used when a user enters a model name that does not exist locally.
   * Emits progress events via IPC to the renderer.
   */
  public async pullModel(model: string, baseUrl?: string): Promise<void> {
    const actualBaseUrl = baseUrl || PROVIDER_BASE_URLS.ollama
    const url = `${actualBaseUrl}/api/pull`
    console.log(`[LangGraphMain] Pulling model ${model} from ${actualBaseUrl}`)
    
    try {
      const response = await axios.post(url, { name: model, stream: true }, {
        responseType: 'stream'
      })
      
      // Process the streaming response
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((l: string) => l.trim())
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            // Emit progress to renderer
            const { BrowserWindow } = await import('electron')
            const mainWindow = BrowserWindow.getAllWindows()[0]
            if (mainWindow) {
              mainWindow.webContents.send('mt::ai:pull-progress', {
                percent: data.percent,
                status: data.status,
                digest: data.digest
              })
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }
      console.log(`[LangGraphMain] Model ${model} pulled successfully`)
    } catch (error: any) {
      console.error(`[LangGraphMain] Failed to pull model ${model}:`, error)
      throw new Error(error.response?.data?.error || error.message || 'Failed to pull model')
    }
  }

  async sendMessage(messages: ILangGraphMessage[], signal?: AbortSignal): Promise<ILangGraphResponse> {
    if (!this._agent) {
      throw new Error('Not connected to any AI provider')
    }

    const langchainMessages = messages.map(msg => {
      switch (msg.role) {
        case 'system': return new SystemMessage(msg.content)
        case 'user': return new HumanMessage(msg.content)
        case 'assistant':
        case 'ai': return new AIMessage(msg.content)
        default: return new HumanMessage(msg.content)
      }
    })

    const response = await this._agent.invoke({ messages: langchainMessages }, { signal })
    const content = this._extractResponseContent(response)

    return {
      content,
      model: this._currentModel || this._currentProvider || 'unknown'
    }
  }

  private _createChatModel(config: IAIConfig): BaseChatModel {
    const { provider, apiKey, baseUrl, model, temperature, maxTokens } = config
    const targetModel = model || PROVIDER_DEFAULT_MODELS[provider]
    
    const common = {
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2048,
    }

    switch (provider) {
      case 'openai':
        return new ChatOpenAI({ 
          ...common, 
          apiKey,
          model: targetModel,
          configuration: { baseURL: baseUrl || PROVIDER_BASE_URLS.openai } 
        }) as unknown as BaseChatModel
      
      case 'openrouter':
        return new ChatOpenAI({ 
          ...common, 
          apiKey,
          model: targetModel,
          configuration: { baseURL: baseUrl || PROVIDER_BASE_URLS.openrouter } 
        }) as unknown as BaseChatModel

      case 'anthropic':
        return new ChatAnthropic({ 
          ...common, 
          apiKey,
          anthropicApiKey: apiKey, // Some versions use this
          model: targetModel 
        }) as unknown as BaseChatModel

      case 'google':
        return new ChatGoogleGenerativeAI({ 
          ...common, 
          apiKey,
          // Some versions of the LangChain Google GenAI package expect googleApiKey
          googleApiKey: apiKey,
          model: targetModel,
          // Google Gemini uses maxOutputTokens instead of maxTokens in some underlying SDKs
          maxOutputTokens: common.maxTokens 
        }) as unknown as BaseChatModel

      case 'ollama':
      case 'ollama_bundled':
        return new ChatOllama({ 
          ...common,
          model: targetModel,
          baseUrl: baseUrl || PROVIDER_BASE_URLS.ollama 
        }) as unknown as BaseChatModel

      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }

  private _buildGraph(model: BaseChatModel) {
    const workflow = new StateGraph(AgentState)
      .addNode('agent', async (state) => {
        const response = await model.invoke(state.messages)
        return { messages: [response] }
      })
      .addEdge('__start__', 'agent')
      .addEdge('agent', '__end__')

    return workflow.compile()
  }

  private _extractResponseContent(response: any): string {
    if (!response || !response.messages || response.messages.length === 0) {
      return ''
    }
    const lastMessage = response.messages[response.messages.length - 1]
    const content = lastMessage.content

    if (typeof content === 'string') {
      return content
    }
    
    if (Array.isArray(content)) {
      return content
        .map(item => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'text' in item) return item.text
          return ''
        })
        .join('')
    }

    return String(content || '')
  }
}

export const langGraphManager = new LangGraphManager()
