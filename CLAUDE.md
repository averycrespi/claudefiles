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
make stow-claude        # symlink claude/ into ~/.claude/
make stow-pi            # symlink pi/agent/ into ~/.pi/agent/
make typecheck          # type-check Pi extension TypeScript files
```

## Modifying This Repository

- Edit Claude Code files in `claude/` directory
- Edit Pi agent files in `pi/` directory
- Only run `make stow-claude` or `make stow-pi` when the user explicitly asks you to

**IMPORTANT:** Never edit files directly in `~/.claude/` or `~/.pi/`. Those are symlinks managed by stow. Always edit the source files in this repository. For example:

- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./pi/agent/extensions/foo.ts`, NOT `~/.pi/agent/extensions/foo.ts`
