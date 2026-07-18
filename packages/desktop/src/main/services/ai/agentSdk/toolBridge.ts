/**
 * WordBird tools → Claude Agent SDK bridge (claude-code provider).
 *
 * The Agent SDK runs the agent loop inside the Claude Code runtime, but
 * every WordBird tool still executes HERE, in the main process, through
 * AgentToolService.runForModel — the same path the LangGraph provider
 * uses. That is what keeps the safety model intact for subscription
 * users: propose_* results raise the identical review-queue proposals,
 * plan/writer-question cards fire, `.wordbird/` protection and locked
 * bible pages hold, and ask mode simply never registers a write tool.
 *
 * The SDK is ESM-only while the main process compiles to CommonJS, so the
 * loaded module is passed in (lazy dynamic import happens in the runner).
 */

import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import type { AgentToolService } from '../AgentToolService'
import type { AgentPermissionMode } from '@shared/types/langgraph'
import {
  DESTRUCTIVE_TOOLS,
  SUPERVISOR_TOOL_NAMES,
  SUPERVISOR_WRITE_TOOL_NAMES
} from '../orchestrator/Orchestrator'
import { AGENT_ROLES, READONLY_ROLES, READONLY_WORKER_TOOLS } from '../orchestrator/roles'

/** MCP server name — SDK tool ids become mcp__wordbird__<tool>. */
export const MCP_SERVER_NAME = 'wordbird'
export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`

/** Same context discipline as the LangGraph tool node: announced cap. */
export const TOOL_OUTPUT_CHAR_CAP = 24000

/** The minimal surface we use from @anthropic-ai/claude-agent-sdk. */
export interface AgentSdkModule {
  tool: (
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (
      args: Record<string, unknown>,
      extra: unknown
    ) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
  ) => unknown
  createSdkMcpServer: (options: { name: string; tools: unknown[] }) => unknown
  query: (params: { prompt: string; options?: Record<string, unknown> }) => AsyncGenerator<
    Record<string, unknown>,
    void
  > & { interrupt?: () => Promise<unknown> }
}

export const stripMcpPrefix = (toolName: string): string =>
  toolName.startsWith(MCP_TOOL_PREFIX) ? toolName.slice(MCP_TOOL_PREFIX.length) : toolName

/**
 * The runtime's subagent-spawn tool has been renamed before (Task →
 * Agent in CLI 2.1.211, which silently killed every Task-keyed
 * mechanism). Known names are the fast path; the STRUCTURAL contract —
 * an input carrying `subagent_type` — survives any future rename.
 */
export const SPAWN_TOOL_NAMES = ['Agent', 'Task'] as const

export const isSpawnToolCall = (name: string, input: unknown): boolean => {
  if ((SPAWN_TOOL_NAMES as readonly string[]).includes(name)) return true
  return (
    !!input &&
    typeof input === 'object' &&
    typeof (input as { subagent_type?: unknown }).subagent_type === 'string' &&
    !name.startsWith(MCP_TOOL_PREFIX)
  )
}

/**
 * Tool names registered AND allowlisted for a mode. Ask mode narrows to
 * the read-only surface (registration ≡ allowlist there, so nothing
 * reachable ever needs the permission stream — the mechanical read-only
 * guarantee). Outside ask, this is ALL tools: main-thread delegation to
 * specialists is DOCTRINE (supervisor prompt), deliberately NOT
 * mechanics — narrowing allowedTools below what subagents use routes
 * their traffic through the SDK permission stream, which collapses
 * under parallel-subagent load (prj7 incident, 2026-07-18).
 */
export const mainThreadToolNames = (
  service: AgentToolService,
  mode: AgentPermissionMode
): string[] => {
  const available = new Set(service.getDefinitions().map((d) => d.name))
  const wanted =
    mode === 'ask'
      ? new Set([...SUPERVISOR_TOOL_NAMES, ...READONLY_WORKER_TOOLS])
      : new Set(service.getDefinitions().map((d) => d.name))
  return [...wanted].filter((name) => available.has(name))
}

/**
 * Build the in-process MCP server exposing the mode-appropriate WordBird
 * tools. Handlers run in this process via AgentToolService.runForModel.
 */
export const buildWordbirdMcpServer = (
  sdk: AgentSdkModule,
  service: AgentToolService,
  mode: AgentPermissionMode
): { server: unknown; toolNames: string[] } => {
  const allowed = new Set(mainThreadToolNames(service, mode))
  const tools: unknown[] = []
  const toolNames: string[] = []

  for (const definition of service.getDefinitions()) {
    if (!allowed.has(definition.name)) continue
    // The SDK takes a zod raw shape; our packs carry JSON schema.
    const shape = (convertJsonSchemaToZod(definition.schema) as unknown as {
      shape: Record<string, unknown>
    }).shape
    tools.push(
      sdk.tool(definition.name, definition.description, shape, async(args) => {
        try {
          const result = await service.runForModel(definition.name, args ?? {})
          let text =
            typeof result === 'string' ? result : JSON.stringify(result ?? 'ok')
          if (text.length > TOOL_OUTPUT_CHAR_CAP) {
            text =
              text.slice(0, TOOL_OUTPUT_CHAR_CAP) +
              `\n…[output truncated at ${TOOL_OUTPUT_CHAR_CAP} characters]`
          }
          return { content: [{ type: 'text', text }] }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
        }
      })
    )
    toolNames.push(definition.name)
  }

  return {
    server: sdk.createSdkMcpServer({ name: MCP_SERVER_NAME, tools }),
    toolNames
  }
}

/**
 * SDK drafters cannot receive the pushed scene handoff LangGraph workers
 * get (their prompt is fixed before the model picks a scene) — the
 * get_scene_handoff tool is the dynamic half; this doctrine line makes
 * calling it non-optional.
 */
export const DRAFTER_SDK_ADDENDUM =
  '\n\nSCENE HANDOFF: before drafting any scene that has a predecessor, call ' +
  'get_scene_handoff with the target unit id and match its voice, time of day, ' +
  'and open threads. Never retell the previous scene.'

/**
 * WordBird's role catalog as SDK subagent definitions. In ask mode only
 * the read-only roles exist and they carry the stripped read+web pack —
 * the same policy the LangGraph orchestrator enforces. The per-turn
 * project brief rides every subagent prompt exactly as it does for
 * LangGraph workers (Orchestrator appends it to worker system prompts).
 */
export const buildSdkAgents = (
  mode: AgentPermissionMode,
  brief = ''
): Record<string, { description: string; prompt: string; tools: string[] }> => {
  const agents: Record<string, { description: string; prompt: string; tools: string[] }> = {}
  for (const role of Object.values(AGENT_ROLES)) {
    if (mode === 'ask' && !READONLY_ROLES.includes(role.role)) continue
    // Destructive tools NEVER ride a subagent definition: a listed tool is
    // pre-approved inside that subagent (allowlist entries shadow
    // canUseTool — the SDK's own warning), which would skip the writer's
    // deletion approval card. Left unlisted, the call falls through to
    // canUseTool and gets gated like everywhere else.
    // Ask mode INTERSECTS the role's own tools with the read-only set
    // (LangGraph parity): an explorer never gains web tools just because
    // the mode is ask — only roles that already carry them keep them.
    const baseTools =
      mode === 'ask'
        ? role.allowedTools.filter((name) => READONLY_WORKER_TOOLS.includes(name))
        : role.allowedTools
    const toolNames = baseTools.filter((name) => !DESTRUCTIVE_TOOLS.includes(name))
    agents[role.role] = {
      description: `${role.displayName} — ${role.activityLabel.toLowerCase()}`,
      prompt:
        role.systemPrompt +
        (brief ? `\n\n${brief}` : '') +
        (role.role === 'drafter' ? DRAFTER_SDK_ADDENDUM : ''),
      tools: toolNames.map((name) => `${MCP_TOOL_PREFIX}${name}`)
    }
  }
  return agents
}

/** Every write-capable tool name (used in tests to prove ask-mode strips them). */
export const WRITE_TOOL_NAMES: string[] = [...SUPERVISOR_WRITE_TOOL_NAMES]
