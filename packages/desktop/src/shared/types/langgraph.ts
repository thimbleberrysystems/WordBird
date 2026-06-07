import { 
  type AIProvider
} from '@shared/constants/ai'

export type { AIProvider }

// Configuration stored per provider
export interface IAIProviderConfig {
  apiKey: string
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

// Full configuration including provider
export interface IAIConfig extends IAIProviderConfig {
  provider: AIProvider
}

// Connection state
export interface IAIConnectionState {
  provider: AIProvider | null
  isConnected: boolean
  selectedModel: string | null
}

// Message types
export interface ILangGraphMessage {
  role: 'user' | 'assistant' | 'system' | 'ai' | 'error' | 'stopped'
  content: string
}

export interface ILangGraphResponse {
  content: string
  model: string
}
