<p align="center"><img src="docs/assets/logo-small.png" alt="WordBird" width="100" height="100"></p>

<h1 align="center">WordBird</h1>

<div align="center">
  <strong>A WYSIWYG markdown editor with an AI writing assistant.</strong><br>
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

WordBird is a fork of [MarkText](https://github.com/marktext/marktext), the open-source WYSIWYG markdown editor, extended with **Biscuit** — an integrated AI writing assistant that helps you draft, edit, and refine content directly inside your documents.

Maintained by [Thimbleberrysystems](https://github.com/Thimbleberrysystems).

## Features

- Realtime preview (WYSIWYG) and a clean, distraction-free writing experience.
- **Biscuit AI assistant** — chat with an AI agent that can read and propose edits to your open documents, with inline diff review (Accept / Reject).
- Supports [CommonMark Spec](https://spec.commonmark.org) and [GitHub Flavored Markdown](https://github.github.com/gfm/).
- Math expressions (KaTeX), front matter, emojis, Mermaid diagrams, and PlantUML.
- Source Code mode, Typewriter mode, and Focus mode.
- Multiple themes and customisable fonts.
- Outputs HTML and PDF.

## Screenshot

![](docs/assets/marktext.png?raw=true)

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
