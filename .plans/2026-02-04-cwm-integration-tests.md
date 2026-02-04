# cwm Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Write integration tests for all cwm subcommands using real git repos and tmux sessions, with no external Python packages.

**Architecture:** Single test file `tests/test_cwm.py` using `unittest.TestCase`. Each test creates a fresh temp git repo and tmux session in `setUp`, tears them down in `tearDown`. cwm is invoked as a subprocess for black-box testing. Helper methods wrap common operations (running cwm, checking tmux state).

**Tech Stack:** Python 3 standard library only (`unittest`, `tempfile`, `subprocess`, `shutil`, `os`, `sys`, `pathlib`, `glob`)

---

### Task 1: Test infrastructure - setUp, tearDown, helpers

**Files:**
- Create: `tests/test_cwm.py`

**Step 1: Write the test infrastructure and a smoke test**

Create `tests/test_cwm.py` with:

```python
#!/usr/bin/env python3
"""Integration tests for cwm (Claude Worktree Manager)."""

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Absolute path to the cwm script
CWM_PATH = str(Path(__file__).resolve().parent.parent / "scripts" / "cwm")


class TestCwm(unittest.TestCase):
    """Integration tests for cwm commands."""

    def setUp(self):
        """Create a temporary git repo and cd into it."""
        self.original_dir = os.getcwd()
        self.temp_dir = tempfile.mkdtemp()
        os.chdir(self.temp_dir)

        # Initialize git repo with an initial commit
        subprocess.run(["git", "init"], capture_output=True, check=True)
        subprocess.run(
            ["git", "commit", "--allow-empty", "-m", "init"],
            capture_output=True,
            check=True,
        )

        # Derive expected session name (matches cwm's logic)
        self.repo_name = Path(self.temp_dir).name
        self.session_name = f"{self.repo_name}-worktree"

    def tearDown(self):
        """Clean up temp dir, worktree dirs, and tmux sessions."""
        os.chdir(self.original_dir)

        # Kill tmux session if it exists
        subprocess.run(
            ["tmux", "kill-session", "-t", self.session_name],
            capture_output=True,
            check=False,
        )

        # Remove the temp dir and any worktree sibling dirs
        parent = Path(self.temp_dir).parent
        for d in glob.glob(str(parent / f"{self.repo_name}-worktree-*")):
            shutil.rmtree(d, ignore_errors=True)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -- Helpers --

    def run_cwm(self, *args, cwd=None):
        """Run cwm as a subprocess. Returns CompletedProcess."""
        return subprocess.run(
            [sys.executable, CWM_PATH, *args],
            cwd=cwd or os.getcwd(),
            capture_output=True,
            text=True,
        )

    def tmux_session_exists(self):
        """Check if the test's tmux session exists."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", self.session_name],
            capture_output=True,
            check=False,
        )
        return result.returncode == 0

    def tmux_list_windows(self):
        """Return list of window names in the test's tmux session."""
        result = subprocess.run(
            ["tmux", "list-windows", "-t", self.session_name, "-F", "#{window_name}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return []
        return result.stdout.strip().split("\n")

    def get_worktree_dir(self, branch):
        """Get expected worktree directory path for a branch (matches cwm logic)."""
        import re
        window_name = re.sub(r"[^a-zA-Z0-9-]", "-", branch)
        return Path(self.temp_dir).parent / f"{self.repo_name}-worktree-{window_name}"

    # -- Tests --

    def test_smoke(self):
        """Verify test infrastructure works - cwm is callable."""
        result = self.run_cwm("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("cwm", result.stdout)


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run the smoke test**

Run: `python3 tests/test_cwm.py -v`
Expected: PASS - `test_smoke` succeeds, cwm help text is printed.

**Step 3: Make executable and commit**

```bash
chmod +x tests/test_cwm.py
git add tests/test_cwm.py
git commit -m "test: add cwm integration test infrastructure with smoke test"
```

---

### Task 2: Precondition tests - error when outside git repo

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the failing tests**

Add these tests to `TestCwm` (after `test_smoke`, before `if __name__`):

```python
    def test_init_outside_git_repo(self):
        """cwm init fails when not in a git repo."""
        with tempfile.TemporaryDirectory() as non_git_dir:
            result = self.run_cwm("init", cwd=non_git_dir)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Not in a git repository", result.stderr)

    def test_add_outside_git_repo(self):
        """cwm add fails when not in a git repo."""
        with tempfile.TemporaryDirectory() as non_git_dir:
            result = self.run_cwm("add", "some-branch", cwd=non_git_dir)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Not in a git repository", result.stderr)

    def test_rm_outside_git_repo(self):
        """cwm rm fails when not in a git repo."""
        with tempfile.TemporaryDirectory() as non_git_dir:
            result = self.run_cwm("rm", "some-branch", cwd=non_git_dir)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Not in a git repository", result.stderr)
