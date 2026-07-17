import fsPromises from 'fs/promises'
import log from 'electron-log'
import { z } from 'zod'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import { tool } from '@langchain/core/tools'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'

import type {
  AgentToolConfirm,
  AgentToolScope,
  IAgentEditProposal,
  IAgentToolCall,
  IAgentToolDefinition,
  IAgentToolPack,
  IAgentToolResult,
  IPlanProposal
} from '@shared/types/langgraph'

export interface AgentToolContext {
  projectRoot?: string | null
  signal?: AbortSignal
}

type AgentToolHandler = (
  args: Record<string, unknown>,
  context: AgentToolContext
) => Promise<unknown> | unknown

interface LoadedTool {
  definition: IAgentToolDefinition
  handler: AgentToolHandler
  langChainTool: DynamicStructuredTool
}

interface EditProposalPayload {
  edit: IAgentEditProposal
  oldContent: string
  originalPath: string
}

type EditProposalEmitter = (proposal: EditProposalPayload) => void | Promise<void>

/** One successful tool execution, as seen at the provider-shared choke point. */
export interface ToolRunObservation {
  /** The tool NAME the model called (definition.name). */
  toolName: string
  args: Record<string, unknown>
}

interface PlanProposalPayload {
  planProposal: IPlanProposal
}

type PlanProposalEmitter = (proposal: PlanProposalPayload) => void | Promise<void>

interface PlanSavedPayload {
  planSaved: { path: string }
}

export interface IWriterQuestion {
  id: string
  question: string
  options: Array<{ label: string; description?: string }>
}

interface WriterQuestionPayload {
  writerQuestion: IWriterQuestion
}

type WriterQuestionEmitter = (payload: WriterQuestionPayload) => void | Promise<void>

const isWriterQuestionPayload = (value: unknown): value is WriterQuestionPayload => {
  if (!value || typeof value !== 'object') return false
  const data = (value as Record<string, unknown>).writerQuestion as
    | Record<string, unknown>
    | undefined
  return Boolean(data && data.id && data.question && Array.isArray(data.options))
}

type PlanSavedEmitter = (event: PlanSavedPayload) => void | Promise<void>

const isPlanSavedPayload = (value: unknown): value is PlanSavedPayload => {
  if (!value || typeof value !== 'object') return false
  const data = (value as Record<string, unknown>).planSaved as Record<string, unknown> | undefined
  return Boolean(data && typeof data.path === 'string')
}

const isPlanProposalPayload = (value: unknown): value is PlanProposalPayload => {
  if (!value || typeof value !== 'object') return false
  const data = (value as Record<string, unknown>).planProposal as
    | Record<string, unknown>
    | undefined
  return Boolean(data && data.id && data.title && data.path)
}

const isEditProposalPayload = (value: unknown): value is EditProposalPayload => {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  // oldContent is the EMPTY STRING for brand-new files — a truthiness check
  // here silently dropped every new-unit/new-file proposal (the review card
  // never appeared while the model believed it had proposed the edit).
  return Boolean(data.edit) && typeof data.oldContent === 'string' &&
    typeof data.originalPath === 'string' && data.originalPath.length > 0
}

const AgentToolPackSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean().default(true),
    tools: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        displayName: z.string().optional(),
        description: z.string().min(1),
        handler: z.string().min(1),
        enabled: z.boolean().default(true),
        scope: z.custom<AgentToolScope>((value) => value === 'project'),
        confirm: z.custom<AgentToolConfirm>((value) => value === 'never' || value === 'renderer'),
        schema: z.record(z.string(), z.unknown())
      })
    )
  })
  .refine(
    (pack) => {
      const ids = pack.tools.map((item) => item.id)
      return new Set(ids).size === ids.length
    },
    {
      message: 'Tool ids must be unique within a pack'
    }
  )

export class AgentToolPackLoader {
  private readonly _knownHandlerSet: Set<string>

  constructor(knownHandlers: Iterable<string>) {
    this._knownHandlerSet = new Set(knownHandlers)
  }

