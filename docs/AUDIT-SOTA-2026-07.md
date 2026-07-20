# WordBird vs the State of the Art — Audit (July 2026)

**Scope**: WordBird (branch `feat/wordbird`) audited against (a) traditional
novel-writing software (Scrivener 3, Plottr, Dabble, yWriter, Ulysses/iA,
Novlr/LivingWriter, World Anvil/Campfire, Atticus/Vellum), (b) AI-assisted
tools (Sudowrite, NovelCrafter, NovelAI, Squibler, Raptor Write, Marlowe,
AutoCrit), (c) AI-native workflows and research (Claude-Book, Constella,
r/WritingWithAI practice), and (d) the craft methodologies writers expect
tools to scaffold. Method: web research (2025–2026 sources) crossed with a
code-verified feature inventory and the four-lane test inventory
(docs/TESTING.md). Every WordBird status was verified in source, not
assumed — see the Verification appendix.

Legend: ✅ have · ◐ partial · ✗ missing · **S** beyond-SOTA strength.
Priorities: **P0** data-loss/thesis-critical · **P1** table stakes or
thesis leverage · **P2** differentiator · **P3** niche/out-of-scope.

---

## Where WordBird is AHEAD of the state of the art

These are strengths to protect (and market), confirmed against the field:

| Strength | Why it beats SOTA |
|---|---|
| **Whole-project git snapshots** (named, per-file diff, preview, non-destructive restore; every save + every agent batch) | Scrivener — the benchmark — has *manual, per-document* snapshots only; "no whole-project VCS" is a chronic user complaint across all traditional tools. |
| **Continuity steward + typed fact ledger** (subject–relation–object triples, contradiction detection, deterministic health checks, issue lifecycle) | *No mainstream consumer tool actively verifies continuity.* The only comparable system is Claude-Book, an OSS research project. Sudowrite users' top complaint is exactly this ("eye color changes on p.200"). |
| **Review-gated autonomous book runs** (multi-segment drafting with mandatory critic passes, bounded budgets, writer approval cards) | Unclaimed frontier: Squibler auto-generates *ungated*; everything else is assist-only. Gated autonomy is WordBird's thesis and nobody mainstream has it. |
| **7-role multi-agent orchestration** (explorer/researcher/drafter/auditor/line-editor/plotter/steward) with per-mode safety | Multi-agent plan→draft→critique loops exist only in OSS experiments (Claude-Book) — not in any shipped writing product. |
| **Web research with provenance + persistence** (URL provenance gating, disk cache, turn ledger, durable bible/research notes) | No writing tool has SSRF-guarded, provenance-gated, persistent research. |
| **Writer-editable everything** (beat sheets, decisions, skills, biscuit.md as plain markdown canon) | Codex/Story Bible in competitors are app-locked databases; WordBird's canon is portable plain text (the iA/Ulysses data-ownership appeal, applied to AI context). |

---

## The matrix

### 1 · Structure & Planning

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Binder w/ drag-reorder | Scrivener | ✅ flavors, drag, word ring | ✅ novel-structure.spec (moveUnit) | ✗ **dnd path untested** | **P0 test** |
| Corkboard synced to order | Scrivener | ✅ thread/label chips, status cycle, inline synopsis/POV | ✗ | ✅ novel-views.spec | P3 |
| Outliner w/ custom metadata columns | Scrivener custom columns, Story Grid | ◐ fixed meta set, inline edit; no custom columns | — | ✅ novel-views.spec | P2 feature |
| Timeline w/ subplot lanes | Plottr | ◐ narrative/story-time; `thread` lanes exist | — | ◐ lanes untested | P2 test |
| Freeform / arrange-by-label corkboard | Scrivener | ✗ | — | — | P3 |
| Per-scene goal/conflict/outcome + value shift | yWriter, Story Grid | ✅ **SHIPPED** — INovelUnit craft meta; outline craft-columns toggle; update_unit_meta; retro-outline derives them | ✅ story-facts.spec | ✅ novel-views.spec + live flow 33 | done |
| Beat-sheet method templates | Plottr (30+) | ◐ 5 templates as writer-editable bible/structure.md; scene↔beat mapping is doctrine, not UI | ✅ novel-method.spec | ◐ wizard e2e | P2 |
| Research/notes storage | Scrivener research folder | ✅ **S** (provenance + ledger, above) | ✅ | ✅ live | strength |
| Series bible / multi-book | Plottr series view, NovelCrafter series codex | ✗ per-project only | — | — | P2 |

