# Live end-to-end tests (real model, real tools)

The unit suite (`pnpm test:unit`) proves the machinery with scripted
models. The **live suite** proves the whole Biscuit stack against a real
LLM: the production orchestration (`Orchestrator` or `AgentSDKRunner`),
the full `static/agentTools.json` tool pack, the real tool handlers, the
real `ContextBuilder` + `ResearchLedger`, and a scratch novel project on
disk — exactly the stack the app runs, minus Electron windows.

## Providers — the suite is provider-parameterized

One shared flow catalog (`live-e2e.spec.ts`) runs against whichever
provider the environment selects (`test/live/provider.ts`):

| Provider | Backend | Model | When selected |
|---|---|---|---|
| `subscription` | `AgentSDKRunner` (Claude Agent SDK) | `sonnet` (`LIVE_CLAUDE_MODEL` overrides — never use opus) | `CLAUDE_CODE_OAUTH_TOKEN` set, or a local Claude Code login (`~/.claude/.credentials.json`). **Every turn bills the Claude plan.** |
| `openrouter` | `Orchestrator` + free tool-calling model | auto-picked free model (`OPENROUTER_MODEL` pins) | `OPENROUTER_KEY` set. The CI path — free. |

Selection order: `LIVE_PROVIDER=subscription|openrouter` forces (missing
credentials → the suite **skips with a printed reason**, it never
silently tests the other provider); otherwise subscription when
credentials/login exist; otherwise OpenRouter; otherwise skip.

## Quick start

```bash
# Logged-in dev machine (Claude Code login) — subscription, sonnet:
pnpm run test:live

# Force a provider:
LIVE_PROVIDER=subscription pnpm run test:live
LIVE_PROVIDER=openrouter OPENROUTER_KEY=sk-or-… pnpm run test:live
```

## Token thrift (subscription runs bill the writer's plan)

- Model is **sonnet**; subagents can be dropped to haiku with
  `LIVE_SUBAGENT_MODEL=haiku` (optional).
- Every flow runs under a per-invoke **turn budget**
  (`AgentSDKRunner.turnBudget`, default 24) so a wandering model cannot
  burn the plan on a test.
- **Heavy flows** (book run, overlapping researchers, revision E2E, the
  whole-novel census) need `LIVE_HEAVY=1` on subscription; on OpenRouter
  (free) they always run, so CI keeps full coverage.
- **The coverage net.** Flow 39 (`WHOLE NOVEL`) drives one instruction
  through a book run and then takes a CENSUS of the finished project —
  prose on disk, binder units, view metadata (synopsis/status/`when`),
  bible pages, plans, research notes, facts, continuity issues. Its
  assertions carry per-subsystem messages, so a regression names the
  layer that stopped engaging instead of just failing. The census is
  printed on PASS too: thin-but-passing numbers are themselves a signal.
  Flow 40 is its cheap counterpart — it checks that ordinary drafting
  leaves the binder renderable without the writer asking field by field,
  which is what keeps the corkboard and timeline in sync with the
  manuscript.
- Flows that pin OpenRouter mechanics (model catalog resolution, context
  window from the models API) skip on subscription.
- Every run ends with a **LIVE TOKEN REPORT** (per-harness and total
  input/output/calls) so test-cost regressions are visible run-over-run.

## Debugging a failing flow

`LIVE_KEEP_ARTIFACTS=1` keeps each scratch project instead of deleting
it and writes `<root>/.live-artifacts/activity.json` (full activity
feed, agent statuses, approvals, token tally). The kept root path is
printed at dispose time.

## What it verifies

The flow catalog covers the novelist journey — brainstorm (plans,
ask_writer, methods), create (onboarding, proposals, book run), maintain
(steward/health, snapshots, decisions, memory), update (revisions),
refine (lint, skills), plus mode contracts (ask/approvals/auto) and web
research with provenance + persistence. Assertions target *behavior*
(proposals emitted, files created, approvals requested, facts grounded),
not exact wording, so they tolerate model variation. Each test gets one
automatic retry.

SDK-specific runtime pins (connect probe, session-resume tool-server
survival, the raw-SDK parallel race, max-turns result shapes, the
permission-storm wave) live separately in `claude-subscription.spec.ts`
— writer flows never go there.

## Free-tier realities (OpenRouter path)

- OpenRouter's free models are rate-limited (roughly 20 requests/minute
  and a daily cap without credits). The suite runs one test at a time,
  pauses between tests, and the model client retries 429s.
- Free models are weaker than paid ones. If a behavioral test fails on a
  free model but passes on a stronger one, that is signal about model
  quality, not (necessarily) a WordBird bug — check which model the run
  printed.

## Regression setup — this is not an ad-hoc suite

- **Nightly CI**: `.github/workflows/live-e2e.yml` runs the suite every
  night (and on PRs that touch the suite itself) with
  `LIVE_PROVIDER: openrouter` and the `OPENROUTER_KEY` repository
  secret. Without the secret the suite self-skips and the job stays
  green. A subscription CI lane would need a `CLAUDE_CODE_OAUTH_TOKEN`
  secret — deliberately not wired.
- **Maintenance policy** (also in CLAUDE.md): every new or changed
  agent-facing behavior — a tool, a mode, a prompt contract, an
  orchestration rule — must land with BOTH a scripted unit spec and a
  live flow in the shared `live-e2e.spec.ts` (provider-specific runtime
  pins go to `claude-subscription.spec.ts`). New flows state their cost
  class: light, or heavy (gated behind `LIVE_HEAVY` on subscription).
- PR CI stays deterministic (unit suites); the live suite is the daily
  behavioral gate, deliberately not PR-blocking for unrelated changes.

## Full-app golden path

The live suite drives the agent runtime WITHOUT the renderer. The one
test that drives the whole product — real Electron app + real
subscription AI + real review queue — is
`packages/desktop/test/e2e/app-live-golden.spec.ts`
(`LIVE_APP=1`, dev machine only, ≤1 writer message ≈ 2–6 sonnet calls).
See docs/TESTING.md for the four-lane map.

## Where things live

- `packages/desktop/test/live/provider.ts` — provider selection + token
  report formatting (pure; unit-pinned in `live-provider.spec.ts`).
- `packages/desktop/test/live/harness.ts` — the provider-agnostic
  facade: scratch project, real-stack wiring (both backends),
  proposal/approval capture, token accounting, artifact keeping.
- `packages/desktop/test/live/live-e2e.spec.ts` — the shared flows.
- `packages/desktop/test/live/claude-subscription.spec.ts` — SDK pins.
- `packages/desktop/vitest.live.config.ts` — sequential, long timeouts,
  1 retry; excluded from `pnpm test:unit`.
