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

export type AgentRole = 'explorer' | 'researcher' | 'drafter' | 'auditor' | 'line-editor'

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
}