### 2 · Drafting & Editor

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Rich WYSIWYG + math/diagrams | — | ✅ muya (+KaTeX/mermaid/plantuml) | ✅ | ✅ editor/crash suite | P3 |
| Focus / typewriter / distraction-free | Scrivener composition, iA focus | ✅ | — | ◐ class-toggle only | P2 test |
| Scrivenings (stitched multi-scene editing) | Scrivener | ✗ | — | — | P2 feature |
| Comments / annotations layer | Scrivener, Google Docs | ✗ | — | — | **P1 feature** (prereq for margin AI + editing passes) |
| Snapshots + compare | Scrivener (per-doc, manual) | ✅ **S** whole-project | ✅ novel-snapshot.spec | ◐ restore-only e2e | P1 test |
| Global search | all | ✅ ripgrep | — | ✅ | P3 |
| Dictation | Dragon / OS | ✗ (OS dictation types into fields) | — | — | P3 |

### 3 · Story Bible & Consistency

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Bible store w/ aliases | NovelCrafter Codex | ✅ plain-markdown pages + aliases front matter | ✅ entity-index.spec | ◐ entities panel thin | P2 test |
| **Auto-injection of lore by mention** | Codex mention-detection, NovelAI Lorebook triggers | ✅ **SHIPPED** (LoreInjection.ts) — page bodies inlined for mentioned entities; `always`/`budget` front-matter flags | ✅ lore-injection.spec, agent-context.spec | ✅ live flow 30 (subscription) | done |
| Hover previews / heatmaps | Codex | ✗ / ◐ counts | — | — | P2 |
| Bible auto-extraction on import | Sudowrite Import Novel | ✅ **SHIPPED** — POST-IMPORT playbook: steward mines names, proposes review-gated bible pages (only prose-stated traits) | ✅ story-facts.spec, agent-context.spec | ✅ live flow 37 | done |
| Continuity tracking + verification | (nobody mainstream) | ✅ **S** | ✅ | ✅ live | strength |
| Fact ledger w/ contradiction detection | Claude-Book state files | ✅ **S** | ✅ story-facts.spec | ✅ live | strength |
| Relationship maps | Campfire | ✅ **SHIPPED** (RelationshipMap.ts, `relationship_map` tool) — deterministic mermaid from inter-entity fact triples, review-gated, muya-rendered | ✅ relationship-map.spec, story-facts.spec | ✅ live flow 36 | done |

### 4 · AI Drafting & Revision

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Scene-beat → prose UI | Sudowrite, NovelCrafter `/` beats | ✅ **SHIPPED** — SelectionActions "Draft" expands a terse beat into review-gated prose; drafter BEAT EXPANSION doctrine | ✅ prompt-architecture.spec | ✅ selection-actions.spec + live flow 38 | done |
| Rolling prior-scene summaries | NovelCrafter | ✅ summary ladder | ✅ | ✅ live | — |
| Story-aware chat, multi-role | all | ✅ 7 roles × 3 modes | ✅ | ✅ 27 live flows | — |
| Selection tools | Sudowrite Describe/Rewrite/Expand | ◐ rewrite/expand/describe; **no critique-selection** | — | ✅ selection-actions.spec | P2 |
| Review-gated diffs | (nobody) | ✅ **S** | ✅ | ✅ + golden path | strength |
| Sweeping revisions w/ impact maps | (nobody) | ✅ **S** | ✅ revision-engine.spec | ◐ live | strength |
| BYO-key multi-model | NovelCrafter | ✅ 6 providers incl. Claude subscription | ✅ | ✅ | — |
| Per-scene context configurability | NovelAI budgets/always-on | ◐ automatic (brief + handoff); no manual dials | ✅ agent-context.spec | — | P2 |
| Import Markdown → project | Sudowrite | ✅ **SHIPPED** (ManuscriptImporter.ts, `mt::project:import`) — heading/scene-break split into chapters-scenes; recent-page button. docx via converter is a follow-up | ✅ manuscript-importer.spec | ✅ manuscript-import.spec | done |
| Scene handoffs (N→N+1 seam) | (novel) | ✅ | ✅ | ✅ | — |

