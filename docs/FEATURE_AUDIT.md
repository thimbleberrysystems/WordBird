# WordBird Feature Inventory & State-of-the-Art Audit

_Audited 2026-07-13 against: Sudowrite (Muse 1.5 / Story Engine / Story
Bible / Chapter Continuity), novelcrafter (Codex / Workshop Chat / BYOK),
Scrivener 3 / Atticus / Dabble / Plottr (organization & output), and 2025-26
long-form-generation research (StoryWriter, Magnet/Atlas
character-grounded multi-agent generation, StoryBox)._

Verdicts: **AHEAD** (no mainstream competitor has it) · **SOTA** (parity
with the best) · **PARTIAL** (works, but the best do more) · **GAP**
(missing).

---

## 1. Complete feature inventory

### A. Editor core (MarkText foundation)
| Feature | Notes |
|---|---|
| WYSIWYG markdown (Muya) | CommonMark + GFM, tables, task lists, footnotes |
| Math / diagrams | KaTeX, mermaid, PlantUML, flowchart, vega |
| Source-code mode | CodeMirror round-trip with cursor mapping |
| Typewriter + focus modes | |
| Tabs, quick open, command palette | file.quick-open, view.command-palette |
| Find/replace + project-wide ripgrep search | |
| Spellcheck | multi-language, custom dictionary |
| Themes | 33 (6 base + 27 gogh), semantic status CSS vars |
| i18n | 9 locales, key-parity + placeholder spec-locked |
| Autosave, line-ending normalization, front matter | |
| Images | paste/relative-dir management, uploaders |
| Single-doc export | PDF, styled HTML, print; pandoc import |
| Session restore | buffer stores per window |

