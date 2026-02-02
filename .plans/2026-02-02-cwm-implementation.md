# cwm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a Python CLI tool `cwm` that consolidates the worktree-* scripts into a single command with subcommands.

**Architecture:** Single Python script using argparse for subcommand parsing. Shared helper functions handle git/tmux operations. Each subcommand maps to a function.

**Tech Stack:** Python 3, argparse, subprocess

---

### Task 1: Create cwm script with CLI skeleton and shared helpers

**Files:**
- Create: `scripts/cwm`

**Step 1: Create the script with shebang and imports**

```python
#!/usr/bin/env python3
"""cwm - Claude Worktree Manager

Manage parallel Claude Code sessions across git worktrees using tmux.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        prog="cwm",
        description="Claude Worktree Manager - manage parallel Claude Code sessions",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # init
    subparsers.add_parser("init", help="Create tmux session for repo")

    # add
    add_parser = subparsers.add_parser("add", help="Create worktree + window + launch Claude")
    add_parser.add_argument("branch", help="Branch name")

    # rm
    rm_parser = subparsers.add_parser("rm", help="Remove worktree + close window")
    rm_parser.add_argument("branch", help="Branch name")

    # attach
    subparsers.add_parser("attach", help="Attach to tmux session")

    # notify
    subparsers.add_parser("notify", help="Add bell to window (for hooks)")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init()
    elif args.command == "add":
        cmd_add(args.branch)
    elif args.command == "rm":
        cmd_rm(args.branch)
    elif args.command == "attach":
        cmd_attach()
    elif args.command == "notify":
        cmd_notify()


# Placeholder subcommand functions
def cmd_init():
    print("init not implemented")
    sys.exit(1)


def cmd_add(branch: str):
    print(f"add {branch} not implemented")
    sys.exit(1)


def cmd_rm(branch: str):
    print(f"rm {branch} not implemented")
    sys.exit(1)


def cmd_attach():
    print("attach not implemented")
    sys.exit(1)


def cmd_notify():
    print("notify not implemented")
    sys.exit(1)


if __name__ == "__main__":
    main()
```

**Step 2: Make executable and verify CLI parsing works**

Run:
```bash
chmod +x scripts/cwm
scripts/cwm --help
scripts/cwm init
scripts/cwm add test-branch
```

Expected:
- `--help` shows usage with subcommands
- `init` prints "init not implemented"
- `add test-branch` prints "add test-branch not implemented"

**Step 3: Add shared helper functions**

Add these functions before `main()`:

```python
def error(msg: str) -> None:
    """Print error message to stderr and exit."""
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd: list[str], capture: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    """Run a subprocess command."""
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        check=check,
    )


def run_output(cmd: list[str]) -> str:
    """Run a command and return stdout, stripped."""
    result = run(cmd, capture=True)
    return result.stdout.strip()


def is_git_repo() -> bool:
    """Check if current directory is inside a git repository."""
    result = run(["git", "rev-parse", "--is-inside-work-tree"], capture=True, check=False)
    return result.returncode == 0


def is_main_repo() -> bool:
    """Check if current directory is in the main repo (not a worktree)."""
    result = run_output(["git", "rev-parse", "--git-common-dir"])
    return result == ".git"


def get_repo_info() -> tuple[Path, str, str]:
    """Get repo root, repo name, and tmux session name."""
    repo_root = Path(run_output(["git", "rev-parse", "--show-toplevel"]))
    repo_name = repo_root.name
    session_name = f"{repo_name}-worktree"
    return repo_root, repo_name, session_name


def branch_to_window_name(branch: str) -> str:
    """Sanitize branch name for use as tmux window name."""
    return re.sub(r"[^a-zA-Z0-9-]", "-", branch)


def get_worktree_dir(repo_root: Path, window_name: str) -> Path:
    """Get the worktree directory path."""
    repo_name = repo_root.name
    return repo_root.parent / f"{repo_name}-worktree-{window_name}"


def tmux_session_exists(session: str) -> bool:
    """Check if a tmux session exists."""
    result = run(["tmux", "has-session", "-t", session], capture=True, check=False)
    return result.returncode == 0


def tmux_window_exists(session: str, window: str) -> bool:
    """Check if a tmux window exists (handles bell prefix)."""
    result = run(["tmux", "list-windows", "-t", session, "-F", "#{window_name}"], capture=True, check=False)
    if result.returncode != 0:
        return False
    windows = result.stdout.strip().split("\n")
    # Check both with and without bell prefix
    return window in windows or f"🔔 {window}" in windows


def tmux_window_name_with_bell(session: str, window: str) -> str | None:
    """Get the actual window name (with or without bell prefix), or None if not found."""
    result = run(["tmux", "list-windows", "-t", session, "-F", "#{window_name}"], capture=True, check=False)
    if result.returncode != 0:
        return None
    windows = result.stdout.strip().split("\n")
    if window in windows:
        return window
    if f"🔔 {window}" in windows:
        return f"🔔 {window}"
    return None
```

