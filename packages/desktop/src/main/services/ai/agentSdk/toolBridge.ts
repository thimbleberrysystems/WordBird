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

import type { AgentToolService } from '../AgentToolService'
import type { AgentPermissionMode } from '@shared/types/langgraph'
import {
  DESTRUCTIVE_TOOLS,
  SUPERVISOR_TOOL_NAMES,
  SUPERVISOR_WRITE_TOOL_NAMES
} from '../orchestrator/Orchestrator'
import {
  AGENT_ROLES,
  MODE_BUDGETS,
  READONLY_ROLES,
  READONLY_WORKER_TOOLS,
  workerRecursionLimit
} from '../orchestrator/roles'

/** MCP server name — SDK tool ids become mcp__wordbird__<tool>. */
export const MCP_SERVER_NAME = 'wordbird'
export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`

/** Same context discipline as the LangGraph tool node: announced cap. */
export const TOOL_OUTPUT_CHAR_CAP = 24000

/**
 * The minimal surface we use from @anthropic-ai/claude-agent-sdk. Only
 * `query`: the tools themselves are served over the loopback HTTP MCP
 * server (see httpMcpServer.ts), not the SDK's in-process tool helpers.
 */
export interface AgentSdkModule {
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
  brief = '',
  gathered = '',
  // Optional per-subagent model alias (SDK AgentDefinition.model, e.g.
  // 'haiku'). Omitted = subagents inherit the parent model — the live
  // suite may pin a cheaper model; production never sets it.
  subagentModel?: string
): Record<
  string,
  { description: string; prompt: string; tools: string[]; model?: string; maxTurns: number }
> => {
  const agents: Record<
    string,
    { description: string; prompt: string; tools: string[]; model?: string; maxTurns: number }
  > = {}
  // Per-subagent step budget: without it, a spawned worker inherits only the
  // parent's generous maxTurns and can spin unbounded — the "researcher goes
  // endless" incident (prj12, 2026-07-19): one researcher issued 38 tool
  // calls, re-reading the same page a dozen times, because nothing capped
  // it. This is the SDK equivalent of the recursionLimit LangGraph passes
  // each worker (Orchestrator._runWorker → workerRecursionLimit); the SAME
  // per-mode/per-role number so both providers bound work identically.
  const stepBudget = MODE_BUDGETS[mode].workerRecursionLimit
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
      // GATHERED THIS TURN (research ledger) rides warm roles only —
      // coldStart roles (auditor) verify from source, both providers.
      prompt:
        role.systemPrompt +
        (brief ? `\n\n${brief}` : '') +
        (gathered && !role.coldStart ? `\n\n${gathered}` : '') +
        (role.role === 'drafter' ? DRAFTER_SDK_ADDENDUM : ''),
      tools: toolNames.map((name) => `${MCP_TOOL_PREFIX}${name}`),
      // HEAVY_ROLES (drafter/line-editor/auditor/plotter/steward) legitimately
      // span many units, so they get the same multiplier LangGraph grants.
      maxTurns: workerRecursionLimit(role.role, stepBudget),
      ...(subagentModel ? { model: subagentModel } : {})
    }
  }
  return agents
}

/** Every write-capable tool name (used in tests to prove ask-mode strips them). */
export const WRITE_TOOL_NAMES: string[] = [...SUPERVISOR_WRITE_TOOL_NAMES]
