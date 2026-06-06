// AI Provider types
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter'

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
  role: 'user' | 'assistant' | 'system' | 'ai'
  content: string
}

export interface ILangGraphResponse {
  content: string
  model: string
}

// Provider configurations with default base URLs
export const PROVIDER_BASE_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'http://127.0.0.1:11434',
  openrouter: 'https://openrouter.ai/api/v1'
}

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-1.5-pro',
  ollama: 'llama3',
  openrouter: 'openai/gpt-4o'
}