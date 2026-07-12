# Live end-to-end tests (real model, real tools)

The unit suite (`pnpm test:unit`) proves the machinery with scripted
models. The **live suite** proves the whole Biscuit stack against a real
LLM: the production `Orchestrator`, the full `static/agentTools.json`
tool pack, the real tool handlers, and a scratch novel project on disk —
exactly the stack the app runs, minus Electron windows.

## Quick start

```bash
export OPENROUTER_KEY=sk-or-…           # your key — https://openrouter.ai/keys
export OPENROUTER_MODEL=openrouter/free # sentinel: auto-pick a FREE tool-calling model
pnpm run test:live
```

That is all. Without `OPENROUTER_KEY` the suite self-skips (safe in CI).

- `OPENROUTER_MODEL` unset or `openrouter/free` → the harness queries the
  live OpenRouter catalog and picks the best **free** model that supports
  tool calling (preference-ranked; the chosen id is printed at the start
  of the run).
- Set `OPENROUTER_MODEL` to a concrete id (e.g. `openai/gpt-oss-120b:free`
  or a paid model) to pin it.

## What it verifies

| # | Flow | Asserts |
|---|------|---------|
| 0 | Connectivity | free tool-calling model resolved; trivial turn completes |
| 1 | Durable thread | a fact from turn 1 is recalled in turn 2 (checkpointer) |
| 2 | Grounding | a story-bible fact is answered via the read tools |
| 3 | Writing | "write a scene" produces a review-gated **edit proposal**, never chat-paste |
| 4 | Plan mode | brainstorming saves a live plan file in `plans/`; `propose_plan` raises the approval card; **zero** edit proposals possible |
| 5 | Ask mode | spawning requests approval; approved wave runs agents to completion; a declined wave runs nothing |
| 6 | Auto mode | full agentic loop — spawn, worker tool use, grounded answer — with no approval prompts |

Assertions target *behavior* (proposals emitted, files created, approvals
requested, facts grounded), not exact wording, so they tolerate model
variation. Each test gets one automatic retry.

## Free-tier realities

- OpenRouter's free models are rate-limited (roughly 20 requests/minute
  and a daily cap without credits). The suite runs one test at a time,
  pauses between tests, and the model client retries 429s — a full run
  makes ~25–35 model calls and takes several minutes.
- Free models are weaker than paid ones. If a behavioral test fails on a
  free model but passes on a stronger one, that is signal about model
  quality, not (necessarily) a WordBird bug — check which model the run
  printed.

## Where things live

- `packages/desktop/test/live/harness.ts` — model resolution, scratch
  project, the real-stack wiring, proposal/approval capture.
- `packages/desktop/test/live/live-e2e.spec.ts` — the flows.
- `packages/desktop/vitest.live.config.ts` — sequential, long timeouts,
  1 retry; excluded from `pnpm test:unit`.
