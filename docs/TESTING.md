# Testing WordBird — the four lanes

| Lane | What it proves | Cost | Command |
|---|---|---|---|
| **Unit** (`test/unit/specs/`, Vitest) | Services, AI orchestration, stores — scripted models, no network | free | `pnpm run test:unit` |
| **Mocked-AI Playwright** (`test/e2e/`) | The real Electron app + real IPC + real renderer, with `mt::ai:*` events faked from main | free, CI-safe | `pnpm run build:unpack && pnpm run test:e2e` |
| **Live harness** (`test/live/`, Vitest) | The real agent runtime (tools/prompts/orchestration) against a real model — no renderer | subscription (sonnet) or OpenRouter free | `pnpm run test:live` (see docs/LIVE_E2E.md) |
| **LIVE_APP golden path** (`test/e2e/app-live-golden.spec.ts`) | The whole product at once: real app + real subscription AI → chat → review card → accept → disk | ~2–6 sonnet calls per run | `LIVE_APP=1 pnpm -C packages/desktop exec playwright test test/e2e/app-live-golden.spec.ts` |

Rule of thumb: logic → unit; renderer behavior → mocked-AI Playwright; agent
behavior → live harness; integration of all three → the golden path (kept to
ONE writer message; never CI).

## The mocked-AI Playwright pattern

Used by `agent-review-flow`, `right-prompt-cards`, `agent-review-extended`,
`sidebar-panels` (agents panel), `p2-surfaces` (detached window),
`stop-controls` (Stop / per-agent ✕ / capability gating). The
contract:

1. Launch with `{ suppressErrorDialog: true }` (`launchWithMarkdown` /
   `launchWithProject`).
2. Fake any main→renderer AI event with
   `sendIpcToRenderer(app, channel, payload)` — or
   `broadcastIpcToRenderer` (fixtures.ts) to reach detached windows.
   Channels: `mt::ai:edit-proposal`, `mt::ai:writer-question`,
   `mt::ai:plan-proposal`, `mt::ai:approval-request`,
   `mt::ai:pending-edits-cleared`, `mt::ai:activity`,
   `mt::ai:agent-status`, `mt::ai:token-usage`, `mt::ai:context-usage`,
   `mt::ai:connection-state`.
3. Capture renderer→main feedback with `armIpcProbe(app, channel)` /
   `readIpcProbe` (fixtures.ts) — `ipcMain.on` collectors into a global
   sink. NOTE: `invoke`-style channels (ipcMain.handle) cannot be probed
   this way — either assert renderer state, or re-register the handler
   (`ipcMain.removeHandler` + `ipcMain.handle` recording into a global)
   as `stop-controls.spec.ts` does; a held-open send-message handler is
   also how that spec puts the panel into the live "sending" state.
4. End every spec with `expectNoRendererErrors(app)`.
5. Never construct an AI runtime; never touch the network.

Known limit: closed-file applies go through `mt::ai:apply-edit` BY ID and
main refuses ids it never recorded — mocked proposals can only fully apply
against the OPEN file. The closed-file happy path lives in the apply-gate
unit specs and the golden path.

## Seeded projects

`test/e2e/fixtures.ts` → `createNovelProject(options)`: two chapters, four
scenes with full view metadata (synopsis/status/pov/when/thread/label —
`when` deliberately out of narrative order for the timeline toggle), bible
pages with aliases, optional continuity issues (BARE-ARRAY issues.json)
and daily word stats (`.wordbird/stats.json`, `{start,last}` per local
day; today seeds `start: 0` because the app overwrites `last` with the
live total). `launchWithProject(root)` launches and waits for the shell.
The builder deliberately does NOT import `test/live/harness.ts` (that
would pull the AI stack into the Playwright process) — keep the two seed
shapes in sync by hand.

Flaky-proofing: the app's startup word-count refresh rewrites
structure.json and can briefly re-render the center pane — wait for
`wordCount` to appear in structure.json before driving views, and switch
views with retries (see `novel-views.spec.ts`).

## The LIVE_APP golden path

Gated on `LIVE_APP=1` **and** a Claude login (`CLAUDE_CODE_OAUTH_TOKEN` or
`~/.claude/.credentials.json`); skips otherwise, so it never runs in CI.
It connects the real `claude-code` provider through `mt::ai:connect`
(empty key → `AgentSDKRunner.probe()`, auth via the local login), sets
approvals mode, sends ONE tightly-scoped writer message, waits for the
real review card, accepts, and asserts the file + binder refresh.
**Budget rule: this spec stays at ≤1 writer message** — it is an
integration smoke, not a flow suite (flows live in `test/live/`).
`LIVE_KEEP_ARTIFACTS=1` keeps the scratch project for post-mortem.

## CI

- `test.yml` — unit, per PR.
- `e2e.yml` — builds the app, runs all Playwright specs under xvfb
  (mocked-AI + views; LIVE_APP self-skips).
- `live-e2e.yml` — nightly, `LIVE_PROVIDER: openrouter`.

## Adding a feature? (maintenance policy, same as CLAUDE.md)

- New agent-facing behavior → scripted unit spec + shared live flow.
- New `mt::ai:*` renderer event or writer-facing card → a mocked-AI
  Playwright spec.
- New novel view or view-driving metadata → extend `novel-views.spec.ts`
  (+ seed in fixtures).
- New IPC handler → a bridge round-trip in `ipc-novel-surface.spec.ts`.
