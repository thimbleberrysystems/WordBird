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

## Why WordBird?

Every AI writing tool can generate a paragraph. Almost none can keep a **400-page novel coherent** — and not one lets you say *"this character no longer exists"* and safely carry that decision through the entire book.

WordBird can. It's built around three ideas no other novel-writing app combines:

🤖 **A real agent team, not a text box.** Biscuit doesn't just autocomplete. It orchestrates specialist AI agents — explorers that sweep your manuscript, researchers that hit the web and Wikipedia, drafters, continuity auditors, line editors, and plotters — spawned dynamically and running in parallel, with the whole operation narrated in plain language.

🔍 **Nothing lands without your say-so.** Every AI change arrives as a reviewable diff — accept per hunk, per file, or all at once — exactly like a modern code editor, but built for prose. Autonomy is a dial you control (Plan / Ask / Auto / Max, cycled with Shift+Tab), and every sweeping change is snapshot-protected so one click rewinds it.

🏠 **Your book stays yours.** Plain Markdown files on your disk. Your own AI keys — OpenAI, Anthropic, Gemini, OpenRouter — or fully local with Ollama. No cloud lock-in, no proprietary format, no subscription holding your manuscript hostage.

## Screenshot

![WordBird — the novel-writing editor with the Biscuit AI companion](docs/assets/wordbird.png?raw=true)

## What it does

### ✍️ A serious writing environment
- **Distraction-free WYSIWYG editor** — write Markdown, see finished prose; focus & typewriter modes
- **The Binder** — Scrivener-style manuscript tree with drag-to-reorder, per-scene status and word counts
- **Corkboard, Outline & Timeline views** — scene cards with synopses, a metadata table (POV, location, status), and story-time vs narrative-order chronology
- **Three project layouts** — chapters & scenes, a flat scene pool, or simple one-file chapters; all plain Markdown folders
- **Compile** — assemble the whole manuscript into one document with configurable separators
- **35 themes, 9 languages**, KaTeX math, Mermaid diagrams, and everything else a Markdown editor should have

### 📖 A story bible the AI treats as law
- Characters, places, plot threads, and research live as editable Markdown pages the AI reads **before** writing and keeps updated as your story grows
- **Locked canon** — mark any fact immutable and no agent may ever contradict it; if prose conflicts, the prose gets fixed
- **Aliases** — "Liz", "Lizzy", and "the Widow Hale" are all Elizabeth; searches and revisions never miss a reference
- A **style guide** (voice, tense, POV rules, banned words) every drafting agent obeys

### 🤖 Biscuit, the agentic companion
- **Brainstorm** with an AI that researches online (web search, full Wikipedia access, dictionary & thesaurus) and saves cited findings into your bible
- **Draft** scenes and chapters grounded in your canon, outline, and voice
- **Select any passage** in the editor → Rewrite / Expand / Describe / ask anything — results arrive as inline diffs
- **Sweeping revisions**: *"Marcus never existed"* becomes a guided workflow — Biscuit interviews you for guidance, maps every affected scene with evidence for your approval, executes in resumable batches through the review queue, then audits that zero references survive
- **Continuity inspector** — agents log contradictions (eye color, timeline, who-knows-what) with quoted evidence; issues close only when verified fixed in the prose
- **29+ typed tools**, each role-scoped: read-only agents can never write; only you approve prose changes

### 🛟 Safety rails everywhere
- **Snapshots & rewind** — the entire project (prose + bible together) is versioned; a friendly History panel rewinds any change, including everything an agent did
- **Durable memory** — conversations survive restarts; long agent runs resume where they stopped; a Copilot-style ring shows when Biscuit will condense older conversation
- **Budgets** — hard caps on agents per wave, waves per turn, and context size; the AI can't run away with your money

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
pnpm run test     # 740+ unit tests
pnpm run build:linux | build:mac | build:win
```

Releases are automated: pushing a tag `vX.Y.Z` builds all platforms and publishes a GitHub Release.

## Contributing

Pull requests are welcome — see [CONTRIBUTING.md](.github/CONTRIBUTING.md). Submit PRs to the **`feat/wordbird`** branch.

## License

WordBird is released under the [MIT License](LICENSE).

It is based on [MarkText](https://github.com/marktext/marktext), copyright © 2017-present Luo Ran and MarkText Contributors, also MIT-licensed. The original copyright notices are preserved in [LICENSE](LICENSE) as required by the MIT License.