### B. Novel model
| Feature | Notes |
|---|---|
| Projects | `.wordbird` marker; flavors: chapters-scenes / scene-pool / flat |
| Binder | drag/drop tree, status/POV/synopsis/word counts, word target + "today" counter, ordinal filenames |
| Views | Page, Corkboard (cards), Outline (metadata table), Timeline (`when` chronology) |
| Compile | whole book → Markdown / **EPUB** / **DOCX** (pure-JS, no pandoc); MD opens for PDF/HTML export |
| Snapshots | git-based; every save + pre-batch auto-snapshots; non-destructive rewind; coalescing with configurable limit |
| Story bible | characters/places/lore pages, front-matter aliases, `locked:` pages, style.md voice law, structure.md beat sheet |
| Writing methods | planningStyle (outline-first/discovery/hybrid) + 5 structure templates (Three-Act, Save the Cat, Hero's Journey, Seven-Point, Romancing the Beat) |
| Summaries ladder | per-unit + book.md, agent-maintained |
| Entity index | deterministic bible×prose appearance index (`where_appears`, WHO'S WHERE) |
| Continuity tracker | issue lifecycle, evidence-gated resolution, sidebar panel |
| Sweeping revisions | directive + per-unit impact map, resumable across restarts |
| Plans | writer-editable plans/ folder, live-open in editor, approval cards |
| Transcripts | conversations mirrored to `.wordbird/transcripts/`, agent-searchable |

### C. Biscuit agent runtime
| Feature | Notes |
|---|---|
| Providers (BYOK) | OpenAI, Anthropic, Google, Ollama (local), OpenRouter; credential validation; live model lists; ollama pull |
| Model-aware context budgets | window resolved per model (OpenRouter/Ollama/family table/override); compaction on real input_tokens; honest context ring; reply cap clamped to model max (default 8192) |
| Orchestration | supervisor + 6 roles (explorer, researcher, drafter, auditor, line-editor, plotter); parallel waves; heavy roles get 4× step budget; **drafter assignments unbounded** (chapter/act/novel-run) |
| Scene handoff | drafter N+1 receives tail of scene N |
| Book run | CONTINUE protocol drives plan-to-completion in auto mode; ceilings raise approval cards and RESUME on approval; no-progress detector; restart-resumable |
| Tools | 41: reads/search/where_appears, propose_* writes, bible/summaries/continuity/facts (record_fact/list_facts)/revisions/plans, file mgmt + deletes, web/wiki/dictionary (SSRF-guarded), ask_writer, set_writing_method |
| Permission modes | ask (mechanically read-only) / approvals / auto — per-project persisted, synced across windows; deletes always confirm |
| Review loop | per-change + apply-all diffs, inline hunks; acceptance/rejection fed back to the model; queue persists across restarts |
| Prompt system | PROJECT_CONVENTIONS, method-branched PLAYBOOKS ("DEFAULTS, never doctrine"), CONTEXT PREP hard rule, research triggers, scene craft (Swain), pass discipline, view awareness |
| Writer vantage | view + open scene + open tabs + unsaved tabs + live selection |
| Chat UX | question cards, plan cards, error cards, stall watchdog, prompt history (↑/↓), steering mid-run, token/cost counter, starter prompts |
| Agent control | Agents sidebar + tree (supervisor's own tools visible), pause/resume/kill per agent/subtree, retry failed |
| Windows | detached Biscuit (bounds persisted, connection-synced), per-window conversations, history list, transcript export |
| Trees stay live | agent disk mutations broadcast refreshes; WSL /mnt polling fix |

### D. Safety & trust
safeStorage-encrypted keys · sandboxed renderer · `.wordbird`/`.git`
untouchable by tools · locked bible pages · always-ask deletes ·
pre-batch snapshots · SSRF guards · secrets never in repo.

### E. Test armor
871 unit tests (scripted models, prompt contracts spec-locked) · 87
Playwright e2e incl. mocked-AI IPC flows (1.5 min, zero stray errors) ·
15-flow live regression suite vs real free models, nightly CI ·
i18n parity spec · license validation.

---

## 2. State-of-the-art audit

### Where WordBird is AHEAD of every mainstream tool
- **Agentic autonomy with governance.** Sudowrite's Story Engine generates
  chapter-by-chapter but has no permission model, no approval queue, no
  agent tree, no resumable book runs. novelcrafter's Workshop Chat is
  single-threaded chat, no sub-agents at all. WordBird's
  supervisor/worker waves + acceptance feedback + ceiling-resume +
  per-project modes is closest to the *research* frontier
  (director/actor architectures) shipped as a product.
- **Acceptance feedback loop.** No competitor tells the model what the
  writer accepted or rejected. This is a genuine differentiator.
- **Model-aware context budgeting + honest telemetry** (ring, token/cost
  counter, clamped reply caps). BYOK tools (novelcrafter) leave this to
  the user.
- **Local-first + BYOK + git-grade snapshots.** Matches novelcrafter's
  BYOK philosophy, beats it on versioning (git vs simple history).
- **Live regression suite against real models.** No comparable product
  publishes anything like this.

### Parity with the best (SOTA)
| Area | Benchmark | Verdict |
|---|---|---|
| Story bible feeding generation | Sudowrite Story Bible reads before every generation | **SOTA** — brief injects outline/bible/summaries/entities each turn |
| Codex-style entity tracking | novelcrafter Codex auto-indexes mentions | **SOTA (agent-side)** — deterministic entity index ≈ codex references; see gap E1 for the writer-facing half |
| Chapter continuity | Sudowrite links ≤25 docs for cross-chapter awareness | **SOTA+** — summaries ladder + scene handoff + entity index have no 25-doc ceiling |
| Structure planning | Plottr templates, Save the Cat beat sheets | **SOTA** — 5 templates + method-aware playbooks + beat-coverage reporting |
| Organization | Scrivener binder/corkboard/outline; Dabble plot grid | **SOTA on core** (binder/corkboard/outline/timeline/snapshots); see gaps E4/E5 |
| Whole-book output | Atticus/Scrivener compile | **PARTIAL** — MD/EPUB/DOCX + PDF path exist; no typeset formatting presets (gap E6) |

### Gaps to close (priority order)

**E1 — Writer-facing Codex view (MEDIUM).** The entity index exists but
only agents can query it. novelcrafter's Codex is a writer surface:
click a character → see every appearance, mentions auto-linked.
*Fix:* an "Entities" sidebar view over `.wordbird/index/entities.json`
(name, aliases, per-scene appearance counts, click-through to scenes;
"create bible page" for unlisted names). Small renderer feature — the
data layer is done.

**E2 — Draft→critique loop inside book runs (MEDIUM/HIGH).** Research
(Magnet: critic loops; StoryWriter: event-based planning + review) shows
~40% fewer editorial defects and ~50% fewer hallucinations when a critic
evaluates each unit before it lands. WordBird has the auditor role and a
HEALTH CHECK playbook, but book-run segments draft without a mandatory
critique step. *Fix:* book-run playbook addendum — each segment ends
with an auditor sweep of the scenes just drafted (continuity vs bible +
entity index, beat coverage), findings folded into the next segment.
Cheap: prompt + live-flow assertion; no new machinery.

**E3 — "Learn my voice" (MEDIUM).** Sudowrite writes "in your voice" from
your prose automatically. WordBird's style.md is law but hand-written.
*Fix:* a `learn_style` flow — line-editor analyzes N writer-chosen sample
scenes → proposes a style.md (diction, rhythm, POV habits, banned words)
through the normal review queue. Prompt + one playbook line.

**E4 — Subplot/POV lanes (MEDIUM).** Dabble's Plot Grid (subplot ×
chapter matrix) and Plottr timelines track *threads*, not just time.
Timeline view covers chronology only. *Fix:* optional `thread`/`arc`
unit-meta field + a lane grouping on the Timeline (and corkboard filter).
Agent-readable via list_structure like `when`/`location`.

**E5 — Scrivener power-user organization (SMALL each).** Missing vs
Scrivener 3: split-editor view; per-document notes/annotations; keywords
+ saved-filter collections. None block novel-writing; add labels/keyword
filtering to the binder first (cheap, agents can read them).

**E6 — Typeset book formatting (LATER).** Atticus-class EPUB/PDF theming
(chapter themes, drop caps, front/back matter). Current EPUB/DOCX is
clean but plain. Defer until export demand is real; pandoc presets or
epub CSS themes are the likely route.

**E7 — Fact-graph world state (RESEARCH, LATER).** The strongest research
systems track a typed world graph (facts, relationships, state changes)
with automated inconsistency detection (Atlas: 85% F1). WordBird's
equivalents (bible prose + entity counts + auditor) are softer. A
`facts.json` ledger (subject-relation-object with source scene) written
during aftercare and checked by auditors would be the next step-change in
1000-page coherence. Big; design before building.

**E8 — Writing analytics (SMALL).** Word target + today counter exist;
no session history/streaks/chapter-growth chart (Dabble/Scrivener have
goals with history). Nice-to-have.

### Non-goals (deliberate positioning, not gaps)
- **Custom fiction-tuned model** (Sudowrite Muse): WordBird is BYOK by
  design — model quality rides the frontier instead of a fork.
- **Cloud collaboration/sync** (novelcrafter tiers): local-first is the
  trust story; git remotes can cover backup later.
- **In-app AI-detection/humanizer gadgets**: out of scope.

---

## 3. Gap closure status (2026-07-13, same day)

All eight gaps were implemented immediately after this audit:
- **E1 DONE** — Entities sidebar view (appearances per scene, aliases,
  click-through to scenes/bible pages; live-refreshes on agent edits).
- **E2 DONE** — CRITIC PASS: book-run segments that drafted prose must end
  with an auditor sweep (bible + fact ledger + timeline + beats) before
  the CONTINUE marker. Spec-locked, auto-mode only.
- **E3 DONE** — LEARN MY VOICE playbook: line-editor distills style.md
  from writer-chosen sample scenes through the review queue.
- **E4 DONE** — `thread` unit metadata: Timeline lane filter, corkboard
  thread/label filters, Outline column, agent-readable/writable, shown in
  the brief's outline.
- **E5 DONE (labels/notes)** — `label` + `notes` unit metadata with
  Outline editing and corkboard label filter. Split-editor view remains
  deferred: it needs dual-Muya-instance work and is tracked as the one
  open organization gap.
- **E6 DONE** — EPUB ships with book typography (serif, chapter openings,
  drop caps, centered scene breaks, justified indents).
- **E7 DONE (v1)** — typed fact ledger (FactService): record_fact /
  list_facts, aftercare records canon, auditors verify against it, brief
  announces the count. Graph relations/automated contradiction scoring
  remain the v2 research follow-up.
- **E8 DONE** — 14-day writing-history sparkline + streak in the binder
  (data from the existing .wordbird/stats.json).

## 3b. Tool audit vs state-of-the-art coding agents (2026-07-13)

We write novels, not code — but the open-source coding agents (Aider 41k★,
Cline 58k★, OpenHands 68k★, Goose, Claude Code) have run the largest live
experiment in what makes an agent harness reliable. Comparison of their
tool surfaces against WordBird's 48 agent tools:

| Capability | Coding SOTA | WordBird |
|---|---|---|
| Checkpoints / rollback | Cline checkpoints | git snapshots + preview_snapshot + non-destructive rewind + per-batch auto-snapshots — **ahead** |
| Permission modes | Cline Plan/Act | ask / approvals / auto, per-project persisted, destructive gates — **ahead** |
| Repo map | Aider tree-sitter map | brief outline + WHO'S WHERE entity index + summaries ladder — parity, novel-shaped |
| Subagents / task lists | Claude Code agents/todos | 6 roles + parallel waves + live plan files — parity+ |
| Context condensation / cost telemetry / BYOK | all | model-aware budgets, context ring, output clamps — parity+ |
| Ranged reads, project search | all | read_project_file(start/end), ripgrep search — parity |
| Web / browser tools | Cline browser | web/wiki/dictionary (SSRF-guarded) — parity (enough) |
| Terminal execution | core to coding agents | N/A for novels — correctly absent |

Four ideas were worth borrowing, all shipped same-day:
- **Anchored text edits** (Aider SEARCH/REPLACE, Claude Code Edit) →
  `propose_text_edit {fname, oldText, newText, occurrence?}`. The coding
  world converged on one lesson: line numbers are the wrong anchor for LLM
  edits — exact-text quotes are dramatically more reliable. Exact-match
  with occurrence disambiguation and re-read-and-quote error coaching;
  emits the standard edit-proposal payload so the whole review pipeline
  (queue, diffs, acceptance loop, auto-apply) is unchanged.
  `propose_project_file_edit` remains for full-file rewrites only.
- **"Run the linter after the edit"** (Aider auto-lint, OpenHands
  test-loop) → `lint_prose {unitId|fname}` backed by
  `novel/ProseLint.ts` (proselint/Vale-inspired, deterministic): doubled
  words, near-repeats, filler/crutch words, POV filter phrases, passive
  and adverb density, sentence-length monotony, punctuation hygiene, and
  banned terms parsed from `bible/style.md`. Line-editors lint before AND
  after their pass; the book-run CRITIC PASS lints every drafted scene.
  Findings are signals, not laws (flexibility directive applies).
- **Standing-instructions file** (CLAUDE.md / .clinerules / AGENTS.md) →
  project-root `biscuit.md`, injected verbatim into every brief (capped
  2000 chars) as WRITER'S STANDING INSTRUCTIONS — "never kill the dog"
  survives compaction now. Onboarding offers to create it.
- **@-mentions in the prompt** (Cline `@file`, Aider `/add`) → typing `@`
  in the Biscuit input opens a picker over scenes, bible pages, and open
  tabs; inserting the project-relative path makes requests unambiguous
  and tool-ready.

**Documented as future, not built:** MCP client support (Cline's
extensibility model). WordBird's tool packs are JSON-defined but handlers
must be registered in code — by design. MCP is the eventual third-party
extension story; heavy and unneeded today.

## 4. Recommended execution order (original)
1. E2 book-run critic loop (largest coherence win per line of code)
2. E1 Entities sidebar view (data layer already built)
3. E3 learn-my-voice → style.md
4. E4 thread lanes on Timeline + corkboard filter
5. E5 binder labels/keywords → split view → doc notes
6. E8 analytics · E6 typeset formatting · E7 fact graph (design doc first)

## Sources
- Sudowrite feature set: sudowrite.com, docs.sudowrite.com (Story Bible),
  kindlepreneur/scribehow 2026 reviews (Muse 1.5, Story Engine, Chapter
  Continuity ≤25 docs, Series folders)
- novelcrafter: novelcrafter.com/features (Codex auto-indexing, Workshop
  Chat, BYOK incl. Ollama), kindlepreneur review
- Organization/output: Scrivener 3 vs Atticus vs Dabble vs Plottr
  comparisons (kindlepreneur, storyflow, manuscriptreport 2026)
- Research: StoryWriter (CIKM 2025), "From Personas to Plot"
  (Magnet/Atlas, arXiv 2607.00918), StoryBox (arXiv 2510.11618)
- Coding agents (§3b): aider.chat/docs/more/edit-formats.html +
  aider.chat/docs/repomap.html; fabianhertwig.com "Code Surgery: How AI
  Assistants Make Precise Edits"; Cline docs (Plan/Act, checkpoints,
  @-mentions, MCP marketplace) via frontman.sh / wetheflywheel.com 2026
  comparisons; OpenHands via opensourceaireview.com, ssojet.com;
  github.com/amperser/proselint, vale.sh
