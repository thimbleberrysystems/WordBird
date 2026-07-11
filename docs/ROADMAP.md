# WordBird → World-Class AI Novel Creator

## Context

WordBird today is a WYSIWYG markdown editor (MarkText fork) with a basic
"Biscuit" LangGraph agent that can read a file and propose a single-file inline
diff. The goal: a **world-class novel creator** where AI can create, maintain,
and manipulate a novel of **thousands of pages** — holding cohesion (characters,
canon, timeline, voice) and making sweeping consistent changes — while the
writer sees **none of the machinery**. This plan is greenfield; current
internals are reusable scaffolding, not constraints.

## Product principles

1. **Capabilities, not a pipeline.** Brainstorm / Write / Refine / Extend /
   Fine-tune are an unordered palette. Any capability, any time, at any
   manuscript state (empty, half-drafted, imported finished draft).
2. **The machinery is invisible.** The writer sees a binder, a page, and
   Biscuit. Never: world-models, indexes, agent graphs, tokens. Cohesion work
   happens silently; it surfaces only as plain-language review cards and gentle
   flags.
3. **No RAG.** No embeddings, no vector store. Like Claude Code on a large
   codebase, the agent maintains context **agentically**: search tools
   (ripgrep), read tools, and **notes it maintains itself as files** —
   hierarchical summaries and a story bible. Everything is plain markdown on
   disk: portable, git-diffable, human-readable.
4. **Nothing lands without review.** Every AI change flows through the diff /
   review pipeline; autonomy is governed by permission modes (below).
5. **Everything is checkpointed** — agent runs *and* the story itself (mini
   inbuilt git). The writer can rewind to any point.

## GUI layout (novelist-first)

```
┌────┬────────────────┬──────────────────────────────────┬─────────────────┐
│ R  │    BINDER      │            THE PAGE              │     BISCUIT     │
│ a  │                │                                  │                 │
│ i  │ ▸ Part I       │   Clean WYSIWYG prose canvas     │  Chat with the  │
│ l  │   ▸ Ch 1       │   (today's editor, focus/        │  agent          │
│    │     Scene 1 ●  │    typewriter modes)             │                 │
│ 📖 │     Scene 2 ○  │                                  │  Activity feed  │
│ 👤 │   ▸ Ch 2       │   View switcher:                 │  (plain words)  │
│ 🔍 │ ▸ Part II      │   Page│Corkboard│Outline│Timeline │                 │
│ 🕐 │                │                                  │  Review cards   │
│    │                │   Inline diffs render here       │                 │
└────┴────────────────┴──────────────────────────────────┴─────────────────┘
│ status bar: words today · scene/chapter/book counts · snapshot indicator  │
```

- **Icon rail** (extends existing sidebar rail): 📖 Manuscript (binder) ·
  👤 Story Bible · 🔍 Search · 🕐 History/Snapshots.
- **Binder** (left): the manuscript tree in the project's chosen flavor;
  drag-to-reorder; per-scene status dots (draft/revised/final) and word counts.
  Reordering is structural truth — compile follows it.
- **The Page** (center): today's WYSIWYG editor stays the heart. A view
  switcher swaps in alternative views of the same structure: **Corkboard**
  (scene cards with synopsis — drag to restructure), **Outline** (beats +
  metadata columns: POV, location, status), **Timeline** (chronology vs.
  narrative order). These render as editor-area overlays.