  async loadPack(filePath: string): Promise<IAgentToolPack> {
    const raw = await fsPromises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = AgentToolPackSchema.safeParse(parsed)

    if (!result.success) {
      throw new Error(`Invalid agent tool pack ${filePath}: ${result.error.message}`)
    }

    for (const toolDef of result.data.tools) {
      if (!this._hasHandler(toolDef.handler)) {
        throw new Error(
          `Agent tool '${toolDef.name}' references unknown handler '${toolDef.handler}'`
        )
      }
    }

    return {
      ...result.data,
      source: filePath
    }
  }

  async loadPackIfPresent(filePath: string): Promise<IAgentToolPack | null> {
    const exists = await fsPromises
      .access(filePath)
      .then(() => true)
      .catch(() => false)
    if (!exists) return null
    return await this.loadPack(filePath)
  }

  private _hasHandler(handler: string): boolean {
    return this._knownHandlerSet.has(handler)
  }
}

/**
 * Tools that change the project on disk directly (files/structure/metadata):
 * after any of them succeeds, the renderer must refresh its trees so the
 * writer sees the change immediately — never on the next manual refresh.
 */
const PROJECT_MUTATING_TOOLS = new Set([
  'propose_new_unit',
  'restructure_unit',
  'update_unit_meta',
  'delete_unit',
  'create_folder',
  'move_file',
  'delete_file',
  'update_summary',
  'set_writing_method',
  'save_plan',
  'update_plan',
  'record_decision'
])

export class AgentToolService {
  private readonly _handlers = new Map<string, AgentToolHandler>()
  private readonly _tools = new Map<string, LoadedTool>()
  private _currentProjectRoot: string | null = null
  private _editProposalEmitter: EditProposalEmitter | null = null
  private _planProposalEmitter: PlanProposalEmitter | null = null
  private _planSavedEmitter: PlanSavedEmitter | null = null
  private _writerQuestionEmitter: WriterQuestionEmitter | null = null
  private _projectChangedEmitter: ((root: string | null) => void) | null = null
  private _toolRunObserver: ((observation: ToolRunObservation) => void) | null = null

  setEditProposalEmitter(emitter: EditProposalEmitter): void {
    this._editProposalEmitter = emitter
  }

  /**
   * Fired after ANY tool handler succeeds, whichever provider called it —
   * LangGraph workers, SDK Task subagents, renderer executeTool. This is
   * the single choke point coherence enforcement counts writes at (parsing
   * activity labels misses subagent calls on the SDK provider).
   */
  setToolRunObserver(observer: ((observation: ToolRunObservation) => void) | null): void {
    this._toolRunObserver = observer
  }

  private _notifyToolRun(toolName: string, args: Record<string, unknown>): void {
    try {
      this._toolRunObserver?.({ toolName, args })
    } catch {
      // Observation is advisory — never fail the tool over it.
    }
  }

  /** Fired after any tool that mutates project files/structure succeeds. */
  setProjectChangedEmitter(emitter: (root: string | null) => void): void {
    this._projectChangedEmitter = emitter
  }

  setPlanProposalEmitter(emitter: PlanProposalEmitter): void {
    this._planProposalEmitter = emitter
  }

  setPlanSavedEmitter(emitter: PlanSavedEmitter): void {
    this._planSavedEmitter = emitter
  }

  setWriterQuestionEmitter(emitter: WriterQuestionEmitter): void {
    this._writerQuestionEmitter = emitter
  }

  registerHandler(id: string, handler: AgentToolHandler): void {
    this._handlers.set(id, handler)
  }

  setProjectRoot(root: string | null): void {
    this._currentProjectRoot = root
  }

  getKnownHandlerIds(): Iterable<string> {
    return this._handlers.keys()
  }

  loadToolPack(pack: IAgentToolPack): void {
    if (pack.enabled === false) return

    for (const definition of pack.tools) {
      if (definition.enabled === false) continue

      const handler = this._handlers.get(definition.handler)
      if (!handler) {
        throw new Error(
          `Agent tool '${definition.name}' references unknown handler '${definition.handler}'`
        )
      }

      const langChainTool = this._toLangChainTool(definition)
      this._tools.set(definition.id, { definition, handler, langChainTool })
    }
    log.info(`[AgentToolService] Loaded ${this._tools.size} tools from pack`)
  }

