# CLAUDE.md

Project-specific instructions for this repository.

## Public Repository Guidelines

This is a public repository. When creating or modifying content:

- **No internal details** - Don't reference specific companies, projects, team names, or internal URLs
- **No private data** - Don't include API keys, tokens, credentials, or sensitive configuration
- **Generic examples** - Use placeholders like `ABC-123` for tickets, `example.com` for domains
- **Sanitize plans** - Review `.plans/` files before committing to ensure they contain no proprietary information

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

## Testing

Run cco tests:

```bash
cd cco && go test ./... -count=1
```

**Note:** tmux integration tests require sandbox to be disabled (`dangerouslyDisableSandbox`) due to Unix socket access at `/private/tmp/tmux-*/`. On macOS, use `filepath.EvalSymlinks` on temp dirs in Go tests to handle the `/var` → `/private/var` symlink.

## Modifying This Repository

- Edit files in `claude/` directory
- Run `./setup.sh` to apply changes via stow

**IMPORTANT:** Never edit files directly in `~/.claude/`. Those are symlinks managed by stow. Always edit the source files in this repository's `claude/` directory. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`

See [docs/claude-code-config.md](docs/claude-code-config.md) for full details on the configuration structure.
