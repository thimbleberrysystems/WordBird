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
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type {
  IAIConfig,
  ILangGraphMessage,
  ILangGraphResponse,
  IAgentToolCall,
  IAgentToolResult,
  IAgentApprovalRequest,
  IAgentEditProposalPayload,
  IAgentEditResolution,
  AgentPermissionMode
} from '../../../shared/types/langgraph'
import type { AIProvider } from '../../../shared/constants/ai'
import {
  CLAUDE_CODE_MODELS,
  PROVIDER_BASE_URLS,
  PROVIDER_DEFAULT_MODELS,
  normalizeProvider
} from '../../../shared/constants/ai'
import axios from 'axios'
import { AgentToolService, AgentToolPackLoader } from './AgentToolService'
import { registerBuiltInAgentToolHandlers } from './AgentToolHandlers'
import { registerUrlProvenance, clearUrlProvenance } from './WebToolHandlers'
import { getActiveAgentProjectRoot, setAgentToolAccessor } from './AgentProjectRootResolver'
import { EditResolutionTracker } from './EditResolutionTracker'
import { driveBookRun, AUTO_CONTINUE_MESSAGE } from './bookRun'
import {
  WRITE_TOOL_EVENT_NAMES,
  STEWARD_SIGNAL_TOOLS,
  acceptancePrepend,
  driveCoherencePass,
  emptyObservations,
  markSteward,
  observeWrite,
  type TurnObservations
} from './coherencePass'
import { FileCheckpointSaver } from './FileCheckpointSaver'
import { Orchestrator } from './orchestrator/Orchestrator'
import type { OrchestratorCallbacks } from './orchestrator/Orchestrator'
import { AgentSDKRunner } from './agentSdk/AgentSDKRunner'
import { contextBuilder } from './ContextBuilder'
import type Accessor from '../../app/accessor'

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Default reply cap when the writer hasn't set one. A hard cap must exist
 * (Anthropic's API requires max_tokens, and the context budget reserves
 * this amount out of the window) — but it has to be prose-sized: a full
 * scene is ~2-3k tokens and reasoning models spend budget on hidden
 * thinking before emitting a word. 8192 fits both with headroom; the
 * writer can raise/lower it in Settings → Biscuit.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192

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