  getDefinitions(): IAgentToolDefinition[] {
    return Array.from(this._tools.values()).map((item) => item.definition)
  }

  getLangChainTools(): DynamicStructuredTool[] {
    return Array.from(this._tools.values()).map((item) => item.langChainTool)
  }

  async execute(call: IAgentToolCall, context: AgentToolContext): Promise<IAgentToolResult> {
    const loaded = this._tools.get(call.id)
    if (!loaded) {
      return {
        id: call.id,
        ok: false,
        error: `Unknown agent tool: ${call.id}`
      }
    }

    try {
      const data = await loaded.handler(call.args, context)
      this._notifyToolRun(loaded.definition.name, call.args)
      return {
        id: call.id,
        ok: true,
        data
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        id: call.id,
        ok: false,
        error: message
      }
    }
  }

  isEditProposalPayload(value: unknown): value is EditProposalPayload {
    return isEditProposalPayload(value)
  }

  /**
   * Run one tool for a model and post-process the result exactly like the
   * LangGraph path does (UI refresh + proposal short-circuits). Shared by
   * the LangChain wrapper and the Agent SDK MCP bridge so both providers
   * flow through the SAME review pipeline. Keyed by tool NAME (what the
   * model calls), which equals the definition id for every shipped pack.
   */
  async runForModel(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const loaded =
      this._tools.get(toolName) ??
      Array.from(this._tools.values()).find((item) => item.definition.name === toolName)
    if (!loaded) throw new Error(`Unknown agent tool: ${toolName}`)

    const context: AgentToolContext = {
      projectRoot: this._currentProjectRoot,
      signal
    }
    const result = await loaded.handler(args, context)
    // A proposal IS the write event — notify before the short-circuits.
    this._notifyToolRun(loaded.definition.name, args)

    // Direct disk mutations must reflect in the UI immediately.
    if (this._projectChangedEmitter && PROJECT_MUTATING_TOOLS.has(loaded.definition.name)) {
      try {
        this._projectChangedEmitter(this._currentProjectRoot)
      } catch {
        // UI refresh is advisory — never fail the tool over it.
      }
    }

    if (this._editProposalEmitter && isEditProposalPayload(result)) {
      await this._editProposalEmitter(result)
      return `Edit proposal created with ID: ${result.edit.id}`
    }

    // Live plan files surface in the main editor the moment they are
    // written — the writer watches the plan take shape while chatting.
    if (this._planSavedEmitter && isPlanSavedPayload(result)) {
      await this._planSavedEmitter(result)
    }

    if (this._writerQuestionEmitter && isWriterQuestionPayload(result)) {
      await this._writerQuestionEmitter(result)
      return (
        'Question card shown to the writer with your options (plus a free-form field). ' +
        'END YOUR TURN NOW — their answer arrives as the next message.'
      )
    }

    if (this._planProposalEmitter && isPlanProposalPayload(result)) {
      await this._planProposalEmitter(result)
      return (
        `Plan saved as ${result.planProposal.path} (id ${result.planProposal.id}). ` +
        'The writer now sees an approval card — stop and wait for their decision.'
      )
    }

    if (result && typeof result === 'object') {
      return JSON.stringify(result)
    }

    return result
  }

  private _toLangChainTool(definition: IAgentToolDefinition): DynamicStructuredTool {
    // Handler lookup happens lazily in runForModel — by invocation time the
    // tool is registered in _tools.
    const zodSchema = convertJsonSchemaToZod(definition.schema)

    return tool(
      async(args: Record<string, unknown>, config?: RunnableConfig) =>
        this.runForModel(definition.id, args, config?.signal),
      {
        name: definition.name,
        description: definition.description,
        schema: zodSchema,
        responseFormat: 'content'
      }
    ) as DynamicStructuredTool
  }
}
