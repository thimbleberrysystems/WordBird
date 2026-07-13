# Using a Claude subscription (Pro/Max) with WordBird

WordBird's **"Claude subscription (Claude Code)"** provider lets writers
who pay for Claude Pro/Max use Biscuit without an API key. It is built on
the **Claude Agent SDK** — the one integration path Anthropic's terms
allow for subscription auth in third-party apps ("third-party apps that
authenticate with your Claude subscription through the Agent SDK",
support.claude.com article 15036540). WordBird never sends subscription
OAuth tokens to the Anthropic HTTP API directly; that violates the
Consumer Terms and risks the account.

## Setup

Two ways to authenticate — either works:

1. **Existing Claude Code login (zero config).** If you use the Claude
   Code CLI on this machine, you are already logged in (credentials in
   `~/.claude/.credentials.json` or the OS keychain). In WordBird open
   Settings → AI, pick *Claude subscription (Claude Code)*, leave the
   token field empty, and Connect.
2. **Setup token.** Run `claude setup-token` in a terminal (needs the
   Claude Code CLI once), approve in the browser, and paste the printed
   `sk-ant-oat01-…` token into the token field. The token is stored
   encrypted (Electron safeStorage), like every other provider key, and
   is valid for one year.

Model: pick `sonnet`, `opus`, or `haiku` (aliases the runtime resolves),
or type a full model id.

## What to know

- **Usage bills the plan.** Turns count against the subscription's usage
  limits (plus a monthly Agent SDK credit on current plans). A long book
  run on a Pro plan will hit plan limits far sooner than an API key
  would — for heavy automation Anthropic recommends API billing.
- **Never paste an Anthropic API key** into this provider. WordBird also
  strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the runtime's
  environment, because either would silently override the subscription
  and bill API credits.
- **The safety model is unchanged.** The Agent SDK runs the loop, but
  every tool is WordBird's own (bridged in-process): proposals still go
  through the review queue, auto mode still snapshots first, ask mode is
  still mechanically read-only, destructive operations still raise a
  writer-approval card, `.wordbird/`/`.git/` stay untouchable, and locked
  bible pages stay immutable. Claude Code's built-in file/terminal tools
  (Bash, Read, Write, Edit, …) are disallowed outright.
- **Differences vs API-key providers**: temperature/max-tokens are
  managed by the runtime (the settings fields hide); conversation
  compaction is the runtime's own; mid-run pause and per-sub-agent
  pause/kill are not available (Stop works); sub-agents are Claude Code
  subagents mapped from WordBird's six roles.

## Testing

`test/live/claude-subscription.spec.ts` runs the real runtime — probe,
grounded read, review-gated surgical edit. It self-skips unless
`CLAUDE_CODE_OAUTH_TOKEN` is set or a local Claude Code login exists.
Scripted (offline) coverage lives in
`test/unit/specs/agent-sdk-runner.spec.ts`.
