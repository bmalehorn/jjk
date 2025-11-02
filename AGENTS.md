# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the extension code: `main.ts` wires activation, `repository.ts` orchestrates jj operations, and UI helpers live in `graphWebview.ts`, `operationLogTreeView.ts`, and `utils.ts`.
- Web assets are under `src/webview/`, embedded VS Code bits in `src/vendor/`, and the Zig-based fake editor lives in `src/fakeeditor/` (keep generated binaries in `zig-out/bin/`).
- Tests reside in `src/test/` alongside the `runner.ts`; aggregate new specs through `all-tests.ts`. Generated bundles land in `dist/`—never edit them directly.
- Language assets live in `languages/` and `syntaxes/`; shared artwork sits in `images/`.

## Build, Test, and Development Commands

- `npm install` once per clone to pull VS Code harnesses and codicons.
- `npm run compile` performs type-checking, linting, and a production-mode esbuild bundle for the extension.
- `npm run watch` starts parallel `esbuild` and `tsc` watchers for quick feedback during feature work.
- `npm run package` prepares a distributable: copies web assets, config, codicons, and fake editor binaries—run before local extension installs or releases.
- `npm test` bundles the test suite and executes it in the VS Code runner; use before pushing.
- `npm run build-fakeeditor` rebuilds the Zig helper after changing `src/fakeeditor/` sources or updating Zig.

## Coding Style & Naming Conventions

- Write TypeScript with 2-space indentation, trailing commas, and double quotes; ESLint (`eslint.config.mjs`) enforces these rules.
- Name modules in descriptive camelCase (`graphWebview.ts`, `operationLogTreeView.ts`); co-locate tests with `.test.ts` suffixes mirroring the source name.
- Prefer `async`/`await`, guard vscode API calls against undefined workspace state, and log via the shared `logger`.
- Run `npm run lint` plus `npx prettier --check "src/**/*.ts"` before submitting; use Prettier for formatting adjustments.

## Testing Guidelines

- Mocha (TDD UI) drives tests; each suite is imported by `src/test/all-tests.ts`. Export new describe blocks there to include them in the bundle.
- Exercise repository flows with the fake editor harness (`src/fakeeditor/testdata`) to simulate jj interactions without touching real repos.
- Execute `npm test` locally; aim for coverage on new change-management paths and error handling. Document any flaky cases in the PR.
- Run `MOCHA_GREP=<pattern> npm test` to focus on specific tests during development.

## Commit & Pull Request Guidelines

- Follow existing history: concise, imperative subjects with optional scope (`repository: run readonly commands with --ignore-working-copy`); keep subjects under ~70 characters.
- PRs must summarize behavior changes, list verification steps (e.g., `npm test`), and link related issues. Include GIFs or screenshots for UI tweaks using assets under `images/`.
- Avoid committing regenerated `dist/` artifacts unless the release packaging is the focus; call this out in the PR description when included.

## Extension Setup Notes

- Ensure the `jj` CLI is installed and reachable on `$PATH`; mention alternative paths when adjusting `jjk.jjPath` defaults.
- Document changes to `dist/config.toml` or other persisted settings so users know when manual workspace updates are required.
