/**
 * Live-suite provider selection — the pure half of the live harness.
 * Pins the selection matrix (forced provider never silently falls back)
 * and the token-report formatting.
 */

import { describe, it, expect } from 'vitest'
import {
  heavyFlowsEnabled,
  selectLiveProvider,
  tokenReportLine
} from '../../live/provider'

const probe = (
  env: Record<string, string | undefined>,
  hasClaudeLogin = false
): { env: Record<string, string | undefined>; hasClaudeLogin: boolean } => ({
  env,
  hasClaudeLogin
})

describe('selectLiveProvider', () => {
  it('prefers subscription when creds/login exist, else openrouter, else skips', () => {
    expect(selectLiveProvider(probe({ CLAUDE_CODE_OAUTH_TOKEN: 't' })).provider).toBe(
      'subscription'
    )
    expect(selectLiveProvider(probe({}, true)).provider).toBe('subscription')
    expect(selectLiveProvider(probe({ OPENROUTER_KEY: 'k' })).provider).toBe('openrouter')
    expect(selectLiveProvider(probe({ OPENROUTER_API_KEY: 'k' })).provider).toBe('openrouter')
    // Subscription wins when both exist.
    expect(
      selectLiveProvider(probe({ CLAUDE_CODE_OAUTH_TOKEN: 't', OPENROUTER_KEY: 'k' })).provider
    ).toBe('subscription')
    const none = selectLiveProvider(probe({}))
    expect(none.provider).toBeNull()
    expect(none.reason).toContain('No live credentials')
  })

  it('LIVE_PROVIDER forces — and NEVER silently falls back to the other provider', () => {
    expect(
      selectLiveProvider(probe({ LIVE_PROVIDER: 'openrouter', OPENROUTER_KEY: 'k' })).provider
    ).toBe('openrouter')
    // Forced openrouter with only subscription creds: skip, not subscription.
    const forcedNoCreds = selectLiveProvider(
      probe({ LIVE_PROVIDER: 'openrouter', CLAUDE_CODE_OAUTH_TOKEN: 't' })
    )
    expect(forcedNoCreds.provider).toBeNull()
    expect(forcedNoCreds.reason).toContain('OPENROUTER_KEY')
    // Forced subscription with only openrouter creds: skip.
    const forcedSub = selectLiveProvider(probe({ LIVE_PROVIDER: 'subscription', OPENROUTER_KEY: 'k' }))
    expect(forcedSub.provider).toBeNull()
    // Forced subscription honors the local login too.
    expect(
      selectLiveProvider(probe({ LIVE_PROVIDER: 'subscription' }, true)).provider
    ).toBe('subscription')
    // Unknown value: skip with a reason.
    expect(selectLiveProvider(probe({ LIVE_PROVIDER: 'gpt' })).provider).toBeNull()
  })
})

describe('heavyFlowsEnabled', () => {
  it('openrouter always runs heavy flows; subscription needs LIVE_HEAVY=1', () => {
    expect(heavyFlowsEnabled('openrouter', {})).toBe(true)
    expect(heavyFlowsEnabled('subscription', {})).toBe(false)
    expect(heavyFlowsEnabled('subscription', { LIVE_HEAVY: '1' })).toBe(true)
  })
})

describe('tokenReportLine', () => {
  it('formats totals and the per-role breakdown', () => {
    const line = tokenReportLine('flow-3', {
      inputTokens: 1200,
      outputTokens: 300,
      calls: 4,
      byRole: {
        supervisor: { inputTokens: 900, outputTokens: 200, calls: 2 },
        researcher: { inputTokens: 300, outputTokens: 100, calls: 2 }
      }
    })
    expect(line).toBe('flow-3: in=1200 out=300 calls=4 [supervisor:900/200 researcher:300/100]')
    expect(
      tokenReportLine('empty', { inputTokens: 0, outputTokens: 0, calls: 0, byRole: {} })
    ).toBe('empty: in=0 out=0 calls=0')
  })
})
