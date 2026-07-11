import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Runnable } from '@langchain/core/runnables'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import type {
  IAIConfig,
  ILangGraphMessage,
  ILangGraphResponse,
  IAgentToolCall,
  IAgentToolResult,
  IAgentApplyEditRequest
} from '../../../shared/types/langgraph'
import type { AIProvider } from '../../../shared/constants/ai'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MODELS } from '../../../shared/constants/ai'
import axios from 'axios'
import { AgentToolService, AgentToolPackLoader } from './AgentToolService'
import { registerBuiltInAgentToolHandlers } from './AgentToolHandlers'
import { getActiveAgentProjectRoot, setAgentToolAccessor } from './AgentProjectRootResolver'
import { FileCheckpointSaver } from './FileCheckpointSaver'
import type Accessor from '../../app/accessor'

type CompiledAgent = {
  invoke: (
    state: { messages: unknown[] },
    opts?: {
      signal?: AbortSignal
      recursionLimit?: number
      configurable?: Record<string, unknown>
    }
  ) => Promise<unknown>
}

const buildBiscuitSystemPrompt = (toolDescriptions: string): string =>
  'You are Biscuit, an AI assistant integrated into WordBird markdown editor. ' +
  'You have access to these tools:\n\n' +
  toolDescriptions +
  '\n\nCRITICAL INSTRUCTIONS:\n' +
  '1. When the user asks you to write or modify a file, use the propose_project_file_edit tool.\n' +
  '2. ALWAYS use read_project_file first to check existing content before proposing changes.\n' +
  '3. After you propose an edit, IMMEDIATELY STOP calling tools and provide a natural language response.\n' +
  '4. NEVER call tools again after proposing an edit - the user will see the diff and can apply it.\n' +
  '5. If you already proposed an edit, just respond with a summary - do NOT call any more tools.\n\n' +
  'Example response after proposing an edit:\n' +
  '"I\'ve shortened the README.md file. The changes have been proposed and are ready for your review. Click Apply to accept them."'

export class LangGraphManager {
  private _agent: CompiledAgent | null = null
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null
  private _currentAbortController: AbortController | null = null
  private _agentToolService: AgentToolService = new AgentToolService()
  private _systemPromptAdded: boolean = false
  private _editProposed: boolean = false
  private _checkpointer: FileCheckpointSaver | null = null
  private _threadId: string | null = null

  /**
   * Durable agent state lives inside the project (`.wordbird/agent-state/`,
   * excluded from snapshots) so threads follow the novel; without a project
   * it falls back to the app's userData directory.
   */
  private _agentStateDir(): string {
    const projectRoot = getActiveAgentProjectRoot()
    if (projectRoot) {
      return path.join(projectRoot, '.wordbird', 'agent-state')
    }
    return path.join(app.getPath('userData'), 'agent-state')
  }

  private _sessionPath(): string {
    return path.join(this._agentStateDir(), 'session.json')
  }

  private _loadOrCreateThreadId(): string {
    try {
      const raw = fs.readFileSync(this._sessionPath(), 'utf8')
      const parsed = JSON.parse(raw) as { threadId?: unknown }
      if (typeof parsed.threadId === 'string' && parsed.threadId) {
        return parsed.threadId
      }
    } catch {
      // First run for this project — fall through and create one.
    }
    return this._persistNewThreadId()
  }

  private _persistNewThreadId(): string {
    const threadId = `biscuit-${crypto.randomUUID()}`
    try {
      fs.mkdirSync(this._agentStateDir(), { recursive: true })
      fs.writeFileSync(this._sessionPath(), JSON.stringify({ threadId }), 'utf8')
    } catch (error) {
      log.warn('[LangGraphMain] Failed to persist thread id:', error)
    }
    return threadId
  }

  /** Start a fresh conversation thread (old checkpoints are kept on disk). */
  resetThread(): string {
    this._threadId = this._persistNewThreadId()
    this._systemPromptAdded = false
    this._editProposed = false
    return this._threadId
  }

  flushCheckpoints(): void {
    this._checkpointer?.flush()
  }

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

  setAccessor(accessor: Accessor): void {
    setAgentToolAccessor(accessor)
  }

  private _getMainWindow(): BrowserWindow | null {
    return BrowserWindow.getAllWindows()[0] ?? null
  }

  private async _loadToolPacks(): Promise<void> {
    registerBuiltInAgentToolHandlers(this._agentToolService)

    const loader = new AgentToolPackLoader(this._agentToolService.getKnownHandlerIds())

    const bundledPackPath = path.join(global.__static, 'agentTools.json')
    log.info('[LangGraphMain] Loading bundled tool pack from:', bundledPackPath)
    try {
      const bundledPack = await loader.loadPackIfPresent(bundledPackPath)
      if (bundledPack) {
        log.info('[LangGraphMain] Bundled tool pack loaded, enabled:', bundledPack.enabled, 'tools:', bundledPack.tools.length)
        this._agentToolService.loadToolPack(bundledPack)
      } else {
        log.warn('[LangGraphMain] Bundled tool pack not found or not present')
      }
    } catch (err) {
      log.warn('[LangGraphMain] Failed to load bundled agent tools:', err)
    }

    const projectRoot = getActiveAgentProjectRoot()
    if (projectRoot) {
      const projectPackPath = path.join(projectRoot, '.wordbird', 'agent-tools.json')
      try {
        const projectPack = await loader.loadPackIfPresent(projectPackPath)
        if (projectPack) {
          this._agentToolService.loadToolPack(projectPack)
        }
      } catch (err) {
        log.warn('[LangGraphMain] Failed to load project agent tools:', err)
      }
    }

    this._agentToolService.setProjectRoot(projectRoot)
  }

