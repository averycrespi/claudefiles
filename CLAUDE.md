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

## Modifying This Repository

- Edit Claude Code files in `claude/` directory
- Edit Pi agent files in `pi/` directory
- Only run `make stow-claude` or `make stow-pi` when the user explicitly asks you to

**IMPORTANT:** Never edit files directly in `~/.claude/` or `~/.pi/`. Those are symlinks managed by stow. Always edit the source files in this repository. For example:

- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./pi/agent/extensions/foo.ts`, NOT `~/.pi/agent/extensions/foo.ts`
