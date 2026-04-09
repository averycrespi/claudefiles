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
./setup.sh
```

See the [README](README.md) for requirements and quick start.

## Development Workflow

This repository includes a structured development workflow:

```
/brainstorming → /writing-plans → /executing-plans → /completing-work
```

See [docs/workflow.md](docs/workflow.md) for details. See [docs/skills.md](docs/skills.md) for the full skills and agents catalog.

## Modifying This Repository

- Edit Claude Code files in `claude/` directory
- Edit Pi agent files in `pi/` directory
- Run `./setup.sh` to apply changes via stow

**IMPORTANT:** Never edit files directly in `~/.claude/` or `~/.pi/`. Those are symlinks managed by stow. Always edit the source files in this repository. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./pi/agent/extensions/foo.ts`, NOT `~/.pi/agent/extensions/foo.ts`

See [docs/claude-code-config.md](docs/claude-code-config.md) for full details on the configuration structure.
