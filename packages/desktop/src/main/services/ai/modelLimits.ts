/**
 * Pure resolution of a model's context window and max output from what the
 * provider APIs advertise. Kept out of LangGraphManager (which imports
 * Electron) so it is unit-testable in a plain node env.
 *
 * Providers that advertise real per-model limits — OpenRouter
 * (`context_length` / `max_completion_tokens`), Ollama (`/api/show`),
 * Anthropic (`max_input_tokens` / `max_tokens`, new), Gemini
 * (`inputTokenLimit` / `outputTokenLimit`) — feed these numbers in as
 * `reportedContext` / `reportedOutput`. OpenAI's `/v1/models` exposes none, so
 * it falls to the family table here; claude-code has no endpoint at all.
 */

import type { AIProvider } from '@shared/constants/ai'

/** Anthropic 1M-token context beta header value (opt-in, ~2x price >200k). */
export const ANTHROPIC_1M_BETA = 'context-1m-2025-08-07'
/** The default Anthropic window without the 1M beta. */
export const ANTHROPIC_DEFAULT_WINDOW = 200000
/** Default reply cap when neither the writer nor the API sets one. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192

export interface ModelLimitInputs {
  provider: AIProvider
  model: string
  /** Context window the provider's models endpoint advertised, if any. */
  reportedContext?: number
  /** Max output the provider's models endpoint advertised, if any. */
  reportedOutput?: number
  /** Writer's manual context-window override (config.contextWindow). */
  override?: number
  /** Anthropic 1M beta opt-in. */
  enable1MContext?: boolean
}

const isClaude = (provider: AIProvider, model: string): boolean =>
  provider === 'anthropic' || provider === 'claude-code' || model.toLowerCase().includes('claude')

/**
 * The synchronous part of context-window resolution: override → provider
 * rules → family-table fallback. The Ollama `/api/show` lookup is async and
 * stays in LangGraphManager, which passes its result in as `reportedContext`.
 * Returns null only when the caller must run that async Ollama path.
 */
export const resolveContextWindowSync = (i: ModelLimitInputs): number | null => {
  if (Number.isFinite(i.override) && (i.override as number) > 0) {
    return Math.floor(i.override as number)
  }

  // Anthropic: the advertised ceiling is only usable past 200k WITH the beta
  // header. Cap at 200k unless the writer opted in, so the budget never claims
  // a window the API (headerless) would reject.
  if (isClaude(i.provider, i.model)) {
    if (i.enable1MContext) return i.reportedContext ?? ANTHROPIC_DEFAULT_WINDOW
    return Math.min(i.reportedContext ?? ANTHROPIC_DEFAULT_WINDOW, ANTHROPIC_DEFAULT_WINDOW)
  }

  // Other providers: a reported (API-advertised) window wins.
  if (i.reportedContext && i.reportedContext > 0) return i.reportedContext

  const id = i.model.toLowerCase()
  if (i.provider === 'ollama') return null // caller does the async /api/show lookup
  if (i.provider === 'google' || id.includes('gemini')) return 1000000
  if (i.provider === 'openai') {
    if (id.startsWith('gpt-4.1')) return 1000000
    if (id.startsWith('gpt-3.5')) return 16385
    return 128000
  }
  return 32768
}

/** Where a resolved context window's number came from (for the connect UI). */
export const limitSource = (
  override: number | undefined,
  hasReported: boolean
): 'override' | 'api' | 'default' => {
  if (Number.isFinite(override) && (override as number) > 0) return 'override'
  return hasReported ? 'api' : 'default'
}

/** Max output for a model: the API's value if advertised, else the default. */
export const resolveMaxOutput = (reportedOutput?: number): number =>
  reportedOutput && reportedOutput > 0 ? reportedOutput : DEFAULT_MAX_OUTPUT_TOKENS
