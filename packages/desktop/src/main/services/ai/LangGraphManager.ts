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

  public get isConnected(): boolean {
    return !!this._agent
  }

  public get currentProvider(): AIProvider | null {
    return this._currentProvider
  }

  public get currentModel(): string | null {
    return this._currentModel
  }

  async connect(config: IAIConfig): Promise<void> {
    const { provider, apiKey, baseUrl } = config
    this._currentProvider = provider
    this._currentModel = config.model || null

    console.log('[LangGraphMain] connect called, provider:', provider)

    try {
      // 1. Test connectivity and credentials FIRST
      console.log('[LangGraphMain] Fetching models to verify connection...')
      const models = await this.fetchModels(provider, apiKey, baseUrl)
      
      if (!models || models.length === 0) {
        throw new Error('No models returned. Please check your API key, Base URL, and network connection.')
      }
      console.log(`[LangGraphMain] Connection verified. Found ${models.length} models.`)

      // 2. Only build the model client and graph AFTER validation succeeds
      this._agent = null 
      
      const modelClient = this._createChatModel(config)
      console.log('[LangGraphMain] Model client created successfully')
      
      this._agent = this._buildGraph(modelClient)
      console.log('[LangGraphMain] Agent compiled successfully')

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
      if (provider === 'openai' || provider === 'ollama' || provider === 'openrouter') {
        const url = provider === 'ollama' ? `${actualBaseUrl}/api/tags` : `${actualBaseUrl}/models`
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
        return ['gemini-1.5-pro', 'gemini-1.5-flash']
      }
      return []
    } catch (error) {
      console.error(`[LangGraphMain] Error fetching models for ${provider}:`, error)
      return []
    }
  }

  async sendMessage(messages: ILangGraphMessage[]): Promise<ILangGraphResponse> {
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

    const response = await this._agent.invoke({ messages: langchainMessages })
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
          model: targetModel 
        }) as unknown as BaseChatModel

      case 'ollama':
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
