/**
 * AI Provider constants and defaults shared across Main and Renderer processes.
 */

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openrouter'

export const AI_PROVIDERS: AIProvider[] = [
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openrouter'
]

/**
 * Saved preferences may carry the retired 'ollama_bundled' provider (it was
 * never actually bundled — the label promised a binary we do not ship).
 * Normalize it to plain local Ollama everywhere a provider value enters.
 */
export const normalizeProvider = (value: unknown): AIProvider => {
  if (value === 'ollama_bundled') return 'ollama'
  return AI_PROVIDERS.includes(value as AIProvider) ? (value as AIProvider) : 'ollama'
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  ollama: 'Ollama (Local)',
  openrouter: 'OpenRouter'
}

export const PROVIDERS_WITHOUT_KEY: AIProvider[] = ['ollama']

export const PROVIDER_BASE_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'http://127.0.0.1:11434',
  openrouter: 'https://openrouter.ai/api/v1'
}

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  google: 'gemini-2.5-flash',
  ollama: 'llama3',
  openrouter: 'openai/auto'
}

/**
 * Consolidated AI defaults for the application.
 */
export const AI_DEFAULTS = {
  provider: 'ollama' as AIProvider,
  configs: {
    openai: { apiKey: '', model: PROVIDER_DEFAULT_MODELS.openai },
    anthropic: { apiKey: '', model: PROVIDER_DEFAULT_MODELS.anthropic },
    google: { apiKey: '', model: PROVIDER_DEFAULT_MODELS.google },
    ollama: {
      apiKey: 'ollama',
      baseUrl: PROVIDER_BASE_URLS.ollama,
      model: PROVIDER_DEFAULT_MODELS.ollama
    },
    openrouter: {
      apiKey: '',
      baseUrl: PROVIDER_BASE_URLS.openrouter,
      model: PROVIDER_DEFAULT_MODELS.openrouter
    }
  }
}
