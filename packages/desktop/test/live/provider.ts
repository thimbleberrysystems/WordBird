/**
 * Live-suite provider selection — pure and unit-testable (the only part
 * of the live harness that runs without spending tokens).
 *
 * The live flows are provider-parameterized: they drive the REAL
 * orchestration against either the Claude subscription (Agent SDK,
 * model sonnet — the primary target on a logged-in dev machine) or
 * OpenRouter (free tool-calling model — the CI path). Selection:
 *
 *   1. LIVE_PROVIDER=subscription|openrouter forces a provider; if its
 *      credentials are absent the suite SKIPS (with a printed reason)
 *      rather than silently falling back — a forced provider must never
 *      quietly test a different one.
 *   2. Otherwise: subscription when CLAUDE_CODE_OAUTH_TOKEN or a local
 *      Claude Code login exists; else OpenRouter when OPENROUTER_KEY /
 *      OPENROUTER_API_KEY exists; else null (suite skips).
 */

import type { ITokenTally } from '../../src/shared/types/langgraph'

export type LiveProvider = 'subscription' | 'openrouter'

export interface LiveEnvProbe {
  env: Record<string, string | undefined>
  /** fs.existsSync(~/.claude/.credentials.json) — injected for testability. */
  hasClaudeLogin: boolean
}

const hasSubscriptionCreds = (probe: LiveEnvProbe): boolean =>
  Boolean(probe.env.CLAUDE_CODE_OAUTH_TOKEN) || probe.hasClaudeLogin

const hasOpenRouterCreds = (probe: LiveEnvProbe): boolean =>
  Boolean(probe.env.OPENROUTER_KEY || probe.env.OPENROUTER_API_KEY)

export interface LiveProviderSelection {
  provider: LiveProvider | null
  /** Human-readable reason when provider is null (printed at skip time). */
  reason?: string
}

export const selectLiveProvider = (probe: LiveEnvProbe): LiveProviderSelection => {
  const forced = probe.env.LIVE_PROVIDER
  if (forced === 'subscription') {
    return hasSubscriptionCreds(probe)
      ? { provider: 'subscription' }
      : {
        provider: null,
        reason:
            'LIVE_PROVIDER=subscription but no CLAUDE_CODE_OAUTH_TOKEN and no local Claude Code login'
      }
  }
  if (forced === 'openrouter') {
    return hasOpenRouterCreds(probe)
      ? { provider: 'openrouter' }
      : { provider: null, reason: 'LIVE_PROVIDER=openrouter but no OPENROUTER_KEY set' }
  }
  if (forced) {
    return { provider: null, reason: `Unknown LIVE_PROVIDER "${forced}"` }
  }
  if (hasSubscriptionCreds(probe)) return { provider: 'subscription' }
  if (hasOpenRouterCreds(probe)) return { provider: 'openrouter' }
  return {
    provider: null,
    reason:
      'No live credentials: set CLAUDE_CODE_OAUTH_TOKEN (or log in to Claude Code) or OPENROUTER_KEY'
  }
}

/** Heavy (expensive) flows run on subscription only with LIVE_HEAVY=1;
 * on OpenRouter (free) they always run so CI keeps full coverage. */
export const heavyFlowsEnabled = (
  provider: LiveProvider,
  env: Record<string, string | undefined>
): boolean => provider === 'openrouter' || env.LIVE_HEAVY === '1'

/** One line of the end-of-run LIVE TOKEN REPORT. */
export const tokenReportLine = (label: string, tally: ITokenTally): string => {
  const roles = Object.entries(tally.byRole)
    .map(([role, t]) => `${role}:${t.inputTokens}/${t.outputTokens}`)
    .join(' ')
  return (
    `${label}: in=${tally.inputTokens} out=${tally.outputTokens} calls=${tally.calls}` +
    (roles ? ` [${roles}]` : '')
  )
}