  async connect(config: IAIConfig): Promise<void> {
    const { provider, apiKey, baseUrl } = config
    this._currentProvider = provider
    this._currentModel = config.model || null

    try {
      await this.fetchModels(provider, apiKey, baseUrl)

      await this._loadToolPacks()
      this._agentToolService.setEditProposalEmitter(async(proposal) => {
        log.debug('[LangGraphMain] ToolNode edit proposal emitter received:', proposal)
        const mainWindow = this._getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send('mt::ai:edit-proposal', proposal)
        } else {
          log.warn('[LangGraphMain] No main window available for ToolNode edit proposal')
        }
      })

      this._agent = null

      // Durable thread state: checkpoints persist under the active project
      // so long agent runs survive an app restart and resume.
      this._checkpointer = new FileCheckpointSaver(
        path.join(this._agentStateDir(), 'checkpoints.json')
      )
      this._threadId = this._loadOrCreateThreadId()

      const modelClient = this._createChatModel(config)
      const tools = this._agentToolService.getLangChainTools()
      const modelWithTools =
        tools.length && modelClient.bindTools ? modelClient.bindTools(tools) : modelClient

      this._agent = this._buildGraph(modelWithTools as Runnable, tools)
    } catch (error) {
      log.error('[LangGraphMain] Connect error details:', error)
      this.disconnect()
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to connect to ${provider}: ${errorMessage}`)
    }
  }

  disconnect(): void {
    this._checkpointer?.flush()
    this._agent = null
    this._currentProvider = null
    this._currentModel = null
    this._systemPromptAdded = false
    this._editProposed = false
    this._checkpointer = null
    this._threadId = null
  }

  async fetchModels(provider: AIProvider, apiKey: string, baseUrl?: string): Promise<string[]> {
    const actualBaseUrl = baseUrl || PROVIDER_BASE_URLS[provider]

    try {
      if (
        provider === 'openai' ||
        provider === 'ollama' ||
        provider === 'ollama_bundled' ||
        provider === 'openrouter'
      ) {
        const url =
          provider === 'ollama' || provider === 'ollama_bundled'
            ? `${actualBaseUrl}/api/tags`
            : `${actualBaseUrl}/models`
        const headers =
          provider === 'openai' || provider === 'openrouter'
            ? { Authorization: `Bearer ${apiKey}` }
            : {}

        const response = await axios.get(url, { headers })

        if (provider === 'openai' || provider === 'openrouter') {
          return response.data.data
            .map((m: Record<string, unknown>) => String(m.id))
            .filter((id: string) => {
              if (provider === 'openai') {
                return id.startsWith('gpt') || id.startsWith('o1')
              }
              return true
            })
        } else {
          return response.data.models.map((m: Record<string, unknown>) => String(m.name))
        }
      } else if (provider === 'anthropic') {
        if (!apiKey) {
          return [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229'
          ]
        }
        const url = `${actualBaseUrl}/models`
        const response = await axios.get(url, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        })
        return response.data.data?.map((m: Record<string, unknown>) => String(m.id)) || []
      } else if (provider === 'google') {
        if (!apiKey) {
          throw new Error('API Key is required for Google Gemini')
        }
        await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
        return [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-1.5-flash-8b',
          'gemini-2.0-flash-exp'
        ]
      }
      return []
    } catch (error) {
      log.error(`[LangGraphMain] Error fetching models for ${provider}:`, error)
      return []
    }
  }

  public async pullModel(model: string, baseUrl?: string): Promise<void> {
    const actualBaseUrl = baseUrl || PROVIDER_BASE_URLS.ollama
    const url = `${actualBaseUrl}/api/pull`
    log.info(`[LangGraphMain] Pulling model ${model} from ${actualBaseUrl}`)

    try {
      const response = await axios.post(
        url,
        { name: model, stream: true },
        { responseType: 'stream' }
      )

      const mainWindow = this._getMainWindow()
      for await (const chunk of response.data) {
        const lines = chunk
          .toString()
          .split('\n')
          .filter((l: string) => l.trim())
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (mainWindow) {
              mainWindow.webContents.send('mt::ai:pull-progress', {
                percent: data.percent,
                status: data.status,
                digest: data.digest
              })
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
      log.info(`[LangGraphMain] Model ${model} pulled successfully`)
    } catch (error: unknown) {
      log.error(`[LangGraphMain] Failed to pull model ${model}:`, error)
      if (axios.isAxiosError(error)) {
        throw new Error(String(error.response?.data?.error || error.message || 'Failed to pull model'))
      }
      throw new Error(error instanceof Error ? error.message : 'Failed to pull model')
    }
  }

  async sendMessage(
    messages: ILangGraphMessage[],
    signal?: AbortSignal
  ): Promise<ILangGraphResponse> {
    if (!this._agent) {
      throw new Error('Not connected to any AI provider')
    }

    const toLangchain = (msg: ILangGraphMessage): HumanMessage | AIMessage | SystemMessage => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content)
        case 'user':
          return new HumanMessage(msg.content)
        case 'assistant':
        case 'ai':
          return new AIMessage(msg.content)
        default:
          return new HumanMessage(msg.content)
      }
    }

    // With a checkpointer, the thread itself holds the conversation state —
    // only forward messages the thread hasn't seen (everything after the
    // last assistant turn); the renderer still sends its full display
    // history for compatibility.
    const threadHasState =
      !!this._checkpointer &&
      !!this._threadId &&
      (await this._checkpointer.hasThread(this._threadId))

    let outgoing = messages
    if (threadHasState) {
      const lastAssistantIndex = messages.reduce(
        (acc, msg, i) => (msg.role === 'assistant' || msg.role === 'ai' ? i : acc),
        -1
      )
      outgoing = messages.slice(lastAssistantIndex + 1).filter((m) => m.role !== 'system')
    }

    const langchainMessages = outgoing.map(toLangchain)

    const hasSystemMessage = langchainMessages.some((m) => m instanceof SystemMessage)
    if (!hasSystemMessage && !this._systemPromptAdded && !threadHasState) {
      const toolDefinitions = this._agentToolService.getDefinitions()
      const toolDescriptions = toolDefinitions
        .map((t) => `${t.name}: ${t.description}`)
        .join('\n')
      langchainMessages.unshift(new SystemMessage(buildBiscuitSystemPrompt(toolDescriptions)))
      this._systemPromptAdded = true
    }

    if (this._editProposed) {
      langchainMessages.unshift(new SystemMessage(
        'IMPORTANT: An edit has already been proposed. Do NOT call any tools. ' +
        'Just provide a natural language summary of what was done.'
      ))
    }

    const response = await this._agent.invoke(
      { messages: langchainMessages },
      {
        signal,
        recursionLimit: 10,
        ...(this._checkpointer && this._threadId
          ? { configurable: { thread_id: this._threadId } }
          : {})
      }
    )
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
      maxTokens: maxTokens ?? 2048
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
          anthropicApiKey: apiKey,
          model: targetModel
        }) as unknown as BaseChatModel

      case 'google':
        return new ChatGoogleGenerativeAI({
          ...common,
          apiKey,
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

  private _buildGraph(model: Runnable, tools: unknown[]): CompiledAgent {
    const toolNode = new ToolNode(tools as never)

    log.debug(`[LangGraphMain] Building graph with ${tools.length} tools`)

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', async(state) => {
        const response = await model.invoke(state.messages)
        return { messages: [response] }
      })
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', toolsCondition, {
        tools: 'tools',
        __end__: '__end__'
      })
      .addEdge('tools', 'agent')

    return workflow.compile({
      checkpointer: this._checkpointer ?? undefined
    }) as unknown as CompiledAgent
  }

  private _extractResponseContent(response: unknown): string {
    if (!response || typeof response !== 'object') {
      return ''
    }

    const resp = response as Record<string, unknown>
    if (!resp.messages || !Array.isArray(resp.messages) || resp.messages.length === 0) {
      return ''
    }

    const messages = resp.messages as Array<Record<string, unknown>>
    const lastMessage = messages[messages.length - 1]

    if (!lastMessage || typeof lastMessage !== 'object') {
      return ''
    }

    const content = lastMessage.content

    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            if ('type' in item && item.type === 'tool_call') {
              return ''
            }
            if ('text' in item && typeof item.text === 'string') {
              return item.text
            }
          }
          return ''
        })
        .join('')
    }

    return String(content || '')
  }

  async executeTool(call: IAgentToolCall): Promise<IAgentToolResult> {
    const projectRoot = getActiveAgentProjectRoot()
    const result = await this._agentToolService.execute(call, { projectRoot })

    if (result.ok && this._agentToolService.isEditProposalPayload(result.data)) {
      const proposal = result.data
      this._editProposed = true

      const mainWindow = this._getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('mt::ai:edit-proposal', proposal)
      } else {
        log.warn('[LangGraphMain] No main window available for edit proposal')
      }
    }

    return result
  }

  async applyEdit(request: IAgentApplyEditRequest): Promise<{ ok: boolean; error?: string }> {
    try {
      const mainWindow = this._getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('mt::ai:apply-edit-in-renderer', request)
      } else {
        log.warn('[LangGraphMain] No main window available for apply edit')
      }

      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  }
}

export const langGraphManager = new LangGraphManager()
