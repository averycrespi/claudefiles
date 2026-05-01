# CLAUDE.md

Project-specific instructions for this repository.

## Overview

This repo manages configuration for two AI coding agents via [GNU Stow](https://www.gnu.org/software/stow/):

- `claude/` → symlinked to `~/.claude/` (Claude Code settings, skills, hooks, agents)
- `pi/agent/` → symlinked to `~/.pi/agent/` (Pi agent extensions, agents, skills)

## Public Repository Guidelines

This is a public repository. When creating or modifying content:

- **No internal details** - Don't reference specific companies, projects, team names, or internal URLs
- **No private data** - Don't include API keys, tokens, credentials, or sensitive configuration
- **Generic examples** - Use placeholders like `ABC-123` for tickets, `example.com` for domains
- **Sanitize plans** - Review `.plans/` and `.designs/` files before committing to ensure they contain no proprietary information

## Commands

```bash
make install-dev        # install Node dependencies for Pi extensions
make install-playwright # install Playwright for browser automation
make stow-claude         # symlink claude/ into ~/.claude/
make stow-claude-sandbox # stow-claude + patch sandbox overrides
make stow-pi             # symlink pi/agent/ into ~/.pi/agent/
make typecheck          # type-check Pi extension TypeScript files
make test               # run all Pi extension unit tests
```

## Testing

Pure-logic tests run via Node's built-in `node:test` runner, loaded through `tsx` for TypeScript execution:

```bash
make test                                                    # run everything
npx tsx --test pi/agent/extensions/<ext>/*.test.ts           # run one extension
```

Test files import source with `.ts` extensions (e.g. `from "./state.ts"`). This requires `"allowImportingTsExtensions": true` in `tsconfig.json` — don't remove it or `make typecheck` will break.

**Before reporting any Pi extension change complete, run both `make typecheck` AND `make test`.** Typecheck alone catches type errors but not behavioral regressions — the tests cover pure logic that types can't verify.

## Skill Naming Convention

- **Workflow skills** (invoked to perform a task): use gerund form (e.g., `brainstorming`, `reviewing-prs`)
- **Reference skills** (provide information/context): use nouns (e.g., `playwright-cli`, `tdd`)

## Pi Extension Conventions

Use directory-based Pi extensions under `pi/agent/extensions/<name>/`.

Preferred structure:

- `index.ts` — extension entry point
- `README.md` — user-facing behavior, configuration, and usage
- `API.md` — optional programmatic integration docs for other extensions
- `api.ts` — optional curated public export surface referenced by `API.md`
- `*.test.ts` — colocated tests for meaningful logic
- additional `*.ts` files named by concern (`tools.ts`, `render.ts`, `state.ts`, etc.)

Documentation split:

- Keep `README.md` focused on what the extension does for users and agents.
- If an extension exposes reusable code to other extensions, document imports, exports, types, and usage contracts in `API.md` instead of the README.
- Treat `api.ts` as the stable public surface. Anything not exported there should usually be treated as internal.

Implementation conventions:

- **`setWidget` cast pattern.** The typed signature lives at `pi.ui.setWidget` (on `ExtensionUIContext`), but the in-repo convention — used by `workflow-shell/index.ts` and `todo/index.ts` — is to call `(pi as any).setWidget(...)` at the top level, gated on `piAny.hasUI && typeof piAny.setWidget === "function"`. Match this pattern when adding sticky widgets in new extensions.
- **Agent tool schema naming.** Typebox schemas exposed to the agent use snake_case (e.g. `failure_reason`); internal task/state fields stay camelCase (`failureReason`). Map between them in the tool's `execute` body.
- **Atomic agent-tool mutations.** When an agent tool mutates shared state (e.g. `task_list_set`'s `reconcile`), collect ALL validation errors before rejecting, apply changes atomically with a single `notify()` on success, and return errors as tool result text (not `throw`) so the agent can read and recover from them.
- **Stub Node built-ins via wrapper export.** `mock.method` from `node:test` can't replace ESM module exports — they're non-configurable bindings. To stub something like `child_process.spawn`, wrap the call in an exported holder (`export const _spawn = { fn: _nodeSpawn }`) and call through `_spawn.fn(...)`. Tests then `mock.method(_spawn, "fn", stub)`. See `subagents/spawn.ts:19-22` for the reference pattern.

## Modifying This Repository

- Edit Claude Code files in `claude/` directory
- Edit Pi agent files in `pi/` directory
- Only run `make stow-claude` or `make stow-pi` when the user explicitly asks you to

**IMPORTANT:** Never edit files directly in `~/.claude/` or `~/.pi/`. Those are symlinks managed by stow. Always edit the source files in this repository. For example:

- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./pi/agent/extensions/foo.ts`, NOT `~/.pi/agent/extensions/foo.ts`
