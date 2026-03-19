# Claude Code Configuration

This repository manages Claude Code configuration files in the `claude/` directory. The `setup.sh` script uses [GNU Stow](https://www.gnu.org/software/stow/) to symlink `claude/` → `~/.claude/`, so changes made here are immediately reflected in your Claude Code environment.

## Directory Structure

```
claude/
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── sandbox/            # Sandbox VM overrides (settings, CLAUDE.md, scripts)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
```

## How It Works

Running `./setup.sh` creates symlinks from `claude/` into `~/.claude/`. For example:
- `claude/settings.json` → `~/.claude/settings.json`
- `claude/skills/brainstorming/SKILL.md` → `~/.claude/skills/brainstorming/SKILL.md`

This means every Claude Code session on your machine picks up these settings, skills, and agents automatically.

## Modifying Configuration

**Always edit files in the `claude/` directory**, never in `~/.claude/` directly. The files in `~/.claude/` are symlinks — editing them in place can break the stow linkage.

Examples:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`

After editing, run `./setup.sh` to apply changes.