- **Biscuit panel** (right, evolves RightPrompt): chat + a **permission-mode
  selector** (Claude-Code style) + an **activity feed** in writer language
  ("Reading Part II…", "Checking Mira's timeline…", "3 researchers looking up
  1890s rail travel…") with expandable detail — this is the agent monitor, but
  it reads like a writing assistant, not a dashboard.
- **Story Bible** (👤): character/place/thread sheets that look like normal
  editable pages — *they are just markdown files* the agent and writer co-edit.
  A fact can be **locked** (canon the agent must never contradict) with a small
  padlock affordance. No database UI anywhere.
- **Review experience**: small local edits use today's inline diff. Book-wide
  changes (Refine/Extend) get a **review queue**: a summary card ("Elara's age
  changed — 14 scenes affected") that expands to per-scene diffs; accept per
  hunk / per scene / all. Batched and prioritized to avoid review fatigue.
- **History (🕐)**: a friendly timeline of snapshots ("Before Biscuit rewrote
  the villain — 2:14pm"); click to preview, rewind, or branch ("try an
  alternate ending"). Git underneath, never git vocabulary on screen.

## Project layout flavors

On disk, a project is **plain markdown folders** — no proprietary format. The
writer picks a flavor at creation (switchable later; the binder renders all of
them). Grounded in how existing tools organize work (Scrivener's binder of
chapter folders + scene docs with Research/Characters alongside; yWriter's
chapter→scene with per-scene POV/goal metadata; Ulysses' flat one-sheet-per-
scene assembled into chapters later; novelWriter's tree + tagged notes):

**A. Chapters & Scenes (default — Scrivener-style)**
```
manuscript/
  part-1/
    ch-01/scene-01.md, scene-02.md …
  part-2/…
bible/
  characters/elara.md   places/…   threads/…   research/…
notes/                  (freeform)
.wordbird/              (project config, structure manifest, agent state)
```

**B. Scene pool (Ulysses-style)** — a flat `scenes/` folder; ordering and
chapter grouping live in the structure manifest; chapters are assembled at
compile time. For writers who draft in scenes and structure later.

**C. Flat / simple** — one file per chapter (or a single manuscript file).
For minimalists and clean imports of existing drafts.

All flavors share one logical model: **an ordered sequence of prose units + a
bible**. `.wordbird/structure.json` records order/grouping/status/metadata
(per-scene POV, location, synopsis — yWriter-style fields, all optional).
Front matter on each file carries per-unit metadata. **Compile** assembles any
flavor into a full manuscript (md/HTML/PDF/docx) with configurable separators.

## The substrate (invisible to the writer)

### 1. Agent-maintained context (replaces RAG)

The agent keeps itself oriented in a thousands-of-pages novel the way Claude
Code navigates a monorepo:

- **Story bible** (`bible/`) — characters, places, threads, rules, facts with
  provenance ("established ch. 3"). The novel's CLAUDE.md. Co-edited by writer
  and agent; locked facts are hard canon.
- **Summary ladder** (`.wordbird/summaries/`) — agent-maintained synopses at
  every altitude: scene → chapter → part → book. Updated incrementally when
  prose changes (a background task summarizes the changed scene and bubbles up).
  For any task, the agent reads at the right altitude instead of the whole book.
- **Search** — ripgrep over the manuscript (infra already exists in
  `main/ipc/ripgrep.ts`), exposed as agent tools.
- **Continuity notes** (`.wordbird/continuity/`) — open questions, detected
  contradictions, dangling setups; maintained by audit passes.

Staleness is handled agentically too: on file change, a cheap background agent
refreshes the affected summary and checks new facts against the bible.

### 2. Agent toolset

Extends the existing JSON tool-pack + handler system
(`AgentToolHandlers.ts` + `static/agentTools.json`):

| Tool | Purpose |
|---|---|
| `search_manuscript` | ripgrep text/regex search, scoped, with context lines |
| `read_unit` / `read_summary` | read a scene/chapter, or its synopsis at any altitude |
| `list_structure` | binder tree + metadata (order, POV, status) |
| `propose_edit` / `propose_new_unit` | edits & new scenes → review pipeline (extends today's propose tool) |
| `restructure` | propose reorder/split/merge of units → review |
| `read_bible` / `propose_bible_update` | consult / update canon (locked facts read-only) |
| `update_summary` | maintain the summary ladder |
| `log_continuity_issue` | file an issue to the continuity notes / inspector |
| `web_search` / `web_fetch` | internet research with domain guardrails; findings saved as citation-backed notes in `bible/research/` |
| `spawn_agent` | orchestrator-only: launch a sub-agent (below) |
| `snapshot` | create a named content checkpoint before risky work |

### 3. Dynamic multi-agent orchestration (LangGraph)

**The graph is not fixed.** An **orchestrator** receives the writer's intent,
plans, and **spawns sub-agents on demand** (LangGraph `Send` API for runtime
fan-out): explorers sweeping the manuscript in parallel, online researchers,
drafters, continuity auditors, line-editors. Each agent type is a reusable
subgraph with its own toolset + prompt. Results merge back through the review
pipeline. Guardrails: max concurrent agents, step/cost budgets per task
(replacing today's flat `recursionLimit: 10`).

**Autonomy via permission modes** (Claude-Code style; orthogonal to
capability, with per-capability defaults — e.g. book-wide Refine defaults to
Plan, inline Fine-tune to Auto):

- **Plan** — show intended agents + edits; nothing runs/lands without approval.
- **Ask** — cheap reads auto-run; asks before expensive spawns or any commit.
- **Auto** — spawn and apply within budget; writer reviews after.
- **Full-auto** — long-horizon runs (draft Act II overnight) within budget.

### 4. Dual-layer checkpointing

- **Agent runs**: LangGraph **checkpointer** + thread ids (none exist today) —
  long orchestrations survive app restart and resume.
- **Content**: **mini inbuilt git** over the whole project (prose + bible +
  summaries together, so rewind restores text and canon coherently). Built on
  the isomorphic-git foundation already in `main/ipc/project.ts` (`git.init`
  at project creation). Auto-snapshot before/after every agent task; each run
  is tagged to its content checkpoint, so "undo what Biscuit did" and "resume
  that run" share one history. Branching = alternate plot lines.

### 5. The five capabilities on top

- **Brainstorm** — conversational ideation + web research; output lands as
  bible pages + outline (normal files, reviewable).
- **Write** — grounded drafting at any granularity (scene → whole book as a
  resumable queued run), each unit drafted against bible + summaries + prior
  prose, audited before the next.
- **Refine** — semantic change → orchestrator fans out explorers to find the
  impact set → coherent edits across the book → one review queue. Covers both
  canonical changes (age, gender, name) and stylistic passes ("make X wittier").
- **Extend** — weave new elements into existing text: seed setups, adjust
  affected scenes, land payoffs.
- **Fine-tune** — today's inline rewrite, now bible-aware.

## Mapping to today's code (vehicle, not constraint)

- Orchestrator replaces the static graph in
  `main/services/ai/LangGraphManager.ts` (`_buildGraph` → dynamic supervisor +
  subgraphs + checkpointer at `compile()`).
- Tools: handlers in `main/services/ai/AgentToolHandlers.ts` + entries in
  `static/agentTools.json`; reuse `resolveProjectFile` path-guarding; axios
  already in main for web tools; ripgrep service in `main/ipc/ripgrep.ts`.
- Review pipeline: extend `mt::ai:edit-proposal` → inline diff
  (`agentDiff*.ts`) and `agentMultiFileApply.ts` into the batched review queue.
- Binder: evolve `store/project.ts` + `components/sideBar/tree.vue`; new rail
  tabs via `components/sideBar/help.ts` (`rightColumn` is a free string).
- Views (corkboard/outline/timeline): editor-area overlays gated by
  `store/layout.ts` flags (the lower-friction path found in exploration).
- Biscuit panel: evolve `components/rightPrompt/RightPrompt.vue`.
- Persistence: `.wordbird/` is already the project identity
  (`project.json`), git-tracked, watcher-excluded. New IPC module mirroring
  `main/ipc/project.ts` for structure/bible/summary IO; reuse
  `writeMarkdownFileWithDefaults` / `loadMarkdownFile`.

## Roadmap (our build order — capabilities light up independently)

- **P0 — Foundations**: project flavors + structure manifest + binder;
  compile; mini-git snapshots + History UI; agent checkpointer.
- **P1 — Agent core**: dynamic orchestrator + spawnable sub-agents + budgets;
  full toolset (search/read/structure/bible/web); permission modes; activity
  feed. *Brainstorm capability ships here* (research → bible + outline).
- **P2 — Write**: summary ladder; grounded drafting scene→chapter→book;
  resumable long runs; corkboard/outline views.
- **P3 — Refine + review queue**: impact-set fan-out, book-wide transactional
  edits, batched review UX. *The thousand-page stress test.*
- **P4 — Extend + continuity hardening**: weaving engine; background
  continuity auditing; timeline view; locked-canon enforcement.
- **P5 — Polish**: bible-aware fine-tune, import flows for existing
  manuscripts (auto-build bible + summaries from a finished draft), voice/style
  passes, cost/latency tuning.

## Verification

- **Corpus harness**: a public-domain ~100k+ word novel checked into test
  fixtures. Per phase:
  - P0: create each flavor; import corpus into each; reorder in binder →
    compile output matches; snapshot → mutate → rewind restores exactly.
  - P1: brainstorm session with a live web query → bible + outline files
    created, citations present; kill app mid-run → resumes from checkpoint.
  - P2: draft 3 chapters against the corpus bible → summaries update; later
    chapters reference earlier events correctly (audit as oracle).
  - P3: "change character X's age/name" on the corpus → grep proves zero
    missed references; review queue applies + reverts cleanly.
  - P4: inject known contradictions → auditor flags them (track
    precision/recall on a curated eval set).
- Standard gates: `pnpm run lint`, `pnpm run typecheck`, Vitest units for
  structure/compile/diff/orchestrator logic, manual mode runs in `pnpm run dev`.

## Key risks

- **Cost/latency of agentic context at scale** — mitigated by the summary
  ladder (read at altitude, not everything), cheap models for background
  summarization, and hard budgets.
- **Bible/summary drift or hallucinated facts** — provenance on every fact,
  locked canon, incremental re-checks on change, and everything reviewable as
  plain files.
- **Review fatigue on book-wide edits** — the batched review queue must
  summarize and group; design it early (P3), not as an afterthought.
- **Long-run coherence drift in Write** — outline anchoring + per-unit audit
  gates between drafted units.
