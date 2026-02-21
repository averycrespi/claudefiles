# CLAUDE.md

Project-specific instructions for this repository.

## Public Repository Guidelines

This is a public repository. When creating or modifying content:

- **No internal details** - Don't reference specific companies, projects, team names, or internal URLs
- **No private data** - Don't include API keys, tokens, credentials, or sensitive configuration
- **Generic examples** - Use placeholders like `ABC-123` for tickets, `example.com` for domains
- **Sanitize plans/designs** - Review `.plans/` and `.designs/` files before committing to ensure they contain no proprietary information

## Testing

Run cco tests:

```bash
cd orchestrator && go test ./... -count=1
```

**Note:** tmux integration tests require sandbox to be disabled (`dangerouslyDisableSandbox`) due to Unix socket access at `/private/tmp/tmux-*/`. On macOS, use `filepath.EvalSymlinks` on temp dirs in Go tests to handle the `/var` → `/private/var` symlink.

## Repository Structure

```
claude/                  # Symlinked to ~/.claude/ via stow
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
```

## Modifying This Repository

- Edit files in `claude/` directory
- Run `./setup.sh` to apply changes via stow

**IMPORTANT:** Never edit files directly in `~/.claude/`. Those are symlinks managed by stow. Always edit the source files in this repository's `claude/` directory. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`