```

**Step 2: Run tests to verify they pass**

Run: `python3 tests/test_cwm.py -v`
Expected: All 4 tests PASS (smoke + 3 precondition tests). These aren't TDD red-green since we're testing existing behavior.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add precondition tests for cwm outside git repo"
```

---

### Task 3: init tests

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the init tests**

Add these tests to `TestCwm`:

```python
    def test_init(self):
        """cwm init creates a tmux session."""
        self.assertFalse(self.tmux_session_exists())
        result = self.run_cwm("init")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Creating tmux session", result.stdout)
        self.assertTrue(self.tmux_session_exists())
        # Verify "main" window exists
        self.assertIn("main", self.tmux_list_windows())

    def test_init_idempotent(self):
        """cwm init succeeds when session already exists."""
        self.run_cwm("init")
        result = self.run_cwm("init")
        self.assertEqual(result.returncode, 0)
        self.assertIn("already exists", result.stdout)
        self.assertTrue(self.tmux_session_exists())
```

**Step 2: Run tests**

Run: `python3 tests/test_cwm.py -v`
Expected: All 6 tests PASS.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add cwm init tests"
```

---

### Task 4: add tests (new branch, existing branch, idempotent)

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the add tests**

Add these tests to `TestCwm`:

```python
    def test_add_new_branch(self):
        """cwm add creates worktree and tmux window for a new branch."""
        result = self.run_cwm("add", "test-branch")
        self.assertEqual(result.returncode, 0)

        # Verify worktree directory exists
        worktree_dir = self.get_worktree_dir("test-branch")
        self.assertTrue(worktree_dir.exists())
        self.assertTrue((worktree_dir / ".git").exists())

        # Verify tmux window exists
        self.assertIn("test-branch", self.tmux_list_windows())

    def test_add_existing_branch(self):
        """cwm add works with an existing branch."""
        # Create the branch first
        subprocess.run(
            ["git", "branch", "existing-branch"],
            capture_output=True,
            check=True,
        )
        result = self.run_cwm("add", "existing-branch")
        self.assertEqual(result.returncode, 0)

        worktree_dir = self.get_worktree_dir("existing-branch")
        self.assertTrue(worktree_dir.exists())
        self.assertIn("existing-branch", self.tmux_list_windows())

    def test_add_idempotent(self):
        """cwm add succeeds when worktree and window already exist."""
        self.run_cwm("add", "idem-branch")
        result = self.run_cwm("add", "idem-branch")
        self.assertEqual(result.returncode, 0)
        self.assertIn("already exists", result.stdout)
```

**Step 2: Run tests**

Run: `python3 tests/test_cwm.py -v`
Expected: All 9 tests PASS.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add cwm add tests"
```

---

### Task 5: rm tests

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the rm tests**

Add these tests to `TestCwm`:

