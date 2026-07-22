<p align="center"><img src="docs/assets/logo-small.png" alt="WordBird" width="128" height="128"></p>

<h1 align="center">WordBird</h1>

<div align="center">
  <strong>The novel-writing app where AI actually understands your whole book.</strong><br>
  Write, revise, and maintain novels of any length — with Biscuit, an agentic AI companion<br>
  that keeps every character, plot thread, and detail coherent across thousands of pages.
</div>

<br>

<div align="center">
  <a href="https://github.com/Thimbleberrysystems/WordBird/releases">
    <img src="https://img.shields.io/badge/download-linux%20|%20mac%20|%20windows-brightgreen.svg" alt="Downloads">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  </a>
</div>

<br>

![WordBird — the binder, the manuscript, and Biscuit](docs/assets/wordbird.png?raw=true)

## Why WordBird?

Every AI writing tool can generate a paragraph. Almost none can keep a **400-page novel coherent** — and not one lets you say *"this character no longer exists"* and safely carry that decision through the entire book.

WordBird is built around three ideas no other novel-writing app combines:

🤖 **A real agent team, not a text box.** Biscuit orchestrates specialist agents — explorers that sweep your manuscript, researchers that hit the web, drafters, continuity auditors, line editors, plotters, and a steward that keeps the whole project in sync — spawned as the work demands and running in parallel, with the operation narrated in plain language.

🔍 **Nothing lands without your say-so.** Every change to your prose arrives as a reviewable diff — accept per change or all at once. Autonomy is a dial you control, and every sweeping operation takes a snapshot first, so one click rewinds it.

🏠 **Your book stays yours.** Plain Markdown files on your disk. Your own AI keys — OpenAI, Anthropic, Gemini, OpenRouter — a Claude Pro/Max subscription, or fully local with Ollama. No cloud lock-in, no proprietary format, no subscription holding your manuscript hostage.

## The writing environment

**The Binder** is a Scrivener-style manuscript tree with drag-to-reorder, per-scene status, POV and word counts. Projects come in three layouts — chapters & scenes, a flat scene pool, or single-file chapters — and all of them are just Markdown folders you can open in any other editor.

**Four ways to see your book.** Page for writing, Corkboard for scene cards and synopses, Outline for a sortable metadata table (status, POV, location, plus goal/conflict/outcome and value-shift craft columns), and Timeline for story-time against narrative order, with subplot threads as filterable lanes.

**The editor** is distraction-free WYSIWYG: you write Markdown and see finished prose. Focus and typewriter modes, a source view, KaTeX math, Mermaid and PlantUML diagrams, 32 themes, and 9 languages.

**Goals that fit how novelists work.** Set a word target with a finish-by date and WordBird computes the daily quota, tracks your streak, and counts the session — plus a per-project history of what you wrote each day.

**Get your book in and out.** Import an existing manuscript and WordBird splits it into chapters and scenes by its own headings. Compile the finished thing to Markdown, EPUB, or DOCX, or export single documents as HTML or PDF.

**Snapshots over the whole project.** Prose and bible are versioned together, so a rewind restores a consistent moment rather than one file. Browse history, diff any file against any snapshot, preview exactly what a restore would change, and roll back — including everything an agent did.

## The story bible

Characters, places, plot threads, and research live as editable Markdown pages that agents read **before** writing and keep current as the story grows.

- **Aliases** — "Liz", "Lizzy", and "the Widow Hale" are all Elizabeth, so searches and revisions never miss a reference
- **Locked canon** — mark a page immutable and no agent may contradict it on any route; if the prose conflicts, the prose gets fixed
- **A style guide** — voice, tense, POV rules, and banned words that every drafting agent obeys
- **Voice exemplars** — passages of your own prose that drafters match, so the book sounds like you rather than like a model
- **A fact ledger** — typed subject–relation–object facts with their source scene, which auditors check new prose against and which generate a relationship map
- **A decisions log** — settled creative choices with reasons, so a question you already answered never gets relitigated
- **Skills** — your own technique files ("how I write fight scenes") that Biscuit follows when the task matches, and `biscuit.md` for standing instructions that ride every turn

