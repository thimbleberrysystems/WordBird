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
  IAgentToolResult
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

const isEditProposalPayload = (value: unknown): value is EditProposalPayload => {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return Boolean(data.edit && data.oldContent && data.originalPath)
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
  constructor(private readonly _knownHandlers: Iterable<string>) {}

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
    for (const knownHandler of this._knownHandlers) {
      if (knownHandler === handler) return true
    }
    return false
  }
}

export class AgentToolService {
  private readonly _handlers = new Map<string, AgentToolHandler>()
  private readonly _tools = new Map<string, LoadedTool>()
  private _currentProjectRoot: string | null = null
  private _editProposalEmitter: EditProposalEmitter | null = null

  setEditProposalEmitter(emitter: EditProposalEmitter): void {
    this._editProposalEmitter = emitter
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
    log.debug(`[AgentToolService] Loading tool pack, enabled: ${pack.enabled}, tools count: ${pack.tools.length}`)
    if (pack.enabled === false) return

    for (const definition of pack.tools) {
      log.debug(`[AgentToolService] Processing tool: ${definition.id}, enabled: ${definition.enabled}`)
      if (definition.enabled === false) continue

      const handler = this._handlers.get(definition.handler)
      if (!handler) {
        throw new Error(
          `Agent tool '${definition.name}' references unknown handler '${definition.handler}'`
        )
      }

      const langChainTool = this._toLangChainTool(definition, handler)
      this._tools.set(definition.id, {
        definition,
        handler,
        langChainTool
      })
      log.debug(`[AgentToolService] Tool registered: ${definition.id}`)
    }
    log.debug(`[AgentToolService] Total tools loaded: ${this._tools.size}`)
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

  private _toLangChainTool(
    definition: IAgentToolDefinition,
    handler: AgentToolHandler
  ): DynamicStructuredTool {
    const zodSchema = convertJsonSchemaToZod(definition.schema)

    return tool(
      async(args: Record<string, unknown>, config?: RunnableConfig) => {
        log.debug(`[AgentToolService] Tool '${definition.name}' called with args:`, args)
        const context: AgentToolContext = {
          projectRoot: this._currentProjectRoot,
          signal: config?.signal
        }
        // Call the handler directly
        const result = await handler(args, context)
        log.debug(`[AgentToolService] Tool '${definition.name}' returned:`, result)

        // If this is an edit proposal, emit it to renderer
        if (this._editProposalEmitter && isEditProposalPayload(result)) {
          log.debug(`[AgentToolService] Emitting edit proposal from tool '${definition.name}':`, result)
          await this._editProposalEmitter(result)
          // Return simple string to prevent recursion
          return `Edit proposal created with ID: ${result.edit.id}`
        }

        // For all other results, return a simple string representation
        if (result && typeof result === 'object') {
          const resultStr = JSON.stringify(result)
          log.debug(`[AgentToolService] Returning string result for tool '${definition.name}'`)
          return resultStr
        }

        return result
      },
      {
        name: definition.name,
        description: definition.description,
        schema: zodSchema,
        responseFormat: 'content'
      }
    ) as DynamicStructuredTool
  }
}
