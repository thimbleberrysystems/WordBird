import { describe, it, expect } from 'vitest'
import {
  ANTHROPIC_1M_BETA,
  ANTHROPIC_DEFAULT_WINDOW,
  DEFAULT_MAX_OUTPUT_TOKENS,
  limitSource,
  resolveContextWindowSync,
  resolveMaxOutput
} from '../../../src/main/services/ai/modelLimits'
import type { AIProvider } from '../../../src/shared/constants/ai'

const inputs = (over: Partial<Parameters<typeof resolveContextWindowSync>[0]>) => ({
  provider: 'anthropic' as AIProvider,
  model: 'claude-opus-4-6',
  ...over
})

describe('resolveContextWindowSync', () => {
  it('a manual override wins over everything', () => {
    expect(
      resolveContextWindowSync(inputs({ override: 500000, reportedContext: 200000, enable1MContext: false }))
    ).toBe(500000)
  })

  it('Anthropic caps at 200k when the 1M beta is OFF, even if the API reported more', () => {
    // The safety invariant: never budget a window the headerless API rejects.
    expect(
      resolveContextWindowSync(inputs({ reportedContext: 1000000, enable1MContext: false }))
    ).toBe(ANTHROPIC_DEFAULT_WINDOW)
    // No report either → still the 200k default.
    expect(resolveContextWindowSync(inputs({ enable1MContext: false }))).toBe(ANTHROPIC_DEFAULT_WINDOW)
  })

  it('Anthropic uses the reported ceiling when the 1M beta is ON', () => {
    expect(
      resolveContextWindowSync(inputs({ reportedContext: 1000000, enable1MContext: true }))
    ).toBe(1000000)
    // A model that only reports 200k stays 200k even with the beta on
    // (per-model accuracy — haiku doesn't get 1M).
    expect(
      resolveContextWindowSync(inputs({ model: 'claude-haiku-4-5', reportedContext: 200000, enable1MContext: true }))
    ).toBe(200000)
  })

  it('claude-code is treated as Anthropic (capped without the opt-in)', () => {
    expect(
      resolveContextWindowSync(inputs({ provider: 'claude-code', reportedContext: 1000000, enable1MContext: false }))
    ).toBe(ANTHROPIC_DEFAULT_WINDOW)
  })

  it('a reported window from any other provider is used directly', () => {
    // e.g. Gemini inputTokenLimit, OpenRouter context_length.
    expect(
      resolveContextWindowSync({ provider: 'google' as AIProvider, model: 'gemini-2.5-pro', reportedContext: 2000000 })
    ).toBe(2000000)
    expect(
      resolveContextWindowSync({ provider: 'openrouter' as AIProvider, model: 'x/y', reportedContext: 131072 })
    ).toBe(131072)
  })

  it('Ollama with no cached value defers to the async /api/show lookup', () => {
    expect(
      resolveContextWindowSync({ provider: 'ollama' as AIProvider, model: 'llama3' })
    ).toBeNull()
    // …but a cached/reported value is used without the round trip.
    expect(
      resolveContextWindowSync({ provider: 'ollama' as AIProvider, model: 'llama3', reportedContext: 8192 })
    ).toBe(8192)
  })

  it('falls back to the family table when nothing is reported', () => {
    expect(resolveContextWindowSync({ provider: 'google' as AIProvider, model: 'gemini-x' })).toBe(1000000)
    expect(resolveContextWindowSync({ provider: 'openai' as AIProvider, model: 'gpt-4.1-mini' })).toBe(1000000)
    expect(resolveContextWindowSync({ provider: 'openai' as AIProvider, model: 'gpt-3.5-turbo' })).toBe(16385)
    expect(resolveContextWindowSync({ provider: 'openai' as AIProvider, model: 'gpt-4o' })).toBe(128000)
    expect(resolveContextWindowSync({ provider: 'openrouter' as AIProvider, model: 'unknown/model' })).toBe(32768)
  })
})

describe('limitSource', () => {
  it('reports override / api / default correctly', () => {
    expect(limitSource(500000, true)).toBe('override')
    expect(limitSource(undefined, true)).toBe('api')
    expect(limitSource(0, false)).toBe('default')
    expect(limitSource(undefined, false)).toBe('default')
  })
})

describe('resolveMaxOutput', () => {
  it('uses the reported max when advertised, else the default', () => {
    expect(resolveMaxOutput(64000)).toBe(64000)
    expect(resolveMaxOutput(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(resolveMaxOutput(0)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
  })
})

describe('constants', () => {
  it('the 1M beta header value is the documented one', () => {
    expect(ANTHROPIC_1M_BETA).toBe('context-1m-2025-08-07')
  })
})
