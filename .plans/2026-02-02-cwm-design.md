# cwm - Claude Worktree Manager

## Overview

Consolidate the existing `worktree-*` scripts into a single Python CLI tool called `cwm` (Claude Worktree Manager). This tool manages parallel Claude Code sessions across git worktrees using tmux.

## Decisions

| Decision | Choice |
|----------|--------|
| Name | `cwm` (Claude Worktree Manager) |
| Language | Python with argparse |
| Subcommands | `init`, `add`, `rm`, `attach`, `notify` |
| Structure | Single file with shared helpers |
| Old scripts | Keep for now (manual removal later) |

## CLI Interface

```
cwm init          # Create tmux session for repo
cwm add <branch>  # Create worktree + window + launch Claude
cwm rm <branch>   # Remove worktree + close window
cwm attach        # Attach to tmux session
cwm notify        # Add bell to window (called from hooks)
```

## Shared Helpers

- `get_repo_info()` → returns repo_root, repo_name, session_name
- `require_git_repo()` → exits with error if not in a git repo
- `require_main_repo()` → exits with error if in a worktree (for init/add/rm)
- `require_worktree()` → exits with error if not in a worktree (for notify)
- `branch_to_window_name(branch)` → sanitizes branch name for tmux
- `get_worktree_dir(repo_root, window_name)` → computes worktree path
- `tmux_session_exists(session)` → bool
- `tmux_window_exists(session, window)` → bool (handles bell prefix)

## Subcommand Behaviors

### `cwm init`

- Requires: in git repo, in main repo (not worktree)
- Creates tmux session `{repo_name}-worktree` with window named `main` if it doesn't exist
- Idempotent

### `cwm add <branch>`

- Requires: in git repo, in main repo, branch name argument
- Calls `init` internally to ensure session exists
- Creates worktree at `../{repo_name}-worktree-{window_name}/`
  - If branch exists locally, checks it out
  - If not, creates new branch
- Runs setup scripts if found (`scripts/init`, `scripts/init.sh`, `scripts/setup`, `scripts/setup.sh`)
- Copies `.claude/settings.local.json` to worktree if it exists
- Creates tmux window and runs `claude --permission-mode acceptEdits`
- Idempotent

### `cwm rm <branch>`

- Requires: in git repo, in main repo, branch name argument
- Removes git worktree with `git worktree remove`
- Closes tmux window (handles bell prefix in window name)
- Idempotent

### `cwm attach`

- Requires: in git repo (main or worktree)
- Calls `init` internally to ensure session exists
- If inside tmux: `tmux switch-client`
- If outside tmux: `tmux attach-session`

### `cwm notify`

- Requires: in git repo, in a worktree (not main)
- Parses repo/window name from worktree directory name
- Renames tmux window to `🔔 {window_name}` if not already notified
- Exits silently (exit 0) if preconditions aren't met - designed for hooks

## Error Handling

**Exit codes:**
- `0` - Success
- `1` - User error (missing argument, wrong directory, etc.)

**Error messages:**
- Print to stderr with clear context
- Include usage hint when argument is missing

**Progress output:**
- Print each step as it happens to stdout
- When skipping (idempotent): `Worktree already exists at: /path/...`

**Special case - `notify`:**
- Never exits with error code (would break hooks)
- Prints `Skipped: <reason>` to stderr when preconditions aren't met
- Exits `0` even when skipping

## File Location

- `scripts/cwm` - Python script with `#!/usr/bin/env python3` shebang
- Made executable with `chmod +x`

## Documentation Updates

- Update `CLAUDE.md` script table to reference `cwm` subcommands
- Update `README.md` if it references the old scripts
