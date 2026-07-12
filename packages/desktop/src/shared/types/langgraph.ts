import {
  type AIProvider
} from '@shared/constants/ai'

export type { AIProvider }

export interface IAIProviderConfig {
  apiKey: string
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface IAIConfig extends IAIProviderConfig {
  provider: AIProvider
}

export interface IAIConnectionState {
  provider: AIProvider | null
  isConnected: boolean
  selectedModel: string | null
}

export interface ILangGraphMessage {
  role: 'user' | 'assistant' | 'system' | 'ai' | 'error' | 'stopped'
  content: string
}

export interface ILangGraphResponse {
  content: string
  model: string
}

export type AgentToolScope = 'project'
export type AgentToolConfirm = 'never' | 'renderer'

export interface IAgentToolDefinition {
  id: string
  name: string
  displayName?: string
  description: string
  handler: string
  enabled: boolean
  scope: AgentToolScope
  confirm: AgentToolConfirm
  schema: Record<string, unknown>
}

export interface IAgentToolPack {
  version: 1
  enabled: boolean
  tools: IAgentToolDefinition[]
  source: string
}

export interface IAgentToolCall {
  id: string
  args: Record<string, unknown>
}

export interface IAgentToolResult {
  id: string
  ok: boolean
  data?: unknown
  error?: string
}

export interface IAgentEditProposal {
  id: string
  filePath: string
  start?: number
  end?: number
  newContent: string
  reason?: string
  diff?: string
}

export interface IAgentApplyEditRequest {
  edit: IAgentEditProposal
  oldContent: string
  originalPath: string
}

export interface IBlockDiffState {
  blockKey: string
  editId: string
  changeType: 'modified' | 'added' | 'removed'
}

/**
 * Claude-Code-style autonomy modes governing what the orchestrator may do
 * without asking:
 *  - plan      : describe intended agents/edits; execute nothing.
 *  - ask       : cheap reads run freely; asks before spawning sub-agents.
 *  - auto      : spawns and works freely within budget; edits still reviewed.
 *  - full-auto : long-horizon runs with larger budgets; edits still reviewed.
 */
export type AgentPermissionMode = 'plan' | 'ask' | 'auto' | 'full-auto'

export type AgentRole =
  | 'explorer'
  | 'researcher'
  | 'drafter'
  | 'auditor'
  | 'line-editor'
  | 'plotter'

export interface IAgentSpawnRequest {
  role: AgentRole
  task: string
}

/** Plain-language activity feed events shown in the Biscuit panel. */
export interface IAgentActivityEvent {
  id: string
  ts: number
  kind: 'status' | 'spawn' | 'agent-start' | 'agent-done' | 'tool' | 'plan' | 'approval'
  role?: AgentRole
  label: string
  detail?: string
}

export interface IAgentApprovalRequest {
  id: string
  summary: string
  spawns: IAgentSpawnRequest[]
  /** Epoch ms when main auto-declines — drives the card's countdown. */
  expiresAt?: number
}

/**
 * A saved plan awaiting the writer's approval (Claude-Code-style plan
 * mode: the plan is durable on disk, reviewed as a card, and approval
 * switches the mode and kicks off execution).
 */
export interface IPlanProposal {
  id: string
  title: string
  /** Project-relative path of the saved plan file. */
  path: string
  content: string
}

/** Token accounting for one scope (a turn or the whole session). */
export interface ITokenTally {
  inputTokens: number
  outputTokens: number
  /** Number of model calls. */
  calls: number
  /** Per-role breakdown: supervisor, worker roles, compaction. */
  byRole: Record<string, { inputTokens: number; outputTokens: number; calls: number }>
}

export interface ITokenUsageUpdate {
  turn: ITokenTally
  session: ITokenTally
}

export type AgentRunStatus = 'running' | 'done' | 'failed' | 'cancelled'

/** Live status of one spawned sub-agent, drives the agent panel. */
export interface IAgentStatus {
  agentId: string
  role: AgentRole
  task: string
  status: AgentRunStatus
  startedAt: number
  endedAt?: number
  toolCalls: number
  /** Frozen at its next step boundary via the agents tree. */
  paused?: boolean
  /** Most recent tool calls ("name — args preview"), newest last. */
  recentTools?: string[]
}

/** Context-window pressure for the ring indicator in the Biscuit panel. */
export interface IContextUsage {
  usedChars: number
  budgetChars: number
  /** 0..1 — share of the conversation budget in use. */
  ratio: number
  /** True while old turns are being condensed. */
  compacting: boolean
}