**Step 4: Verify script still runs**

Run:
```bash
scripts/cwm --help
```

Expected: Help message displays without errors

**Step 5: Commit**

```bash
git add scripts/cwm
git commit -m "feat: add cwm script skeleton with CLI parsing and helpers"
```

---

### Task 2: Implement `init` subcommand

**Files:**
- Modify: `scripts/cwm`

**Step 1: Implement cmd_init function**

Replace the placeholder `cmd_init` function:

```python
def cmd_init() -> None:
    """Create tmux session for the repository."""
    if not is_git_repo():
        error("Not in a git repository")

    if not is_main_repo():
        error("This command must be run from the main git repository, not a worktree")

    repo_root, repo_name, session_name = get_repo_info()

    if tmux_session_exists(session_name):
        print(f"tmux session already exists: {session_name}")
    else:
        print(f"Creating tmux session: {session_name} with main window")
        run(["tmux", "new-session", "-d", "-s", session_name, "-n", "main"])
```

**Step 2: Test in the main repo**

Run from the main claudefiles repo:
```bash
cd /Users/averycrespi/claudefiles  # main repo, not worktree
scripts/cwm init
scripts/cwm init  # run again to test idempotence
```

Expected:
- First run: "Creating tmux session: claudefiles-worktree with main window"
- Second run: "tmux session already exists: claudefiles-worktree"

**Step 3: Test error case (from worktree)**

Run from the current worktree:
```bash
scripts/cwm init
```

Expected: "Error: This command must be run from the main git repository, not a worktree"

**Step 4: Commit**

```bash
git add scripts/cwm
git commit -m "feat(cwm): implement init subcommand"
```

---

### Task 3: Implement `add` subcommand

**Files:**
- Modify: `scripts/cwm`

**Step 1: Implement cmd_add function**

Replace the placeholder `cmd_add` function:

```python
def cmd_add(branch: str) -> None:
    """Create worktree, tmux window, and launch Claude Code."""
    if not is_git_repo():
        error("Not in a git repository")

    if not is_main_repo():
        error("This command must be run from the main git repository, not a worktree")

    # Ensure tmux session exists
    cmd_init()

    repo_root, repo_name, session_name = get_repo_info()
    window_name = branch_to_window_name(branch)
    worktree_dir = get_worktree_dir(repo_root, window_name)

    # Create worktree if it doesn't exist
    if worktree_dir.exists():
        print(f"Worktree already exists at: {worktree_dir}")
    else:
        print(f"Creating worktree at: {worktree_dir}")
        # Check if branch exists locally
        result = run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
            capture=True,
            check=False,
        )
        if result.returncode == 0:
            run(["git", "worktree", "add", "--quiet", str(worktree_dir), branch])
        else:
            run(["git", "worktree", "add", "--quiet", "-b", branch, str(worktree_dir)])

    # Run setup scripts if found
    print("Searching for setup scripts ...")
    scripts_dir = worktree_dir / "scripts"
    setup_scripts = []
    if scripts_dir.is_dir():
        for script_name in ["init", "init.sh", "setup", "setup.sh"]:
            script_path = scripts_dir / script_name
            if script_path.is_file() and os.access(script_path, os.X_OK):
                print(f"Found setup script: {script_path}")
                setup_scripts.append(script_path)

    if setup_scripts:
        for script in setup_scripts:
            print(f"Running setup script: {script}")
            subprocess.run([str(script)], cwd=worktree_dir, check=True)
    else:
        print("No setup scripts found")

    # Copy local Claude settings if they exist
    repo_local_settings = repo_root / ".claude" / "settings.local.json"
    worktree_local_settings = worktree_dir / ".claude" / "settings.local.json"

    if repo_local_settings.is_file():
        print(f"Found local Claude settings at: {repo_local_settings}")
        if worktree_local_settings.is_file():
            print("Local Claude settings already exist in worktree")
        else:
            print(f"Copying local Claude settings to: {worktree_local_settings}")
            worktree_local_settings.parent.mkdir(parents=True, exist_ok=True)
            worktree_local_settings.write_text(repo_local_settings.read_text())
    else:
        print("No local Claude settings found in repo")

    # Create tmux window if it doesn't exist
    if tmux_window_exists(session_name, window_name):
        print(f"tmux window already exists: {window_name}")
    else:
        print(f"Creating tmux window: {window_name}")
        run(["tmux", "new-window", "-t", session_name, "-n", window_name, "-c", str(worktree_dir), "-d"])

        print("Launching Claude Code")
        run(["tmux", "send-keys", "-t", f"{session_name}:{window_name}", "claude --permission-mode acceptEdits", "C-m"])
```

