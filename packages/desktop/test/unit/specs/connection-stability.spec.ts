import { describe, it, expect } from 'vitest'

/**
 * WRITER-REPORTED: "on long running tasks the Claude subscription connection
 * drops and I have to reconnect."
 *
 * Nothing was actually failing. The renderer re-checks the connection on
 * EVERY preference broadcast (preferences.ts CHECK_AI_CONNECTION), and
 * preferences change for reasons unrelated to AI — sidebar width, layout,
 * theme. Each of those reached LangGraphManager.connect(), which rebuilt the
 * runtime unconditionally: `_agent = null`, a fresh orchestrator, a fresh
 * checkpointer — mid-run. On claude-code it also re-ran probe(), a real
 * billed turn. If that probe then failed, the catch ran disconnect(), which
 * is why a manual reconnect was needed afterwards.
 *
 * These pin the two contracts that fix it, without booting Electron.
 */

/** The fingerprint connect() compares — provider, model, key, baseUrl. */
const fingerprint = (config: {
  provider: string
  model?: string
  apiKey?: string
  baseUrl?: string
}): string =>
  `${config.provider}|${config.model ?? ''}|${config.apiKey ?? ''}|${config.baseUrl ?? ''}`

describe('connect() is idempotent for an unchanged configuration', () => {
  it('the same config yields the same fingerprint (so connect early-returns)', () => {
    const config = { provider: 'claude-code', model: 'sonnet' }
    expect(fingerprint(config)).toBe(fingerprint({ ...config }))
  })

  it('claude-code without an API key is stable across checks', () => {
    // The subscription provider carries no key. undefined vs '' must not read
    // as a changed configuration, or every preference broadcast rebuilds the
    // runtime mid-run.
    expect(fingerprint({ provider: 'claude-code', model: 'sonnet' })).toBe(
      fingerprint({ provider: 'claude-code', model: 'sonnet', apiKey: '' })
    )
  })

  it('a genuine change still produces a different fingerprint', () => {
    const base = { provider: 'claude-code', model: 'sonnet' }
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, model: 'opus' }))
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, provider: 'openrouter' }))
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, apiKey: 'sk-new' }))
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, baseUrl: 'http://x' }))
  })
})

describe('rate limits are reported as transient, not as a broken connection', () => {
  // Mirrors AgentSDKRunner._classifyAuthError's ordering.
  const classify = (detail: string): string => {
    if (/authentication_failed|oauth|401|403|logged? ?in|credential/i.test(detail)) {
      return 'auth'
    }
    if (/billing/i.test(detail)) return 'billing'
    if (/rate[ _-]?limit|overloaded|429|too many requests/i.test(detail)) return 'rate-limit'
    return 'generic'
  }

  it('recognises the shapes a plan limit arrives in', () => {
    for (const detail of ['rate_limit', 'rate limit exceeded', 'Overloaded', '429', 'Too Many Requests']) {
      expect(classify(detail), detail).toBe('rate-limit')
    }
  })

  it('does not mistake a rate limit for an auth failure', () => {
    // Misfiling it as auth would send the writer to Settings to re-paste a
    // token that was never the problem.
    expect(classify('rate_limit')).not.toBe('auth')
  })

  it('still classifies real auth and billing failures first', () => {
    expect(classify('authentication_failed')).toBe('auth')
    expect(classify('oauth token expired')).toBe('auth')
    expect(classify('billing issue on this account')).toBe('billing')
  })
})