```python
    def test_rm(self):
        """cwm rm removes worktree and tmux window."""
        self.run_cwm("add", "rm-branch")
        worktree_dir = self.get_worktree_dir("rm-branch")
        self.assertTrue(worktree_dir.exists())
        self.assertIn("rm-branch", self.tmux_list_windows())

        result = self.run_cwm("rm", "rm-branch")
        self.assertEqual(result.returncode, 0)

        # Verify worktree and window are gone
        self.assertFalse(worktree_dir.exists())
        self.assertNotIn("rm-branch", self.tmux_list_windows())

    def test_rm_idempotent(self):
        """cwm rm succeeds when worktree and window don't exist."""
        self.run_cwm("add", "rm-idem-branch")
        self.run_cwm("rm", "rm-idem-branch")

        # Run rm again - should succeed with "does not exist" messages
        result = self.run_cwm("rm", "rm-idem-branch")
        self.assertEqual(result.returncode, 0)
        self.assertIn("does not exist", result.stdout)
```

**Step 2: Run tests**

Run: `python3 tests/test_cwm.py -v`
Expected: All 11 tests PASS.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add cwm rm tests"
```

---

### Task 6: notify tests

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the notify tests**

Add these tests to `TestCwm`:

```python
    def test_notify_from_main_repo(self):
        """cwm notify skips silently when run from main repo."""
        result = self.run_cwm("notify")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Skipped", result.stderr)

    def test_notify_from_worktree(self):
        """cwm notify adds bell emoji to tmux window name."""
        self.run_cwm("add", "notify-branch")
        worktree_dir = self.get_worktree_dir("notify-branch")

        # Run notify from inside the worktree
        result = self.run_cwm("notify", cwd=str(worktree_dir))
        self.assertEqual(result.returncode, 0)
        self.assertIn("Adding notification", result.stdout)

        # Verify window has bell prefix
        windows = self.tmux_list_windows()
        self.assertIn("\U0001f514 notify-branch", windows)

    def test_notify_already_notified(self):
        """cwm notify is idempotent - no double bell."""
        self.run_cwm("add", "notify-idem")
        worktree_dir = self.get_worktree_dir("notify-idem")

        self.run_cwm("notify", cwd=str(worktree_dir))
        result = self.run_cwm("notify", cwd=str(worktree_dir))
        self.assertEqual(result.returncode, 0)
        self.assertIn("already has a notification", result.stdout)

        # Verify no double bell
        windows = self.tmux_list_windows()
        self.assertNotIn("\U0001f514 \U0001f514 notify-idem", windows)
```

**Step 2: Run tests**

Run: `python3 tests/test_cwm.py -v`
Expected: All 14 tests PASS.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add cwm notify tests"
```

---

### Task 7: Edge case tests - branch sanitization and local settings copy

**Files:**
- Modify: `tests/test_cwm.py`

**Step 1: Write the edge case tests**

Add these tests to `TestCwm`:

```python
    def test_branch_name_sanitization(self):
        """Branch names with special chars are sanitized for tmux window names."""
        result = self.run_cwm("add", "feat/my-thing")
        self.assertEqual(result.returncode, 0)

        # feat/my-thing should become feat-my-thing
        worktree_dir = self.get_worktree_dir("feat/my-thing")
        self.assertTrue(worktree_dir.exists())
        self.assertIn("feat-my-thing", self.tmux_list_windows())

    def test_add_copies_local_settings(self):
        """cwm add copies .claude/settings.local.json to worktree."""
        # Create local settings in the main repo
        claude_dir = Path(self.temp_dir) / ".claude"
        claude_dir.mkdir(exist_ok=True)
        settings = claude_dir / "settings.local.json"
        settings.write_text('{"test": true}')

        result = self.run_cwm("add", "settings-branch")
        self.assertEqual(result.returncode, 0)

        # Verify settings were copied
        worktree_dir = self.get_worktree_dir("settings-branch")
        copied_settings = worktree_dir / ".claude" / "settings.local.json"
        self.assertTrue(copied_settings.exists())
        self.assertEqual(copied_settings.read_text(), '{"test": true}')
```

**Step 2: Run tests**

Run: `python3 tests/test_cwm.py -v`
Expected: All 16 tests PASS.

**Step 3: Commit**

```bash
git add tests/test_cwm.py
git commit -m "test: add cwm edge case tests for branch sanitization and settings copy"
```