export class LangGraphManager {
  private _agent: CompiledAgent | null = null
  private _currentProvider: AIProvider | null = null
  private _currentModel: string | null = null
  private _currentAbortController: AbortController | null = null
  private _agentToolService: AgentToolService = new AgentToolService()
  private _systemPromptAdded: boolean = false
  private _checkpointer: FileCheckpointSaver | null = null
  private _threadId: string | null = null
  // LangGraph orchestrator for API-key providers; Agent SDK runner for the
  // claude-code (Claude subscription) provider. Same facade either way.
  private _orchestrator: Orchestrator | AgentSDKRunner | null = null
  private _permissionMode: AgentPermissionMode = 'approvals'
  private _editTracker = new EditResolutionTracker(() => this._agentStateDir())
  /** Per-model context windows learned from provider APIs (OpenRouter/Ollama). */
  private _modelContextLengths = new Map<string, number>()
  /** Per-model max output tokens where the provider reports one (OpenRouter). */
  private _modelMaxOutputs = new Map<string, number>()
  private _pendingApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void; timer: NodeJS.Timeout }
  >()

  /** Which project's saved mode is currently loaded (lazy, follows the active project). */
  private _modeLoadedFor: string | null = null

  get permissionMode(): AgentPermissionMode {
    this._ensureModeLoaded()
    return this._permissionMode
  }

  /**
   * The permission mode is a PER-PROJECT preference: each project remembers
   * how the writer last worked with it (`.wordbird/agent-state/session.json`).
   * Loaded lazily so switching projects picks up that project's mode.
   */
  private _ensureModeLoaded(): void {
    const dir = this._agentStateDir()
    if (this._modeLoadedFor === dir) return
    this._modeLoadedFor = dir
    const saved = this._readSessionFile().permissionMode
    if (saved === 'ask' || saved === 'approvals' || saved === 'auto') {
      this._permissionMode = saved
    } else {
      this._permissionMode = 'approvals'
    }
    this._orchestrator?.setMode(this._permissionMode)
  }

  setPermissionMode(mode: AgentPermissionMode): void {
    this._permissionMode = mode
    this._modeLoadedFor = this._agentStateDir()
    this._writeSessionFile({ permissionMode: mode })
    this._orchestrator?.setMode(mode)
    // Every window shows the mode (editor panel + detached Biscuit).
    this._broadcast('mt::ai:mode-changed', { mode })
  }

  resolveApproval(approvalId: string, approved: boolean): boolean {
    const pending = this._pendingApprovals.get(approvalId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this._pendingApprovals.delete(approvalId)
    pending.resolve(approved)
    this._broadcast('mt::ai:approval-resolved', { id: approvalId })
    return true
  }

  private _requestApproval(request: IAgentApprovalRequest): Promise<boolean> {
    if (BrowserWindow.getAllWindows().length === 0) return Promise.resolve(false)
    // The renderer counts down to the same deadline main enforces below.
    this._broadcast('mt::ai:approval-request', {
      ...request,
      expiresAt: Date.now() + APPROVAL_TIMEOUT_MS
    })
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this._pendingApprovals.delete(request.id)
        resolve(false)
      }, APPROVAL_TIMEOUT_MS)
      this._pendingApprovals.set(request.id, { resolve, timer })
    })
  }

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

  private _readSessionFile(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(this._sessionPath(), 'utf8')) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private _writeSessionFile(patch: Record<string, unknown>): void {
    try {
      fs.mkdirSync(this._agentStateDir(), { recursive: true })
      fs.writeFileSync(
        this._sessionPath(),
        JSON.stringify({ ...this._readSessionFile(), ...patch }),
        'utf8'
      )
    } catch (error) {
      log.warn('[LangGraphMain] Failed to persist session state:', error)
    }
  }

  private _loadOrCreateThreadId(): string {
    const saved = this._readSessionFile().threadId
    if (typeof saved === 'string' && saved) return saved
    return this._persistNewThreadId()
  }

  private _persistNewThreadId(): string {
    const threadId = `biscuit-${crypto.randomUUID()}`
    this._writeSessionFile({ threadId })
    return threadId
  }

  /** Start a fresh conversation thread (old checkpoints are kept on disk). */
  resetThread(): string {
    this._threadId = this._persistNewThreadId()
    this._systemPromptAdded = false
    this._orchestrator?.resetSessionUsage()
    // New conversation, clean fetchable-URL slate.
    clearUrlProvenance()
    // Proposals from the previous conversation must not leak into this one —
    // drop them everywhere (main-side queue + every renderer's review queue).
    this._editTracker.clearPending()
    this._broadcast('mt::ai:pending-edits-cleared', {})
    return this._threadId
  }

  // ---- Edit review feedback loop -----------------------------------------

  /** Record + broadcast an edit proposal (single path for both emit sites). */
  private _emitEditProposal(payload: IAgentEditProposalPayload): void {
    this._editTracker.recordProposal(payload, this._threadId, getActiveAgentProjectRoot())
    this._broadcast('mt::ai:edit-proposal', payload)
  }

  /** The writer accepted/rejected an edit — feed it back to the model. */
  resolveEdit(resolution: IAgentEditResolution): void {
    if (!resolution || typeof resolution.id !== 'string') return
    this._editTracker.resolve(resolution)
  }

  /** The pending proposal behind an apply request (the apply gate's lookup). */
  getPendingEdit(
    id: string
  ): { payload: IAgentEditProposalPayload; projectRoot: string | null } | null {
    return this._editTracker.getPending(id)
  }

  /** Proposals still awaiting review (renderer rehydration after restart). */
  getPendingEdits(): IAgentEditProposalPayload[] {
    return this._editTracker.pendingForThread(this._threadId)
  }

  cancelAgent(agentId: string): boolean {
    return this._orchestrator?.cancelAgent(agentId) ?? false
  }

  pauseAgent(agentId: string): boolean {
    return this._orchestrator?.pauseAgent(agentId) ?? false
  }

  resumeAgent(agentId: string): boolean {
    return this._orchestrator?.resumeAgent(agentId) ?? false
  }

  // ---- Pause / resume / steering / manual compaction ----
  private _steeringQueue: string[] = []
  private _turnRunning = false
  /** What this turn changed — feeds the mechanical coherence pass. */
  private _turnObservations: TurnObservations = emptyObservations()

  private _emitRunState(): void {
    const state = !this._turnRunning
      ? 'idle'
      : this._orchestrator?.isPaused
        ? 'paused'
        : 'running'
    this._broadcast('mt::ai:run-state', { state })
  }

  pause(): boolean {
    if (!this._orchestrator || !this._turnRunning) return false
    this._orchestrator.pause()
    this._emitRunState()
    return true
  }

  resume(): boolean {
    if (!this._orchestrator) return false
    this._orchestrator.resumeFromPause()
    this._emitRunState()
    return true
  }

  /** Queue a mid-run writer note; drained at the next supervisor boundary. */
  steer(text: string): boolean {
    if (!text.trim()) return false
    this._steeringQueue.push(text.trim())
    return true
  }

  async compactNow(): Promise<{ compacted: boolean; repaired: number; busy?: boolean }> {
    if (this._turnRunning) return { compacted: false, repaired: 0, busy: true }
    if (!this._orchestrator || !this._agent || !this._threadId) {
      return { compacted: false, repaired: 0 }
    }
    return this._orchestrator.compactThread(this._agent as never, this._threadId)
  }

  flushCheckpoints(): void {
    this._checkpointer?.flush()
    this._editTracker.flush()
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

  private _accessor: Accessor | null = null

  setAccessor(accessor: Accessor): void {
    this._accessor = accessor
    setAgentToolAccessor(accessor)
  }

  getAccessor(): Accessor | null {
    return this._accessor
  }

  private _getMainWindow(): BrowserWindow | null {
    return BrowserWindow.getAllWindows()[0] ?? null
  }

  /**
   * AI events go to EVERY window: with Biscuit detachable, the chat can
   * live in its own window while edit proposals land in the editor —
   * each renderer picks up the channels it cares about.
   */
  private _broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
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

  /**
   * Verify the credentials actually work before declaring the provider
   * connected. Without this, a bad key sails through connect() (model
   * listing errors are swallowed, and OpenRouter's /models is public) and
   * only explodes on the first message with an opaque 401.
   */
  private async _validateCredentials(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ): Promise<void> {
    const base = baseUrl || PROVIDER_BASE_URLS[provider]
    const rejected = (detail?: string): Error =>
      new Error(
        `${provider} rejected these credentials${detail ? ` (${detail})` : ''}. ` +
        'Double-check the API key in Settings → AI.'
      )

    try {
      if (provider === 'openai') {
        await axios.get(`${base}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000
        })
      } else if (provider === 'openrouter') {
        // /models is public on OpenRouter — /key requires a valid key.
        await axios.get(`${base}/key`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000
        })
      } else if (provider === 'anthropic') {
        await axios.get(`${base}/models`, {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          timeout: 10000
        })
      } else if (provider === 'google') {
        await axios.get(`${base}/v1beta/models?key=${apiKey}`, { timeout: 10000 })
      } else {
        // ollama: no key — just confirm the server responds.
        await axios.get(`${base}/api/tags`, { timeout: 10000 })
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 401 || status === 403) {
          throw rejected(`HTTP ${status}`)
        }
        if (!error.response) {
          throw new Error(
            `Could not reach ${provider} at ${base}: ${error.message}. ` +
            'Check the base URL and your network connection.'
          )
        }
      }
      throw error
    }
  }

  /**
   * The model's context window in tokens: manual override → provider-
   * reported (OpenRouter model list, Ollama /api/show) → family table →
   * a conservative 32k fallback. Sizing budgets to the REAL window is what
   * keeps a 200k-context model from being compacted at 15k tokens and a
   * small local model from overflowing.
   */
  private async _resolveContextWindow(config: IAIConfig): Promise<number> {
    if (Number.isFinite(config.contextWindow) && (config.contextWindow as number) > 0) {
      return Math.floor(config.contextWindow as number)
    }
    const model = config.model || ''
    const reported = this._modelContextLengths.get(model)
    if (reported) return reported

    if (config.provider === 'ollama') {
      try {
        const base = config.baseUrl || PROVIDER_BASE_URLS.ollama
        const response = await axios.post(`${base}/api/show`, { model }, { timeout: 10000 })
        const info = (response.data?.model_info ?? {}) as Record<string, unknown>
        for (const [key, value] of Object.entries(info)) {
          if (key.endsWith('.context_length') && Number.isFinite(Number(value))) {
            return Number(value)
          }
        }
      } catch (error) {
        log.warn('[LangGraphMain] Could not read Ollama context length:', error)
      }
      return 8192
    }

    const id = model.toLowerCase()
    if (
      config.provider === 'anthropic' ||
      config.provider === 'claude-code' ||
      id.includes('claude')
    ) {
      return 200000
    }
    if (config.provider === 'google' || id.includes('gemini')) return 1000000
    if (config.provider === 'openai') {
      if (id.startsWith('gpt-4.1')) return 1000000
      if (id.startsWith('gpt-3.5')) return 16385
      return 128000
    }
    return 32768
  }

  async connect(rawConfig: IAIConfig): Promise<void> {
    // Saved prefs may still carry the retired 'ollama_bundled' provider.
    const config: IAIConfig = { ...rawConfig, provider: normalizeProvider(rawConfig.provider) }
    const { provider, apiKey, baseUrl } = config
    this._currentProvider = provider
    this._currentModel = config.model || null

    try {
      // claude-code has no HTTP surface to probe — the Agent SDK runner
      // validates end-to-end below, after it is constructed.
      if (provider !== 'claude-code') {
        await this._validateCredentials(provider, apiKey, baseUrl)
      }
      await this.fetchModels(provider, apiKey, baseUrl)

      // Reply cap: the writer's setting (or the prose-sized default),
      // clamped to the model's supported max output where the provider
      // reports one — an over-ask would 400 on every request.
      const requestedOut = config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
      const modelMaxOut = this._modelMaxOutputs.get(config.model ?? '')
      config.maxTokens = modelMaxOut ? Math.min(requestedOut, modelMaxOut) : requestedOut
      if (config.maxTokens !== requestedOut) {
        log.info(
          `[LangGraphMain] Reply cap clamped ${requestedOut} → ${config.maxTokens} ` +
          `(model max for ${config.model})`
        )
      }

      await this._loadToolPacks()
      // Direct file/structure mutations reflect in every window immediately
      // (binder, corkboard, outline, timeline, files tree).
      this._agentToolService.setProjectChangedEmitter((changedRoot) => {
        this._broadcast('mt::novel:project-changed', { root: changedRoot })
      })
      this._agentToolService.setPlanSavedEmitter(({ planSaved }) => {
        this._broadcast('mt::ai:plan-saved', planSaved)
      })
      this._agentToolService.setWriterQuestionEmitter(({ writerQuestion }) => {
        this._broadcast('mt::ai:writer-question', writerQuestion)
      })
      this._agentToolService.setPlanProposalEmitter(async({ planProposal }) => {
        this._broadcast('mt::ai:plan-proposal', planProposal)
      })
      this._agentToolService.setEditProposalEmitter(async(proposal) => {
        log.debug('[LangGraphMain] ToolNode edit proposal emitter received:', proposal)
        this._emitEditProposal(proposal)
      })
      // Coherence observation at the provider-shared choke point: every
      // successful tool run lands here — LangGraph workers, SDK Task
      // subagents (invisible to activity events), renderer executeTool.
      this._agentToolService.setToolRunObserver(({ toolName, args }) => {
        if (WRITE_TOOL_EVENT_NAMES.has(toolName)) {
          const detail = ['path', 'unitId', 'title', 'name']
            .map((key) => args[key])
            .find((value) => typeof value === 'string' && value)
          observeWrite(
            this._turnObservations,
            toolName,
            `${toolName}${detail ? ` ${String(detail).slice(0, 80)}` : ''}`
          )
        }
        if (STEWARD_SIGNAL_TOOLS.has(toolName)) {
          markSteward(this._turnObservations)
        }
      })

      this._agent = null

      // Durable thread state: checkpoints persist under the active project
      // so long agent runs survive an app restart and resume.
      this._checkpointer = new FileCheckpointSaver(
        path.join(this._agentStateDir(), 'checkpoints.json')
      )
      this._threadId = this._loadOrCreateThreadId()

      const callbacks: OrchestratorCallbacks = {
        emitActivity: (event) => {
          // Writes are counted at the tool-service observer (see connect),
          // NOT here — activity labels never show SDK subagent tool calls.
          // A steward FINISHING marks the pass: marking at start would let
          // its own repair writes re-arm enforcement.
          if (event.kind === 'agent-done' && event.role === 'steward') {
            markSteward(this._turnObservations)
          }
          this._broadcast('mt::ai:activity', event)
        },
        requestApproval: (request) => this._requestApproval(request),
        // Per-turn project grounding: outline + book summary + open
        // continuity issues, shared by supervisor and workers — plus the
        // review-loop status (edits awaiting review / recent outcomes).
        buildBrief: async() => {
          const brief = await contextBuilder.buildProjectBrief(getActiveAgentProjectRoot())
          const review = this._editTracker.briefSummary()
          if (!review) return brief
          const line = `EDIT REVIEW STATUS: ${review}`
          return brief ? `${brief}\n\n${line}` : line
        },
        emitContextUsage: (usage) => {
          this._broadcast('mt::ai:context-usage', usage)
        },
        emitTokenUsage: (usage) => {
          this._broadcast('mt::ai:token-usage', usage)
        },
        emitAgentStatus: (status) => {
          // The SDK provider's steward-completion signal (Task tool_result).
          if (status.status === 'done' && status.role === 'steward') {
            markSteward(this._turnObservations)
          }
          this._broadcast('mt::ai:agent-status', status)
        },
        drainSteering: () => this._steeringQueue.splice(0),
        // Scene N→N+1 handoff for drafters (seamless consecutive scenes).
        buildHandoff: (task) =>
          contextBuilder.buildSceneHandoff(getActiveAgentProjectRoot(), task)
      }

      if (provider === 'claude-code') {
        // Claude subscription: the Agent SDK loop replaces LangGraph, but
        // every WordBird tool still runs in this process (toolBridge) so
        // the review queue, snapshots, and mode gating are unchanged.
        const runner = new AgentSDKRunner({
          config,
          callbacks,
          toolService: this._agentToolService,
          stateDir: this._agentStateDir(),
          projectRoot: () => getActiveAgentProjectRoot()
        })
        // End-to-end validation (spawns the runtime, exercises the login).
        await runner.probe()
        this._orchestrator = runner
      } else {
        // Dynamic orchestrator: the supervisor spawns role-scoped sub-agents
        // at runtime (see orchestrator/). The model factory creates a fresh
        // client per graph so workers and supervisor never share bind state.
        this._orchestrator = new Orchestrator({
          modelFactory: () => this._createChatModel(config) as never,
          tools: this._agentToolService.getLangChainTools(),
          callbacks,
          checkpointer: this._checkpointer ?? undefined
        })
      }
      this._orchestrator.setMode(this._permissionMode)
      // Size every context budget to the model's real window (P0.3): a
      // 200k-context model gets room for a novel-length thread; a small
      // local model gets clamped below its ceiling.
      const contextWindow = await this._resolveContextWindow(config)
      this._orchestrator.setContextBudget(
        contextWindow,
        config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
      )
      this._agent = this._orchestrator.buildGraph() as unknown as CompiledAgent
      this._broadcastConnectionState()
    } catch (error) {
      log.error('[LangGraphMain] Connect error details:', error)
      this.disconnect()
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to connect to ${provider}: ${errorMessage}`)
    }
  }

  private _broadcastConnectionState(): void {
    this._broadcast('mt::ai:connection-state', {
      connected: this.isConnected,
      provider: this._currentProvider,
      model: this._currentModel
    })
  }

  disconnect(): void {
    this._checkpointer?.flush()
    this._agent = null
    this._orchestrator = null
    this._currentProvider = null
    this._currentModel = null
    this._systemPromptAdded = false
    this._checkpointer = null
    this._threadId = null
    for (const [id] of this._pendingApprovals) {
      this.resolveApproval(id, false)
    }
    this._broadcastConnectionState()
  }

  async fetchModels(rawProvider: AIProvider, apiKey: string, baseUrl?: string): Promise<string[]> {
    const provider = normalizeProvider(rawProvider)
    const actualBaseUrl = baseUrl || PROVIDER_BASE_URLS[provider]

    // Subscription auth has no /models endpoint — the runtime resolves
    // these aliases itself (plus any full model id the writer types).
    if (provider === 'claude-code') {
      return [...CLAUDE_CODE_MODELS]
    }

    try {
      if (provider === 'openai' || provider === 'ollama' || provider === 'openrouter') {
        const url =
          provider === 'ollama'
            ? `${actualBaseUrl}/api/tags`
            : `${actualBaseUrl}/models`
        const headers =
          provider === 'openai' || provider === 'openrouter'
            ? { Authorization: `Bearer ${apiKey}` }
            : {}

        const response = await axios.get(url, { headers })

        if (provider === 'openai' || provider === 'openrouter') {
          // OpenRouter reports each model's context window and max output —
          // remember both so budgets/caps can be sized to the model.
          if (provider === 'openrouter') {
            for (const m of response.data.data as Array<Record<string, unknown>>) {
              const length = Number(m.context_length)
              if (Number.isFinite(length) && length > 0) {
                this._modelContextLengths.set(String(m.id), length)
              }
              const top = m.top_provider as Record<string, unknown> | undefined
              const maxOut = Number(top?.max_completion_tokens)
              if (Number.isFinite(maxOut) && maxOut > 0) {
                this._modelMaxOutputs.set(String(m.id), maxOut)
              }
            }
          }
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
            'claude-sonnet-4-5',
            'claude-opus-4-1',
            'claude-haiku-4-5'
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
        // Live list from the API (honoring a custom endpoint); fall back to
        // a current static set only if the shape is unexpected.
        const googleBase = baseUrl || PROVIDER_BASE_URLS.google
        const response = await axios.get(`${googleBase}/v1beta/models?key=${apiKey}`)
        const models = (response.data?.models ?? []) as Array<Record<string, unknown>>
        const generative = models
          .filter((m) =>
            Array.isArray(m.supportedGenerationMethods)
              ? (m.supportedGenerationMethods as string[]).includes('generateContent')
              : true
          )
          .map((m) => String(m.name ?? '').replace(/^models\//, ''))
          .filter((name) => name.startsWith('gemini'))
        if (generative.length > 0) return generative
        return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
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
    const orchestrator = this._orchestrator
    if (!orchestrator) {
      throw new Error('Not connected to any AI provider')
    }
    // Rebuild per turn: the compiled graph bakes in the permission mode,
    // which the writer can change between messages. Compilation is cheap.
    orchestrator.setMode(this._permissionMode)
    const agent = orchestrator.buildGraph() as unknown as CompiledAgent
    this._agent = agent

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
    // history for compatibility. The SDK runner's state lives in its own
    // resumable session, not the checkpointer.
    const threadHasState =
      orchestrator instanceof AgentSDKRunner
        ? !!this._threadId && orchestrator.hasThread(this._threadId)
        : !!this._checkpointer &&
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

    // Writer-supplied URLs become fetchable (web_fetch provenance gate):
    // only links the writer pasted or a search returned may be fetched.
    for (const message of outgoing) {
      if (message.role === 'user') registerUrlProvenance(message.content)
    }

    // Review outcomes since the last turn open this one, so the model knows
    // exactly which of its edits the writer accepted or rejected. Delivered
    // as a marked HumanMessage (mid-thread system messages break Anthropic),
    // same pattern as the compaction summary.
    const reviewNote = this._editTracker.drainNote()
    if (reviewNote) {
      langchainMessages.unshift(new HumanMessage(reviewNote))
    }

    // Fresh observation window for this writer turn.
    this._turnObservations = emptyObservations()

    // Approvals-mode coherence trigger: a just-accepted batch means the
    // manuscript changed — the turn OPENS with the steward pass.
    if (this._permissionMode !== 'ask') {
      const coherenceNote = acceptancePrepend(reviewNote)
      if (coherenceNote) {
        langchainMessages.splice(1, 0, new HumanMessage(coherenceNote))
      }
    }

    const invokeOnce = (msgs: Array<HumanMessage | AIMessage | SystemMessage>): Promise<unknown> =>
      agent.invoke(
        { messages: msgs },
        {
          signal,
          recursionLimit: orchestrator.recursionLimit(),
          ...(this._checkpointer && this._threadId
            ? { configurable: { thread_id: this._threadId } }
            : {})
        }
      )

    // Freeze the freshness signals for this whole turn: every brief build
    // (supervisor iterations + workers + book-run segments) sees the same
    // changed-files/events warning; the window closes at turn end so the
    // agent's own mid-turn edits don't false-alarm next turn.
    const turnRoot = getActiveAgentProjectRoot()
    if (turnRoot) contextBuilder.beginTurn(turnRoot)

    this._turnRunning = true
    this._emitRunState()
    let content: string
    try {
      const response = await invokeOnce(langchainMessages)
      content = this._extractResponseContent(response)
      // Book run: in auto mode the supervisor may end with a CONTINUE marker
      // while a live plan has work left — keep granting segments (bounded).
      content = await this._driveBookRun(content, invokeOnce, signal)

      // Mechanical coherence pass (auto mode): if this turn changed 2+
      // things and no steward ran, ONE bounded follow-up runs the sweep.
      const coherenceReply = await driveCoherencePass(
        this._turnObservations,
        this._permissionMode,
        {
          invokeNext: async(instruction) => {
            const followUp = await invokeOnce([new HumanMessage(instruction)])
            return this._extractResponseContent(followUp)
          },
          emitStatus: (label, detail) => this._emitBookRunStatus(label, detail)
        }
      )
      if (coherenceReply) {
        content = `${content}\n\n${coherenceReply}`
      }
    } catch (error) {
      // Running out of supersteps is a budget, not a failure: the thread
      // is checkpointed up to the last completed step (housekeeping repairs
      // any dangling tool calls next turn), so answer gracefully instead of
      // surfacing an error card.
      if (
        error instanceof Error &&
        (error.name === 'GraphRecursionError' || /recursion limit/i.test(error.message))
      ) {
        log.warn('[LangGraphManager] Turn hit its step budget; responding gracefully')
        return {
          content:
            'I hit this turn’s step budget before I could wrap up. Nothing is lost — ' +
            'everything I did so far is saved. Say **continue** and I’ll pick up right ' +
            'where I left off.',
          model: this._currentModel || this._currentProvider || 'unknown'
        }
      }
      throw error
    } finally {
      this._turnRunning = false
      if (turnRoot) contextBuilder.endTurn(turnRoot)
      // A pause must never outlive its turn — the next turn starts unfrozen.
      this._orchestrator?.resumeFromPause()
      this._steeringQueue = []
      this._emitRunState()
    }

    return {
      content,
      model: this._currentModel || this._currentProvider || 'unknown'
    }
  }

  // ---- Book run (auto-continuation) ---------------------------------------
  // Loop logic lives in bookRun.ts (pure, unit-tested); this class only
  // provides the real dependencies.

  private _maxContinuations = 25
  private static readonly BOOK_RUN_TOKEN_CEILING = 2_000_000

  /** Safety ceiling for one book run (configurable; primary bound). */
  setMaxContinuations(limit: number): void {
    this._maxContinuations = Math.max(0, Math.floor(limit))
  }

  private _emitBookRunStatus(label: string, detail?: string): void {
    this._broadcast('mt::ai:activity', {
      id: `bookrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      kind: 'status',
      label,
      detail
    })
  }

  /**
   * Cheap "did anything actually change?" fingerprint: manuscript/plan/bible
   * markdown (count + bytes) plus ticked plan checkboxes. Two consecutive
   * unchanged segments mean the run is spinning — stop it.
   */
  private _progressSignature(): string {
    const root = getActiveAgentProjectRoot()
    if (!root) return ''
    let files = 0
    let bytes = 0
    let ticked = 0
    const walk = (dir: string): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name === '.wordbird' || entry.name === '.git' || entry.name === 'node_modules') {
          continue
        }
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name.endsWith('.md')) {
          files += 1
          try {
            bytes += fs.statSync(full).size
          } catch {
            // Vanished mid-walk — skip.
          }
        }
      }
    }
    walk(root)
    try {
      for (const entry of fs.readdirSync(path.join(root, 'plans'))) {
        if (!entry.endsWith('.md')) continue
        const text = fs.readFileSync(path.join(root, 'plans', entry), 'utf8')
        ticked += (text.match(/- \[x\]/gi) ?? []).length
      }
    } catch {
      // No plans directory.
    }
    return `${files}:${bytes}:${ticked}`
  }

  private _driveBookRun(
    firstContent: string,
    invokeOnce: (msgs: Array<HumanMessage | AIMessage | SystemMessage>) => Promise<unknown>,
    signal?: AbortSignal
  ): Promise<string> {
    return driveBookRun(firstContent, {
      invokeNext: async() => {
        const response = await invokeOnce([new HumanMessage(AUTO_CONTINUE_MESSAGE)])
        return this._extractResponseContent(response)
      },
      isAuto: () => this._permissionMode === 'auto',
      sessionTokens: () => this._orchestrator?.sessionTokens ?? 0,
      progressSignature: () => this._progressSignature(),
      emitStatus: (label, detail) => this._emitBookRunStatus(label, detail),
      maxContinuations: this._maxContinuations,
      tokenCeiling: LangGraphManager.BOOK_RUN_TOKEN_CEILING,
      // A ceiling raises an approval card; approval grants another block so
      // the run resumes instead of making the writer type "continue".
      requestContinuation: (reason) =>
        this._requestApproval({
          id: `bookrun-${crypto.randomUUID()}`,
          summary: `CONTINUE BOOK RUN — ${reason}`,
          spawns: []
        }),
      signal
    })
  }

  private _createChatModel(config: IAIConfig): BaseChatModel {
    const { provider, apiKey, baseUrl, model, temperature, maxTokens } = config
    const targetModel = model || PROVIDER_DEFAULT_MODELS[provider]

    const common = {
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
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
          // Without `model`, LangChain silently falls back to its own default
          // and the user's dropdown choice never reaches the API.
          model: targetModel,
          maxOutputTokens: common.maxTokens,
          ...(baseUrl ? { baseUrl } : {})
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
      this._emitEditProposal(result.data)
    }

    return result
  }
}

export const langGraphManager = new LangGraphManager()