**Step 2: Test (from main repo)**

Run from the main claudefiles repo:
```bash
cd /Users/averycrespi/claudefiles
scripts/cwm add test-cwm
```

Expected output shows:
- Creating worktree at: .../claudefiles-worktree-test-cwm
- Setup script messages
- Creating tmux window: test-cwm
- Launching Claude Code

**Step 3: Verify idempotence**

Run again:
```bash
scripts/cwm add test-cwm
```

Expected: All steps report "already exists"

**Step 4: Commit**

```bash
git add scripts/cwm
git commit -m "feat(cwm): implement add subcommand"
```

---

### Task 4: Implement `rm` subcommand

**Files:**
- Modify: `scripts/cwm`

**Step 1: Implement cmd_rm function**

Replace the placeholder `cmd_rm` function:

```python
def cmd_rm(branch: str) -> None:
    """Remove worktree and close tmux window."""
    if not is_git_repo():
        error("Not in a git repository")

    if not is_main_repo():
        error("This command must be run from the main git repository, not a worktree")

    repo_root, repo_name, session_name = get_repo_info()
    window_name = branch_to_window_name(branch)
    worktree_dir = get_worktree_dir(repo_root, window_name)

    # Remove git worktree if it exists
    if worktree_dir.exists():
        print(f"Removing worktree at: {worktree_dir}")
        run(["git", "worktree", "remove", str(worktree_dir)])
    else:
        print(f"Worktree does not exist at: {worktree_dir}")

    # Close tmux window if session and window exist
    if not tmux_session_exists(session_name):
        print(f"tmux session does not exist: {session_name}")
        return

    print(f"tmux session exists: {session_name}")

    actual_window_name = tmux_window_name_with_bell(session_name, window_name)
    if actual_window_name:
        print(f"Closing tmux window: {window_name}")
        run(["tmux", "kill-window", "-t", f"{session_name}:{actual_window_name}"])
    else:
        print(f"tmux window does not exist: {window_name}")
```

**Step 2: Test (clean up the test worktree)**

Run from main repo:
```bash
cd /Users/averycrespi/claudefiles
scripts/cwm rm test-cwm
```

Expected:
- Removing worktree at: .../claudefiles-worktree-test-cwm
- Closing tmux window: test-cwm

**Step 3: Verify idempotence**

Run again:
```bash
scripts/cwm rm test-cwm
```

Expected: Reports "does not exist" for both worktree and window

**Step 4: Commit**

```bash
git add scripts/cwm
git commit -m "feat(cwm): implement rm subcommand"
```

---

### Task 5: Implement `attach` subcommand

**Files:**
- Modify: `scripts/cwm`

**Step 1: Implement cmd_attach function**

Replace the placeholder `cmd_attach` function:

```python
def cmd_attach() -> None:
    """Attach to the tmux session for this repository."""
    if not is_git_repo():
        error("Not in a git repository")

    # attach works from both main repo and worktrees
    # Get the main repo info even if we're in a worktree
    git_common_dir = run_output(["git", "rev-parse", "--git-common-dir"])

    if git_common_dir == ".git":
        # We're in the main repo
        repo_root, repo_name, session_name = get_repo_info()
    else:
        # We're in a worktree - derive main repo from git-common-dir
        # git-common-dir returns something like /path/to/main-repo/.git
        main_git_dir = Path(git_common_dir).resolve()
        repo_root = main_git_dir.parent
        repo_name = repo_root.name
        session_name = f"{repo_name}-worktree"

    # Ensure session exists
    if not tmux_session_exists(session_name):
        # Need to be in main repo to create session
        if git_common_dir != ".git":
            error(f"tmux session does not exist: {session_name}. Run 'cwm init' from the main repository first.")
        cmd_init()

    print(f"Attaching to tmux session: {session_name}")

    if os.environ.get("TMUX"):
        # Already inside tmux: switch to the target session
        run(["tmux", "switch-client", "-t", session_name])
    else:
        # Not inside tmux: attach to the session
        run(["tmux", "attach-session", "-t", session_name])
```

