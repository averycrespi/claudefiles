# CLAUDE.md

Project-specific instructions for this repository.

## Public Repository Guidelines

This is a public repository. When creating or modifying content:

- **No internal details** - Don't reference specific companies, projects, team names, or internal URLs
- **No private data** - Don't include API keys, tokens, credentials, or sensitive configuration
- **Generic examples** - Use placeholders like `ABC-123` for tickets, `example.com` for domains
- **Sanitize plans** - Review `.plans/` and `.designs/` files before committing to ensure they contain no proprietary information

## Setup

```bash
make install-dev && make stow
```

See the [README](README.md) for requirements and quick start.

## Development Workflow

This repository includes a structured development workflow:

```
/brainstorming → /writing-plans → /executing-plans → /completing-work
```

See [claude/README.md](claude/README.md) for the full skills catalog and workflow details.

## Modifying This Repository

- Edit Claude Code files in `claude/` directory
- Edit Pi agent files in `pi/` directory
- Run `make stow` to apply changes via stow

**IMPORTANT:** Never edit files directly in `~/.claude/` or `~/.pi/`. Those are symlinks managed by stow. Always edit the source files in this repository. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./pi/agent/extensions/foo.ts`, NOT `~/.pi/agent/extensions/foo.ts`
