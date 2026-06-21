<p align="center"><img src="docs/assets/logo-small.png" alt="WordBird" width="100" height="100"></p>

<h1 align="center">WordBird</h1>

<div align="center">
  <strong>A distraction-free novel-writing editor with an AI writing companion.</strong><br>
  Available for Linux, macOS and Windows.
</div>

<br>

<div align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  </a>
</div>

<br>

## About

WordBird is a focused writing app for **novelists and long-form storytellers**. It pairs a clean, distraction-free WYSIWYG editor with **Biscuit** — an integrated AI writing companion that helps you draft chapters, rewrite passages, and refine prose without leaving your manuscript.

Write in plain Markdown, see it rendered as you type, and let Biscuit propose edits inline — review them chapter by chapter with an Accept / Discard diff, just like a modern code editor, but built for prose.

WordBird is a fork of [MarkText](https://github.com/marktext/marktext), the open-source WYSIWYG Markdown editor, and is maintained by [Thimbleberrysystems](https://github.com/Thimbleberrysystems).

## Features

- **Built for long-form writing** — a calm, full-screen canvas for drafting novels, chapters, and scenes.
- **Biscuit AI companion** — chat with an AI agent that reads your manuscript and proposes edits, with line-level inline diff review (Accept / Discard per change, per file, or across your whole project).
- Realtime preview (WYSIWYG) — write in Markdown, read it as finished prose.
- Focus mode and Typewriter mode to keep you in the flow.
- Supports the [CommonMark Spec](https://spec.commonmark.org) and [GitHub Flavored Markdown](https://github.github.com/gfm/).
- Math expressions (KaTeX), front matter, emojis, Mermaid diagrams, and PlantUML for richer notes and outlines.
- Source Code mode for when you want the raw Markdown.
- Multiple themes and customisable fonts.
- Exports to HTML and PDF for sharing manuscripts.

## Screenshot

![WordBird — the novel-writing editor with the Biscuit AI companion](docs/assets/wordbird.png?raw=true)

## Download and Installation

Builds are available on the [releases page](https://github.com/Thimbleberrysystems/WordBird/releases).

| macOS | Windows | Linux |
|:-----:|:-------:|:-----:|
| `.dmg` (arm64 / x64) | `.exe` setup (x64 / arm64) | AppImage · deb · rpm |

## Development

WordBird is a pnpm monorepo. See [CLAUDE.md](CLAUDE.md) for the full developer guide.

```bash
pnpm install
pnpm run dev      # start in development mode
pnpm run build    # build for the current platform
pnpm run test     # run unit tests
```

## Contributing

Pull requests are welcome. Please read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before submitting one.

Submit PRs to the **`feat/wordbird`** branch.

## License

WordBird is released under the [MIT License](LICENSE).

It is based on [MarkText](https://github.com/marktext/marktext), copyright © 2017-present Luo Ran and MarkText Contributors, also MIT-licensed. The original copyright notices are preserved in [LICENSE](LICENSE) as required by the MIT License.