**Step 2: Test from main repo**

```bash
cd /Users/averycrespi/claudefiles
scripts/cwm attach
```

Expected: Attaches to or switches to the claudefiles-worktree session

**Step 3: Commit**

```bash
git add scripts/cwm
git commit -m "feat(cwm): implement attach subcommand"
```

---

### Task 6: Implement `notify` subcommand

**Files:**
- Modify: `scripts/cwm`

**Step 1: Implement cmd_notify function**

Replace the placeholder `cmd_notify` function:

```python
def cmd_notify() -> None:
    """Add notification bell to tmux window name.

    This command is designed to be called from hooks.
    It exits 0 even when skipping to avoid breaking hooks.
    """
    if not is_git_repo():
        print("Skipped: Not in a git repository", file=sys.stderr)
        return

    if is_main_repo():
        print("Skipped: This command must be run from a worktree, not the main repository", file=sys.stderr)
        return

    worktree_root = Path(run_output(["git", "rev-parse", "--show-toplevel"]))
    worktree_name = worktree_root.name

    # Parse repo and window from REPO-worktree-WINDOW format
    match = re.match(r"^(.+)-worktree-(.+)$", worktree_name)
    if not match:
        print(f"Skipped: Worktree name '{worktree_name}' doesn't match expected format", file=sys.stderr)
        return

    repo_name = match.group(1)
    window_name = match.group(2)
    session_name = f"{repo_name}-worktree"

    if not tmux_session_exists(session_name):
        print(f"Skipped: tmux session '{session_name}' does not exist", file=sys.stderr)
        return

    # Check current window state
    result = run(["tmux", "list-windows", "-t", session_name, "-F", "#{window_name}"], capture=True, check=False)
    if result.returncode != 0:
        print(f"Skipped: Could not list windows for session '{session_name}'", file=sys.stderr)
        return

    windows = result.stdout.strip().split("\n")

    if f"🔔 {window_name}" in windows:
        print(f"tmux window '{window_name}' already has a notification")
    elif window_name not in windows:
        print(f"Skipped: tmux window '{window_name}' does not exist", file=sys.stderr)
    else:
        print(f"Adding notification to tmux window: {window_name}")
        run(["tmux", "rename-window", "-t", f"{session_name}:{window_name}", f"🔔 {window_name}"])
```

**Step 2: Test from a worktree**

Run from this worktree:
```bash
scripts/cwm notify
```

Expected: Either adds bell to window name or reports already has notification

**Step 3: Test from main repo (should skip)**

```bash
cd /Users/averycrespi/claudefiles
scripts/cwm notify
```

Expected: "Skipped: This command must be run from a worktree, not the main repository"

**Step 4: Commit**

```bash
git add scripts/cwm
git commit -m "feat(cwm): implement notify subcommand"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md:95-108`
- Modify: `README.md:112-123`

**Step 1: Update CLAUDE.md scripts section**

Replace lines 95-108 with:

```markdown
## Scripts

### Worktree Management

For parallel development using Git worktrees and tmux:

| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `cwm init`           | Start a new tmux session for the current repository                         |
| `cwm attach`         | Attach to the tmux session for the current repository                       |
| `cwm add <branch>`   | Create a new worktree and tmux window for a branch                          |
| `cwm rm <branch>`    | Destroy the worktree and tmux window for a branch                           |
| `cwm notify`         | Add notification bell to tmux window for the current branch (used by hooks) |
```

**Step 2: Update README.md worktree section**

Replace lines 112-123 with:

```markdown
## Worktree Scripts

`cwm` (Claude Worktree Manager) provides commands for parallel development using Git worktrees and tmux:

| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `cwm init`           | Start a new tmux session for the current repository                         |
| `cwm attach`         | Attach to the tmux session for the current repository                       |
| `cwm add <branch>`   | Create a new worktree and tmux window for a branch                          |
| `cwm rm <branch>`    | Destroy the worktree and tmux window for a branch                           |
| `cwm notify`         | Add notification bell to tmux window for the current branch (used by hooks) |
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update worktree documentation for cwm"
```
