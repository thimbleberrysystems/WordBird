import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOllama } from '@langchain/ollama'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, StateSchema, MessagesValue, CompiledStateGraph } from '@langchain/langgraph'
import type { AIProvider, IAIConfig, ILangGraphMessage, ILangGraphResponse } from '../shared/types/langgraph'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MODELS } from '../shared/types/langgraph'

// Define the shape of our graph state
const AgentState = new StateSchema({
  messages: MessagesValue
})

type AgentStateType = typeof AgentState.State

class LangGraphService {
  // Use unknown for complex library types that mismatch versions, as per design rules
  private _agent: unknown | null = null
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null

  public get isConnected(): boolean {
    return !!this._agent
  }

  public get currentProvider(): AIProvider | null {
    return this._currentProvider
  }

  async connect(config: IAIConfig): Promise<void> {
    const { provider, apiKey, baseUrl } = config
    this._currentProvider = provider
    this._currentModel = config.model || null

    console.log('[LangGraph] connect called, provider:', provider)

    try {
      // 1. Test connectivity and credentials FIRST
      console.log('[LangGraph] Fetching models to verify connection...')
      const models = await this.fetchModels(provider, apiKey, baseUrl)
      
      if (!models || models.length === 0) {
        throw new Error('No models returned. Please check your API key, Base URL, and network connection.')
      }
      console.log(`[LangGraph] Connection verified. Found ${models.length} models.`)

      // 2. Only build the model client and graph AFTER validation succeeds
      this._agent = null // reset just in case
      
      const modelClient = this._createChatModel(config)
      console.log('[LangGraph] Model client created successfully')
      
      this._agent = this._buildGraph(modelClient)
      console.log('[LangGraph] Agent compiled successfully')

    } catch (error) {
      console.error('[LangGraph] Connect error details:', error) // Log the full trace in console
      this.disconnect() // Ensure clean state on failure
      
      // Extract a readable error message
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to connect to ${provider}: ${errorMessage}`)
    }
  }

  setModel(model: string): void {
    this._currentModel = model
  }

  async sendMessage(messages: ILangGraphMessage[]): Promise<ILangGraphResponse> {
    console.log('[LangGraph] sendMessage called, agent:', !!this._agent, 'messages:', messages.length)
    
    if (!this._agent) {
      throw new Error('Not connected to any AI provider')
    }

    // Map unified messages to LangChain specific classes
    const langchainMessages = messages.map(msg => {
      switch (msg.role) {
        case 'system': return new SystemMessage(msg.content)
        case 'user': return new HumanMessage(msg.content)
        case 'assistant':
        case 'ai': return new AIMessage(msg.content)
        default: return new HumanMessage(msg.content)
      }
    })
    
    console.log('[LangGraph] Invoking agent with messages:', langchainMessages.length)

    // Invoke the LangGraph agent
    // Cast to any locally to allow invocation on unknown type while keeping class property safe
    const response = await (this._agent as any).invoke({ messages: langchainMessages })
    console.log('[LangGraph] Agent response:', JSON.stringify(response, null, 2))

    // Safely extract the content string from the final message
    const content = this._extractResponseContent(response)
    console.log('[LangGraph] Extracted content:', content)

    return {
      content,
      model: this._currentModel || this._currentProvider || 'unknown'
    }
  }

  disconnect(): void {
    this._agent = null
    this._currentProvider = null
    this._currentModel = null
  }

  // --- Private Helper Methods ---

  private _createChatModel(config: IAIConfig): BaseChatModel {
    const { provider, apiKey, baseUrl, model, temperature = 0.7, maxTokens = 1024 } = config

    switch (provider) {
      case 'openai':
        return new ChatOpenAI({
          apiKey,
          model: model || PROVIDER_DEFAULT_MODELS.openai,
          temperature,
          maxTokens,
          configuration: baseUrl ? { baseURL: baseUrl } : undefined
        }) as unknown as BaseChatModel

      case 'anthropic':
        return new ChatAnthropic({
          apiKey,
          model: model || PROVIDER_DEFAULT_MODELS.anthropic,
          temperature,
          maxTokens,
          // Use clientOptions for custom base URL if supported in this version
          clientOptions: baseUrl ? { baseURL: baseUrl } : undefined
        }) as unknown as BaseChatModel

      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey,
          modelName: model || PROVIDER_DEFAULT_MODELS.google,
          temperature,
          maxOutputTokens: maxTokens 
        }) as unknown as BaseChatModel

      case 'ollama':
        return new ChatOllama({
          baseUrl: baseUrl || PROVIDER_BASE_URLS.ollama,
          model: model || PROVIDER_DEFAULT_MODELS.ollama,
          temperature
        }) as unknown as BaseChatModel

      case 'openrouter':
        return new ChatOpenAI({
          apiKey,
          model: model || PROVIDER_DEFAULT_MODELS.openrouter,
          temperature,
          maxTokens,
          configuration: {
            baseURL: baseUrl || PROVIDER_BASE_URLS.openrouter
          }
        }) as unknown as BaseChatModel

      default:
        throw new Error(`Unsupported AI provider: ${provider}`)
    }
  }

  private _buildGraph(modelClient: BaseChatModel): unknown {
    const llmNode = async (state: AgentStateType) => {
      // Cast to any to handle internal LangChain message type mismatches between packages
      const response = await (modelClient as any).invoke(state.messages)
      return { messages: [response] }
    }

    return new StateGraph(AgentState)
      .addNode('llm', llmNode)
      .addEdge('__start__', 'llm')
      .addEdge('llm', '__end__')
      .compile()
  }

  private _extractResponseContent(response: unknown): string {
    const res = response as { messages?: Array<{ content: string | Array<{ text?: string, content?: string }> | { text?: string } }> }
    if (!res?.messages || res.messages.length === 0) return ''
    
    const lastMsg = res.messages[res.messages.length - 1]
    const content = lastMsg.content

    if (typeof content === 'string') {
      return content
    } 
    if (Array.isArray(content)) {
      return content.map((c) => (c as any).text || (c as any).content || String(c)).join('')
    }
    if ((content as any)?.text) {
      return (content as any).text
    }
    
    return String(content || '')
  }

  public async fetchModels(provider: AIProvider, apiKey?: string, baseUrl?: string): Promise<string[]> {
    // Helper to format endpoints dynamically
    const getUrl = (defaultUrl: string, customPath: string) => {
      if (baseUrl) {
        let url = baseUrl.trim().replace(/\/$/, '')
        if (!url.startsWith('http')) {
          url = `http://${url}`
        }
        return `${url}${customPath}`
      }
      return defaultUrl
    }

    try {
      console.log(`[LangGraph] fetchModels for ${provider} using base: ${baseUrl || 'default'}`)
      switch (provider) {
        case 'openai': {
          if (!apiKey) throw new Error('API key is required for OpenAI');
          const url = getUrl(`${PROVIDER_BASE_URLS.openai}/models`, '/models');
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          return data.data?.map((m: { id: string }) => m.id).filter((id: string) => id.includes('gpt')) || [];
        }

        case 'anthropic': {
          if (!apiKey) throw new Error('API key is required for Anthropic');
          const url = getUrl(`${PROVIDER_BASE_URLS.anthropic}/models`, '/models');
          const resp = await fetch(url, {
            headers: { 
              'x-api-key': apiKey, 
              'anthropic-version': '2023-06-01',
              // Anthropic strictly blocks browser requests. This header *might* help 
              // if Langchain/Anthropic SDK relies on it, but CORS may still apply.
              'anthropic-dangerously-allow-browser': 'true' 
            }
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          return data.data?.map((m: { id: string }) => m.id) || [];
        }

        case 'google': {
          if (!apiKey) throw new Error('API key is required for Google Gemini');
          // Google puts the key in the query string
          const base = baseUrl ? baseUrl.replace(/\/$/, '') : PROVIDER_BASE_URLS.google;
          const resp = await fetch(`${base}/v1beta/models?key=${apiKey}`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          return data.models?.map((m: { name: string }) => m.name.replace('models/', '')) || [];
        }

        case 'ollama': {
          const url = getUrl(PROVIDER_BASE_URLS.ollama, '/api/tags');
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          return data.models?.map((m: { name: string }) => m.name) || [];
        }

        case 'openrouter': {
          if (!apiKey) throw new Error('API key is required for OpenRouter');
          const url = getUrl(PROVIDER_BASE_URLS.openrouter, '/models');
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          return data.data?.map((m: { id: string }) => m.id) || [];
        }

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (err) {
      // DO NOT swallow the error. Log it and bubble it up to connect()
      console.error(`[LangGraph] fetchModels failed for ${provider}:`, err);
      throw err; 
    }
  }
}
export const langGraphService = new LangGraphService()