### 5 · Voice & Style

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Style rules doctrine | — | ✅ bible/style.md read-first + banned terms | ✅ prose-lint.spec | ◐ live | — |
| **Style-exemplar voice priming** | Sudowrite Style Examples/"My Voice", NC Personas | ✅ **SHIPPED** (VoicePriming.ts) — bible/voice/ exemplars few-shot into drafters; steward harvests | ✅ voice-priming.spec, prompt-architecture.spec | ✅ live flow 31 (subscription) | done |
| Creativity / generation params | Sudowrite slider (1–11) | ◐ temperature+maxTokens per provider, buried in prefs | ✅ migrations only | ✗ prefs e2e | P2 test |
| **Anti-slop gate** (echo/rhythm/perplexity) | Claude-Book perplexity gate; community discipline | ✅ **SHIPPED** (ProseLint.lintCorpus, `lint_prose corpus:true`) — cross-scene echo, repeated openings, machine-flat rhythm; book-run critic gate | ✅ prose-lint.spec, story-facts.spec | ✅ live flow 32 (subscription) | done |

### 6 · Critique & Quality

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Margin-note AI feedback anchored to text | Sudowrite Feedback | ✗ (review queue is diff-level) | — | — | P1 feature (needs annotations) |
| Developmental report / genre analytics | Marlowe, AutoCrit bestseller comparison | ◐ steward health is structural, not comparative | ✅ | ✅ | P2 |
| Character-interview persona chat | NC personas | ✅ **SHIPPED** — INTERVIEW A CHARACTER playbook (read-only, grounded in bible + facts, in-voice) | ✅ story-facts.spec | ✅ live flow 34 | done |