An **entity index** reads all of it deterministically — no model involved — to tell you who appears where, and to feed each turn's context with the bible pages that scene actually needs.

## Biscuit, the agentic companion

**Research that lands in your bible.** Web search across multiple providers, full Wikipedia, dictionary and thesaurus, book catalogues and academic papers — with findings saved as cited notes rather than lost in chat. Fetched sources are cached per project and shared between agents working the same turn.

**Drafting grounded in your book.** Scenes are written against your outline, canon, and voice, with the tail of the preceding scene handed forward so continuity holds at the seams.

**Select any passage** → Rewrite, Expand, Describe, or ask anything; results arrive as inline diffs.

**Sweeping revisions.** *"Marcus never existed"* becomes a guided workflow: Biscuit interviews you, maps every affected scene with evidence for your approval, executes in resumable batches through the review queue, then audits that no references survive.

**Continuity and health.** Agents log contradictions — eye colour, timeline, who-knows-what — with quoted evidence, and issues close only when a fix is verified in the prose. A steward runs a deterministic health check over the whole project (missing metadata, stale summaries, contradictory facts, recurring names with no bible page, binder-vs-disk drift) and repairs or reports what it finds.

**Prose linting.** Deterministic checks for doubled words, filler, filter phrases, passive and adverb density, and your own banned terms — plus corpus-wide checks for phrases echoed across scenes and machine-flat rhythm.

**Plans and book runs.** Biscuit writes multi-step plans as files you can edit, and in auto mode can continue through a plan across many turns — bounded by budgets, a no-progress detector, and your approval at every ceiling.

**Watch it work.** An agent tree shows each sub-agent, its task, and its tool calls live; the sidebar marks which views changed while you were elsewhere; transcripts of every conversation are searchable alongside your manuscript.

## Safety rails

- **Three modes** — Ask is mechanically read-only, Approvals queues every change for review, Auto applies after taking a snapshot. Cycle them with ctrl+shift; the choice is remembered per project.
- **59 typed tools, scoped per role** — read-only agents cannot write, and prose changes only reach your files through the review queue or an explicit approval.
- **Nothing touches internals** — `.wordbird/` and `.git/` are off-limits to every tool, enforced when a change is proposed and again when it is applied.
- **Everything is per project** — conversations, permission mode, agent state, and caches never leak between books.
- **Budgets** — caps on agents per wave, waves per turn, and context size, with a ring showing when older conversation will be condensed.

## Download

Grab the latest installer from the **[Releases page](https://github.com/Thimbleberrysystems/WordBird/releases)**:

| Platform | Packages |
|:--|:--|
| **Linux** | AppImage · deb · rpm · snap · tar.gz |
| **macOS** | DMG + zip (Intel & Apple Silicon) |
| **Windows** | Setup .exe + zip (x64 & ARM64) |

Every release ships with `SHA256SUMS.txt` for verification.

> **macOS note:** builds are currently unsigned. After installing, clear the quarantine flag once:
> `xattr -cr /Applications/WordBird.app`

Then open **Settings → AI**, pick a provider (or local Ollama), paste a key, and say hello to Biscuit.

## Development

WordBird is a pnpm monorepo (Electron 42 + Vue 3 + LangGraph). See [CLAUDE.md](CLAUDE.md) for the full developer guide.

```bash
pnpm install
pnpm run dev      # start in development mode
pnpm run test     # unit tests
pnpm run test:e2e # Playwright end-to-end tests
pnpm run build:linux | build:mac | build:win
```

Releases are automated: pushing a tag `vX.Y.Z` builds all platforms and publishes a GitHub Release.

## Contributing

Pull requests are welcome — see [CONTRIBUTING.md](.github/CONTRIBUTING.md). Submit PRs to the **`feat/wordbird`** branch.

## License

WordBird is released under the [MIT License](LICENSE).

It is based on [MarkText](https://github.com/marktext/marktext), copyright © 2017-present Luo Ran and MarkText Contributors, also MIT-licensed. The original copyright notices are preserved in [LICENSE](LICENSE) as required by the MIT License.
