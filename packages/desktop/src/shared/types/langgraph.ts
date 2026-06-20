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