### 7 · Goals & Motivation

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Project word target + progress | Scrivener | ✅ (localStorage) + today counter + 14-day bars | ✅ novel-stats.spec | ✗ target-edit UI | P1 test |
| Deadline → daily quota auto-calc | Dabble dynamic recalc | ✅ **SHIPPED** — "count by DATE" target → words/day line | ✅ writing-goals.spec | ✅ word-target.spec | done |
| Session targets / sprints / word wars | Dabble, NaNo culture | ◐ session counter shipped (⏱ chip); timed sprints deferred | ✅ writing-goals.spec | ✅ word-target.spec | P2 |
| Streaks / analytics | Novlr | ✅ **SHIPPED** — 🔥 streak chip (in-progress today doesn't break it) | ✅ | ✅ word-target.spec | done |

### 8 · Output & Publishing

| Capability | SOTA ref | WordBird | Unit | E2E/Live | Priority |
|---|---|---|---|---|---|
| Compile md/EPUB/DOCX | Scrivener compile | ✅ basic | ✅ book-exporter.spec | ✗ **no compile e2e** | P1 test |
| Compile styles / typography themes | Vellum (26 themes), Atticus | ✗ | — | — | P2 |
| Compile-level PDF | Vellum | ◐ per-doc HTML/PDF only (muya) | ✅ | ◐ smoke | P2 |
| Serialization (episodes, buffer, scheduling) | Royal Road/Vella workflows | ✗ | — | — | P3 |

### 9 · Collaboration & Sync

| Capability | SOTA ref | WordBird | Priority |
|---|---|---|---|
| Real-time collaboration | Google Docs (all dedicated tools lose here) | ✗ — local-first stance | P3 (declared out of scope) |
| Track-changes for human-editor handoff | Word | ✗ (ties to annotations layer) | P2 |
| Cloud sync | Dabble | ✗ (git remote is a manual path; whole-project VCS already beats Scrivener's sync story locally) | P3 |

### 10 · Methodologies

| Method | Needs | WordBird | Priority |
|---|---|---|---|
| StC 15 / HJ 12 / 7-pt / RtB / three-act | fillable beat sheets, %-position → scene mapping | ◐ editable templates; mapping = agent doctrine | P2 |
| Snowflake progressive expansion | nested expansion scaffold | ✗ (agents capable; skill-file quick win) | P2 |
| **Pantsing → retroactive outline** | one-click reverse outline | ✅ **SHIPPED** — RETRO-OUTLINE playbook + `/` starter; derives synopsis + craft, proposes no prose | done |
| Matt Bell 3-draft | reverse outline, side-by-side rewrite, version isolation | ◐ snapshots+revisions enable; no scaffold | P3 |
| Editing passes (dev→line→copy) | status workflow + track changes | ◐ status exists; no track changes | P2 |
| Sprints / streak culture | timed counters, streak chips | ✗/◐ | P2 |
| Dictation | robust voice input | ✗ | P3 |

### 11 · Frontier (AI-native)

| Capability | SOTA ref | WordBird | Unit | Live | Priority |
|---|---|---|---|---|---|
| Review-gated autonomous book runs | **unclaimed** | ✅ **S** | ✅ book-run.spec | ✅ | strength |
| Multi-agent plan→draft→critique | Claude-Book (OSS only) | ✅ **S** | ✅ | ✅ | strength |
| Per-chapter state files (situation/inventory/knowledge) | Claude-Book | ◐ summaries+handoffs+fact ledger ≈ equivalent; no explicit inventory | ✅ | ✅ | P2 |
| Perplexity / anti-slop rewrite gate | Claude-Book | ✗ | — | — | P1 (see §5) |
| Character multi-agents (journals/comments) | Constella (research) | ✗ | — | — | P3 |
| Relevance-ranked manuscript retrieval | frontier practice | ◐ deterministic brief + on-demand search; no ranking | ✅ context-budget.spec | — | P2 |
| Research w/ provenance | (nobody) | ✅ **S** | ✅ | ✅ | strength |

---

## Appendix A — Verification evidence (code-confirmed)

| Claim | Evidence |
|---|---|
| No bible page-body injection | `ContextBuilder.buildProjectBrief` / `_renderWhosWhere`: WHO'S WHERE emits appearance counts; page bodies only via read_bible tool calls |
| No voice-exemplar pipeline | `orchestrator/roles.ts` STYLE_NOTE: "read bible/style.md and obey" — rules only, no few-shot prose |
| No import flow | `main/ipc/project.ts`: open-folder dialog only; no docx/md import, no split, no extraction |
| Targets partial | `sideBar/binder.vue`: `wordTarget` (localStorage), today counter from `.wordbird/stats.json`, 14-day bars; streak computed but tooltip-only; no deadline/session mechanics |
| No annotations | no annotation model in muya or desktop renderer |
| Gen params partial | `prefComponents/ai/index.vue`: temperature (default 0.7) + maxTokens per provider → `LangGraphManager` |
| No persona chat | only the new-project *writer* interview doctrine (`Orchestrator.ts`) |
| Selection critique missing | `SelectionActions.vue`: rewrite/expand/describe only |
| Compile basic | `BookExporter.ts`: epub-gen-memory + html-to-docx; no typography engine |
| dnd untested | `moveUnit` logic unit-tested (`novel-structure.spec.ts`); zero renderer dnd→IPC→persist e2e |

## Appendix B — Test-gap workstream

See docs/TESTING.md for lane rules. In priority order:

- **P0**: `test/e2e/binder-drag-reorder.spec.ts` (reorder/cross-chapter/cancelled drag; structure.json + file-survival invariants; corkboard drag sync) · `novel-structure.spec.ts` moveUnit edge extensions.
- **P1**: `compile-export.spec.ts` · `mention-picker.spec.ts` · `conversation-management.spec.ts` · `preferences-surface.spec.ts` · `word-target.spec.ts` · live-e2e per-agent pause/resume + steer flows (openrouter lane, nightly).
- **P2**: `snapshots-ui.spec.ts` · timeline thread-lane assertions · `focus-typewriter.spec.ts` · `entities-panel.spec.ts` · i18n switch · compaction ribbon.

## Appendix C — Feature roadmap candidates (ranked, owner's choice)

1. Codex-style bible auto-injection (2–3d) — EntityIndex mentions → token-budgeted page bodies in briefs/handoffs; `always`/`budget` front-matter flags.
2. Voice-priming exemplars (1–2d) — `bible/voice/` few-shot passages into drafter prompts; steward harvests approved prose.
3. Anti-slop gate (2–3d) — corpus-relative ProseLint metrics (cross-scene echo, rhythm uniformity, pet phrases) as book-run chapter gate.
4. Retroactive outline for pantsers (≤1d) — shipped skill + command over update_unit_meta.
5. Per-scene craft fields (1–2d) — goal/conflict/outcome + value-shift meta; steward flags gaps.
6. Deadline auto-calc + streak chip + session counter (≤1d).
7. Character-interview persona chat (≤1d) — read-only persona from bible page + fact ledger.
8. Manuscript import + review-gated bible extraction (3–5d) — docx/md → scene split → reverse outline + proposed pages.
9. Scene-beat drafting UI (2–3d) · 10. Mermaid relationship map from fact triples (≤1d) · 11. Per-chapter state files (1–2d) · 12. Custom outline columns · 13. Annotations layer (large; prereq for 14) · 14. Margin-anchored AI comments · 15+. compile themes, Scrivenings, serialization, dictation.

Coherent batches: **1+2+3 = "consistency & voice" thesis release** · **4+5+6+7+10 = one-week quick-win batch** · **8 = import/acquisition feature**.
