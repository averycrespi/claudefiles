# cwm Integration Tests Design

## Overview

Integration tests for the `cwm` (Claude Worktree Manager) script that validate all subcommands using real git repos and real tmux sessions. No external Python packages - only the standard library.

## Decisions

- **Real tmux** - Tests use actual tmux sessions for highest confidence
- **Subprocess-based** - cwm invoked as a subprocess (black-box), testing the full CLI
- **No external packages** - Uses `unittest` from the standard library
- **Executable script** - `./tests/test_cwm.py` runs directly via shebang
- **Claude launch ignored** - `cwm add` sends `claude` to tmux window; it fails silently in tests since claude isn't available. We verify the window and worktree exist.

## Test Infrastructure

### setUp / tearDown

**setUp:**
1. `tempfile.mkdtemp()` for a temp directory
2. `git init` + `git commit --allow-empty -m "init"` inside it
3. Save and `os.chdir()` into the temp repo
4. Record absolute path to `scripts/cwm`

**tearDown:**
1. `os.chdir()` back to original directory
2. Kill tmux sessions matching the temp repo name
3. `shutil.rmtree()` the temp dir and any worktree sibling dirs

### Helpers

- `run_cwm(*args)` - Runs `sys.executable scripts/cwm *args` with `capture_output=True`
- `tmux_session_exists(name)` - Checks `tmux has-session -t name`
- `tmux_list_windows(session)` - Returns list of window names for a session

### Unique naming

Session names derive from the temp dir name (randomized by `tempfile`), so parallel test runs won't collide.

## Test Cases

### Precondition tests
- `test_init_outside_git_repo` - Fails with error when not in a git repo
- `test_add_outside_git_repo` - Same for add
- `test_rm_outside_git_repo` - Same for rm

### Happy path
- `test_init` - Creates tmux session, verify with `tmux has-session`
- `test_init_idempotent` - Running init twice succeeds (prints "already exists")
- `test_add` - Creates worktree dir and tmux window, verify both exist
- `test_add_idempotent` - Running add twice succeeds
- `test_add_new_branch` - Branch that doesn't exist yet gets created
- `test_add_existing_branch` - Branch that already exists gets checked out
- `test_rm` - Removes worktree dir and tmux window, verify both gone
- `test_rm_idempotent` - Running rm on already-removed branch succeeds
- `test_notify_from_worktree` - Adds bell emoji to window name
- `test_notify_from_main_repo` - Skips silently (exit 0) with stderr message
- `test_notify_already_notified` - Idempotent, no double bell

### Edge cases
- `test_branch_name_sanitization` - Branch `feat/my-thing` becomes window `feat-my-thing`
- `test_add_copies_local_settings` - `.claude/settings.local.json` gets copied to worktree
