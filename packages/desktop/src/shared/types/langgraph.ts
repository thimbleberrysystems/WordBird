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
  /** Manual context-window override (tokens); otherwise resolved per provider. */
  contextWindow?: number
  /**
   * Anthropic only: opt into the 1M-token context beta
   * (`context-1m-2025-08-07`). When true, the beta header is sent on both the
   * models list and every message call, and the budget uses the reported (up
   * to 1M) window. When false/undefined, no header and the window is capped at
   * 200k. Tokens past 200k are billed ~2x and require an eligible account tier.
   */
  enable1MContext?: boolean
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
  // 'notice' is a renderer-only informational card (e.g. a quiet-but-alive
  // run) — never sent to the model, never a failure.
  role: 'user' | 'assistant' | 'system' | 'ai' | 'error' | 'stopped' | 'notice'
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

/** The full edit-proposal event payload (broadcast as mt::ai:edit-proposal). */
export interface IAgentEditProposalPayload {
  edit: IAgentEditProposal
  oldContent: string
  originalPath: string
}

/**
 * Review outcome for one proposed edit, reported renderer → main
 * (mt::ai:edit-resolved) so the model learns what the writer decided.
 */
export interface IAgentEditResolution {
  id: string
  filePath: string
  accepted: boolean
}

export interface IBlockDiffState {
  blockKey: string
  editId: string
  changeType: 'modified' | 'added' | 'removed'
}

/**
 * Three autonomy modes:
 *  - ask       : read-only — agents explore, search, research the web, and
 *                build context; NOTHING can be edited (plan files excepted).
 *  - approvals : default — all tools; every proposed edit waits in the
 *                review queue (per-change and approve-all controls).
 *  - auto      : all tools; edits apply automatically after a safety
 *                snapshot (rewindable from History).
 */
export type AgentPermissionMode = 'ask' | 'approvals' | 'auto'

/**
 * What the ACTIVE provider's runtime supports. The claude-code provider
 * delegates the agent loop to the Claude runtime, which owns subagent
 * lifecycles and context management — so per-agent controls and manual
 * compaction are honest no-ops there and the UI hides them.
 */
export interface IAgentRuntimeCapabilities {
  /** Per-row pause/resume/kill in the agents tree. */
  perAgentControl: boolean
  /** Whole-run pause at the next step boundary. */
  boundaryPause: boolean
  /** Writer-triggered context compaction (the context-ring click). */
  manualCompact: boolean
}

export type AgentRole =
  | 'explorer'
  | 'researcher'
  | 'drafter'
  | 'auditor'
  | 'line-editor'
  | 'plotter'
  | 'steward'

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
  /** Prompt tokens — provider-reported when available, else chars/4. */
  usedTokens?: number
  /** Usable input tokens for the connected model (window − output − overhead). */
  budgetTokens?: number
  /** The connected model's full context window, when resolved. */
  contextWindow?: number
}
