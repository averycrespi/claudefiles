#!/usr/bin/env python3
"""Integration tests for cwm (Claude Worktree Manager)."""

import glob
import os
import re
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
        window_name = re.sub(r"[^a-zA-Z0-9-]", "-", branch)
        return Path(self.temp_dir).parent / f"{self.repo_name}-worktree-{window_name}"

    # -- Tests --

    def test_smoke(self):
        """Verify test infrastructure works - cwm is callable."""
        result = self.run_cwm("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("cwm", result.stdout)

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


if __name__ == "__main__":
    unittest.main()
