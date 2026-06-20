# WordBird Contributing Guide

WordBird is a fork of [MarkText](https://github.com/marktext/marktext). We welcome contributions that improve the editing experience, extend Biscuit AI features, or fix bugs.

## Before You Start

- Search existing [issues](https://github.com/Thimbleberrysystems/WordBird/issues) to avoid duplicates.
- For large changes, open an issue first to discuss the approach.

## Pull Request Guidelines

Submit PRs to the **`feat/wordbird`** branch.

- Provide a clear description of the problem and solution.
- Include screenshots or recordings for UI changes.
- Ensure all tests pass: `pnpm run test`
- Run the linter: `pnpm run lint`
- Run the type checker: `pnpm run typecheck`
- All PRs must pass CI before merge.

## Bug Fixes

If resolving a specific issue, reference it in the PR title:
`fix: #123 short description`

## New Features

- Open a discussion or issue first.
- Explain the motivation and describe the proposed solution.
- Submit the PR after the approach is agreed.

## Quick Start

```bash
git clone git@github.com:Thimbleberrysystems/WordBird.git
cd WordBird
pnpm install
pnpm run dev
```

See [CLAUDE.md](../CLAUDE.md) for the full developer guide including architecture, build commands, and testing instructions.

## Style Guide

- 2-space indentation
- No semicolons
- Single quotes
- TypeScript strict mode
- Run `pnpm run lint` before committing

## License

By submitting a pull request you agree that your contribution is made under the terms of the [MIT License](../LICENSE).
