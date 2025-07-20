#!/usr/bin/env python3

"""
Unit tests for worktree-manager using standard library only.
Tests all classes with dependency injection for mocking.
"""

import unittest
import unittest.mock
import sys
import os
import subprocess

# Add the scripts directory to the path to import our module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

# Import module with hyphen in name using importlib
import importlib.util

script_path = os.path.join(
    os.path.dirname(__file__), "..", "scripts", "worktree-manager"
)

# Read and execute the Python file without extension
with open(script_path, 'r') as f:
    script_content = f.read()

# Create a module object and execute the code
import types
worktree_manager = types.ModuleType("worktree_manager")
exec(script_content, worktree_manager.__dict__)

# Import classes from the module
Logger = worktree_manager.Logger
Shell = worktree_manager.Shell
Git = worktree_manager.Git
Tmux = worktree_manager.Tmux
Sanitizer = worktree_manager.Sanitizer


class MockShell:
    """Mock Shell class for testing without actual subprocess calls."""

    def __init__(self):
        self.commands = []
        self.return_values = {}
        self.default_return = unittest.mock.Mock(returncode=0, stdout="", stderr="")

    def set_return_value(self, cmd_key, return_value):
        """Set return value for specific command."""
        self.return_values[cmd_key] = return_value

    def run(self, cmd_args, capture_output=False, raise_on_error=True):
        """Mock run method that records commands and returns configured values."""
        cmd_key = " ".join(cmd_args)
        self.commands.append(
            {
                "cmd_args": cmd_args,
                "capture_output": capture_output,
                "raise_on_error": raise_on_error,
            }
        )

        if cmd_key in self.return_values:
            result = self.return_values[cmd_key]
            if result is None:
                return None
            if raise_on_error and result.returncode != 0:
                raise subprocess.CalledProcessError(result.returncode, cmd_args)
            return result

        # Default successful return
        if raise_on_error and self.default_return.returncode != 0:
            raise subprocess.CalledProcessError(
                self.default_return.returncode, cmd_args
            )
        return self.default_return


class MockLogger:
    """Mock Logger class for testing without actual output."""

    def __init__(self):
        self.messages = []

    def info(self, message):
        self.messages.append(("info", message))

    def success(self, message):
        self.messages.append(("success", message))

    def error(self, message):
        self.messages.append(("error", message))

    def warning(self, message):
        self.messages.append(("warning", message))


class TestLogger(unittest.TestCase):
    """Test cases for Logger class."""

    def setUp(self):
        self.logger = Logger()

    @unittest.mock.patch("builtins.print")
    def test_info_message(self, mock_print):
        """Test info logging."""
        self.logger.info("test info message")
        mock_print.assert_called_once()
        call_args = mock_print.call_args[0][0]
        self.assertIn("test info message", call_args)
        self.assertEqual(mock_print.call_args[1]["file"], sys.stderr)

    @unittest.mock.patch("builtins.print")
    def test_success_message(self, mock_print):
        """Test success logging."""
        self.logger.success("test success message")
        mock_print.assert_called_once()
        call_args = mock_print.call_args[0][0]
        self.assertIn("test success message", call_args)
        self.assertEqual(mock_print.call_args[1]["file"], sys.stderr)

    @unittest.mock.patch("builtins.print")
    def test_error_message(self, mock_print):
        """Test error logging."""
        self.logger.error("test error message")
        mock_print.assert_called_once()
        call_args = mock_print.call_args[0][0]
        self.assertIn("test error message", call_args)
        self.assertEqual(mock_print.call_args[1]["file"], sys.stderr)

    @unittest.mock.patch("builtins.print")
    def test_warning_message(self, mock_print):
        """Test warning logging."""
        self.logger.warning("test warning message")
        mock_print.assert_called_once()
        call_args = mock_print.call_args[0][0]
        self.assertIn("test warning message", call_args)
        self.assertEqual(mock_print.call_args[1]["file"], sys.stderr)


class TestShell(unittest.TestCase):
    """Test cases for Shell class."""

    def setUp(self):
        self.shell = Shell()

    @unittest.mock.patch("subprocess.run")
    def test_run_without_capture(self, mock_subprocess_run):
        """Test running command without capturing output."""
        mock_result = unittest.mock.Mock(returncode=0)
        mock_subprocess_run.return_value = mock_result

        result = self.shell.run(["echo", "test"])

        mock_subprocess_run.assert_called_once_with(
            ["echo", "test"],
            text=True,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.assertEqual(result, mock_result)

    @unittest.mock.patch("subprocess.run")
    def test_run_with_capture(self, mock_subprocess_run):
        """Test running command with output capture."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="test output")
        mock_subprocess_run.return_value = mock_result

        result = self.shell.run(["echo", "test"], capture_output=True)

        mock_subprocess_run.assert_called_once_with(
            ["echo", "test"], text=True, check=True, capture_output=True
        )
        self.assertEqual(result, mock_result)

    @unittest.mock.patch("subprocess.run")
    def test_run_no_raise_on_error(self, mock_subprocess_run):
        """Test running command without raising on error."""
        mock_result = unittest.mock.Mock(returncode=1)
        mock_subprocess_run.return_value = mock_result

        result = self.shell.run(["false"], raise_on_error=False)

        mock_subprocess_run.assert_called_once_with(
            ["false"],
            text=True,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.assertEqual(result, mock_result)


class TestGit(unittest.TestCase):
    """Test cases for Git class."""

    def setUp(self):
        self.mock_shell = MockShell()
        self.sanitizer = Sanitizer()
        self.git = Git(shell=self.mock_shell, sanitizer=self.sanitizer)

    def test_sanitize_branch_name(self):
        """Test branch name sanitization."""
        test_cases = [
            ("feature/my-branch", "feature-my-branch"),
            ("bug fix #123", "bug-fix--123"),
            ("valid_branch.name", "valid_branch.name"),
            ("special@chars!", "special-chars-"),
        ]

        for input_name, expected in test_cases:
            with self.subTest(input_name=input_name):
                result = self.sanitizer.sanitize_tmux_name(input_name)
                self.assertEqual(result, expected)

    def test_sanitize_branch_name_rejects_empty_string(self):
        """Test that sanitization rejects empty strings."""
        with self.assertRaises(ValueError):
            self.sanitizer.sanitize_tmux_name("")

    def test_is_git_repo_true(self):
        """Test is_git_repo when in a git repository."""
        mock_result = unittest.mock.Mock(returncode=0)
        self.mock_shell.set_return_value(
            "git rev-parse --is-inside-work-tree", mock_result
        )

        result = self.git.is_git_repo()

        self.assertTrue(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertEqual(
            self.mock_shell.commands[0]["cmd_args"],
            ["git", "rev-parse", "--is-inside-work-tree"],
        )
        self.assertFalse(self.mock_shell.commands[0]["raise_on_error"])

    def test_is_git_repo_false(self):
        """Test is_git_repo when not in a git repository."""
        mock_result = unittest.mock.Mock(returncode=1)
        self.mock_shell.set_return_value(
            "git rev-parse --is-inside-work-tree", mock_result
        )

        result = self.git.is_git_repo()

        self.assertFalse(result)

    def test_get_repo_root_success(self):
        """Test getting repository root successfully."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="/path/to/repo\n")
        self.mock_shell.set_return_value("git rev-parse --show-toplevel", mock_result)

        result = self.git.get_repo_root()

        self.assertEqual(result, "/path/to/repo")
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_get_repo_root_failure(self):
        """Test get_repo_root raising GitError on failure."""
        mock_result = unittest.mock.Mock(returncode=1, stdout="")
        self.mock_shell.set_return_value("git rev-parse --show-toplevel", mock_result)

        with self.assertRaises(subprocess.CalledProcessError):
            self.git.get_repo_root()

    @unittest.mock.patch("os.path.basename")
    def test_get_repo_name(self, mock_basename):
        """Test getting repository name."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="/path/to/my-repo\n")
        self.mock_shell.set_return_value("git rev-parse --show-toplevel", mock_result)
        mock_basename.return_value = "my-repo"

        result = self.git.get_repo_name()

        self.assertEqual(result, "my-repo")
        mock_basename.assert_called_once_with("/path/to/my-repo")

    def test_branch_exists_locally_true(self):
        """Test checking if branch exists locally - true case."""
        mock_result = unittest.mock.Mock(returncode=0)
        self.mock_shell.set_return_value(
            "git show-ref --verify --quiet refs/heads/feature-branch", mock_result
        )

        result = self.git.branch_exists_locally("feature/branch")

        self.assertTrue(result)
        # Check that branch name was sanitized
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertIn(
            "refs/heads/feature-branch", self.mock_shell.commands[0]["cmd_args"]
        )

    def test_branch_exists_locally_false(self):
        """Test checking if branch exists locally - false case."""
        mock_result = unittest.mock.Mock(returncode=1)
        self.mock_shell.set_return_value(
            "git show-ref --verify --quiet refs/heads/feature-branch", mock_result
        )

        result = self.git.branch_exists_locally("feature-branch")

        self.assertFalse(result)

    def test_branch_exists_remotely_true(self):
        """Test checking if branch exists remotely - true case."""
        mock_result = unittest.mock.Mock(returncode=0)
        self.mock_shell.set_return_value(
            "git show-ref --verify --quiet refs/remotes/origin/feature-branch",
            mock_result,
        )

        result = self.git.branch_exists_remotely("feature-branch")

        self.assertTrue(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertIn(
            "refs/remotes/origin/feature-branch",
            self.mock_shell.commands[0]["cmd_args"],
        )

    def test_create_worktree_new_branch(self):
        """Test creating worktree with new branch."""
        self.git.create_worktree(
            worktree_dir="/path/to/worktree", branch_name="new/branch", new_branch=True
        )

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = [
            "git",
            "worktree",
            "add",
            "-b",
            "new/branch",
            "/path/to/worktree",
        ]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_create_worktree_existing_branch(self):
        """Test creating worktree with existing branch."""
        self.git.create_worktree(
            worktree_dir="/path/to/worktree",
            branch_name="existing-branch",
            new_branch=False,
        )

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = [
            "git",
            "worktree",
            "add",
            "/path/to/worktree",
            "existing-branch",
        ]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_remove_worktree(self):
        """Test removing a worktree."""
        self.git.remove_worktree("/path/to/worktree")

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["git", "worktree", "remove", "/path/to/worktree"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_prune_worktrees(self):
        """Test pruning orphaned worktrees."""
        self.git.prune_worktrees()

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["git", "worktree", "prune"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_list_worktrees_success(self):
        """Test listing worktrees successfully."""
        stdout = "/path/to/main   abcdef [main]\n/path/to/feature xyz123 [feature]"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        self.mock_shell.set_return_value("git worktree list", mock_result)

        result = self.git.list_worktrees()

        expected = [
            "/path/to/main   abcdef [main]",
            "/path/to/feature xyz123 [feature]",
        ]
        self.assertEqual(result, expected)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_list_worktrees_empty_output(self):
        """Test list_worktrees returning empty list when no worktrees exist."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="")
        self.mock_shell.set_return_value("git worktree list", mock_result)

        result = self.git.list_worktrees()

        self.assertEqual(result, [])
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_list_worktrees_none_result(self):
        """Test list_worktrees raising GitError when shell.run returns None."""
        self.mock_shell.set_return_value("git worktree list", None)

        with self.assertRaises(Git.GitError):
            self.git.list_worktrees()

    def test_worktree_exists_true(self):
        """Test worktree_exists when worktree exists at given path."""
        stdout = "/path/to/main   abcdef [main]\n/path/to/feature xyz123 [feature]"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        self.mock_shell.set_return_value("git worktree list", mock_result)

        result = self.git.worktree_exists("/path/to/feature")

        self.assertTrue(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_worktree_exists_false(self):
        """Test worktree_exists when worktree does not exist at given path."""
        stdout = "/path/to/main   abcdef [main]\n/path/to/feature xyz123 [feature]"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        self.mock_shell.set_return_value("git worktree list", mock_result)

        result = self.git.worktree_exists("/path/to/nonexistent")

        self.assertFalse(result)
        self.assertEqual(len(self.mock_shell.commands), 1)

    def test_worktree_exists_empty_list(self):
        """Test worktree_exists when no worktrees exist."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="")
        self.mock_shell.set_return_value("git worktree list", mock_result)

        result = self.git.worktree_exists("/any/path")

        self.assertFalse(result)
        self.assertEqual(len(self.mock_shell.commands), 1)

    def test_worktree_exists_exact_path_match(self):
        """Test worktree_exists with exact path matching (no false positives)."""
        stdout = "/path/to/feature-branch   abcdef [feature]\n/path/to/feature xyz123 [main]"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        self.mock_shell.set_return_value("git worktree list", mock_result)

        # Should match exact paths only, not partial
        result_exact = self.git.worktree_exists("/path/to/feature")
        result_partial = self.git.worktree_exists("/path/to/feat")
        result_prefix = self.git.worktree_exists("/path/to/feature-branch")

        self.assertTrue(result_exact)
        self.assertFalse(result_partial)
        self.assertTrue(result_prefix)

    def test_worktree_exists_path_sanitization(self):
        """Test worktree_exists sanitizes the input path."""
        stdout = "/safe/path   abcdef [feature]"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        self.mock_shell.set_return_value("git worktree list", mock_result)

        # This should not raise an exception due to path sanitization
        with self.assertRaises(ValueError):
            self.git.worktree_exists("../malicious/path")


class TestTmux(unittest.TestCase):
    """Test cases for Tmux class."""

    def setUp(self):
        self.mock_shell = MockShell()
        self.sanitizer = Sanitizer()
        self.tmux = Tmux(
            shell=self.mock_shell,
            session_name="test/session",
            base_window_name="test/window",
            sanitizer=self.sanitizer,
        )

    def test_sanitize_name(self):
        """Test name sanitization for tmux sessions and windows."""
        test_cases = [
            ("my-session", "my-session"),
            ("session with spaces", "session-with-spaces"),
            ("special@chars!", "special-chars-"),
            ("valid_name.test", "valid_name.test"),
        ]

        for input_name, expected in test_cases:
            with self.subTest(input_name=input_name):
                result = self.sanitizer.sanitize_tmux_name(input_name)
                self.assertEqual(result, expected)

    def test_sanitize_name_rejects_empty_string(self):
        """Test that sanitize_tmux_name rejects empty strings."""
        with self.assertRaises(ValueError):
            self.sanitizer.sanitize_tmux_name("")

    def test_session_name_sanitized_in_constructor(self):
        """Test that session name is sanitized in constructor."""
        tmux = Tmux(
            shell=self.mock_shell,
            session_name="my session!",
            base_window_name="window",
            sanitizer=self.sanitizer,
        )
        self.assertEqual(tmux.session_name, "my-session-")
        self.assertEqual(tmux.base_window_name, "window")

    def test_session_exists_true(self):
        """Test checking if session exists - true case."""
        mock_result = unittest.mock.Mock(returncode=0)
        self.mock_shell.set_return_value(
            "tmux has-session -t test-session", mock_result
        )

        result = self.tmux.session_exists()

        self.assertTrue(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["tmux", "has-session", "-t", "test-session"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)
        self.assertFalse(self.mock_shell.commands[0]["raise_on_error"])

    def test_session_exists_false(self):
        """Test checking if session exists - false case."""
        mock_result = unittest.mock.Mock(returncode=1)
        self.mock_shell.set_return_value(
            "tmux has-session -t test-session", mock_result
        )

        result = self.tmux.session_exists()

        self.assertFalse(result)

    def test_create_session(self):
        """Test creating a new tmux session."""
        self.tmux.create_session()

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["tmux", "new-session", "-d", "-s", "test-session", "-n", "test-window"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_window_exists_true(self):
        """Test checking if window exists - true case."""
        stdout = "window1\ntest-window\nwindow3"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        cmd_key = "tmux list-windows -t test-session -F #{window_name}"
        self.mock_shell.set_return_value(cmd_key, mock_result)

        result = self.tmux.window_exists("test/window")

        self.assertTrue(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_window_exists_false(self):
        """Test checking if window exists - false case."""
        stdout = "window1\nother-window\nwindow3"
        mock_result = unittest.mock.Mock(returncode=0, stdout=stdout)
        cmd_key = "tmux list-windows -t test-session -F #{window_name}"
        self.mock_shell.set_return_value(cmd_key, mock_result)

        result = self.tmux.window_exists("nonexistent")

        self.assertFalse(result)

    def test_window_exists_empty_output(self):
        """Test window_exists returning False when no windows exist."""
        mock_result = unittest.mock.Mock(returncode=0, stdout="")
        cmd_key = "tmux list-windows -t test-session -F #{window_name}"
        self.mock_shell.set_return_value(cmd_key, mock_result)

        result = self.tmux.window_exists("test")

        self.assertFalse(result)
        self.assertEqual(len(self.mock_shell.commands), 1)
        self.assertTrue(self.mock_shell.commands[0]["capture_output"])

    def test_window_exists_none_result(self):
        """Test window_exists raising TmuxError when shell.run returns None."""
        cmd_key = "tmux list-windows -t test-session -F #{window_name}"
        self.mock_shell.set_return_value(cmd_key, None)

        with self.assertRaises(Tmux.TmuxError):
            self.tmux.window_exists("test")

    def test_create_window(self):
        """Test creating a new tmux window."""
        self.tmux.create_window("new/window")

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["tmux", "new-window", "-t", "test-session", "-n", "new-window"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_select_window(self):
        """Test selecting a tmux window."""
        self.tmux.select_window("target/window")

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["tmux", "select-window", "-t", "test-session:target-window"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_kill_window(self):
        """Test killing a tmux window."""
        self.tmux.kill_window("old/window")

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = ["tmux", "kill-window", "-t", "test-session:old-window"]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_send_keys_without_enter(self):
        """Test sending keys to tmux window without enter."""
        self.tmux.send_keys(window_name="target/window", command="ls -la", enter=False)

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = [
            "tmux",
            "send-keys",
            "-t",
            "test-session:target-window",
            "ls -la",
        ]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)

    def test_send_keys_with_enter(self):
        """Test sending keys to tmux window with enter."""
        self.tmux.send_keys(window_name="target/window", command="cd /tmp", enter=True)

        self.assertEqual(len(self.mock_shell.commands), 1)
        expected_cmd = [
            "tmux",
            "send-keys",
            "-t",
            "test-session:target-window",
            "cd /tmp",
            "C-m",
        ]
        self.assertEqual(self.mock_shell.commands[0]["cmd_args"], expected_cmd)


class TestIntegration(unittest.TestCase):
    """Integration tests for class interactions."""

    def setUp(self):
        self.mock_shell = MockShell()
        self.mock_logger = MockLogger()
        self.sanitizer = Sanitizer()

    def test_git_with_real_shell_interface(self):
        """Test Git class with actual Shell interface (mocked subprocess)."""
        with unittest.mock.patch("subprocess.run") as mock_subprocess:
            shell = Shell()
            sanitizer = Sanitizer()
            git = Git(shell=shell, sanitizer=sanitizer)

            # Mock successful git repo check
            mock_subprocess.return_value = unittest.mock.Mock(returncode=0)
            result = git.is_git_repo()
            self.assertTrue(result)

            # Verify subprocess was called correctly
            mock_subprocess.assert_called_with(
                ["git", "rev-parse", "--is-inside-work-tree"],
                text=True,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    def test_tmux_with_real_shell_interface(self):
        """Test Tmux class with actual Shell interface (mocked subprocess)."""
        with unittest.mock.patch("subprocess.run") as mock_subprocess:
            shell = Shell()
            sanitizer = Sanitizer()
            tmux = Tmux(
                shell=shell,
                session_name="test",
                base_window_name="main",
                sanitizer=sanitizer,
            )

            # Mock successful session check
            mock_subprocess.return_value = unittest.mock.Mock(returncode=0)
            result = tmux.session_exists()
            self.assertTrue(result)

            # Verify subprocess was called correctly
            mock_subprocess.assert_called_with(
                ["tmux", "has-session", "-t", "test"],
                text=True,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


class TestSanitizer(unittest.TestCase):
    """Security test cases for Sanitizer class."""

    def setUp(self):
        self.sanitizer = Sanitizer()

    def test_sanitize_path_rejects_null_bytes(self):
        """Test that sanitize_path rejects paths with null bytes."""
        with self.assertRaises(ValueError) as context:
            self.sanitizer.sanitize_path("/tmp/test\x00")
        self.assertIn("null bytes", str(context.exception))

    def test_sanitize_path_rejects_parent_directory_references(self):
        """Test that sanitize_path rejects path traversal attempts."""
        malicious_paths = [
            "/tmp/../../../etc/passwd",
            "/tmp/test/../../../etc/shadow",
            "../../sensitive_file",
            "/tmp/./../../etc/hosts",
        ]
        for path in malicious_paths:
            with self.subTest(path=path):
                with self.assertRaises(ValueError) as context:
                    self.sanitizer.sanitize_path(path)
                self.assertIn("parent directory references", str(context.exception))

    def test_sanitize_path_rejects_relative_when_not_allowed(self):
        """Test that sanitize_path rejects relative paths when not allowed."""
        with self.assertRaises(ValueError) as context:
            self.sanitizer.sanitize_path("relative/path", allow_relative=False)
        self.assertIn("Relative paths not allowed", str(context.exception))

    def test_sanitize_path_accepts_relative_when_allowed(self):
        """Test that sanitize_path accepts relative paths when allowed."""
        result = self.sanitizer.sanitize_path("relative/path", allow_relative=True)
        self.assertEqual(result, "relative/path")

    def test_sanitize_path_rejects_too_long_paths(self):
        """Test that sanitize_path rejects excessively long paths."""
        long_path = "/tmp/" + "a" * 5000
        with self.assertRaises(ValueError) as context:
            self.sanitizer.sanitize_path(long_path)
        self.assertIn("Path too long", str(context.exception))

    def test_sanitize_branch_name_rejects_invalid_git_names(self):
        """Test that sanitize_branch_name rejects invalid git branch names."""
        invalid_names = [
            ".starts_with_dot",
            "ends_with_dot.",
            "-starts_with_dash",
            "ends_with_dash-",
            "contains..double.dots",
            "ends.lock",
            "has space",
            "has~tilde",
            "has^caret",
            "has:colon",
            "has?question",
            "has*asterisk",
            "has[bracket",
            "has\\backslash",
            "has@at",
            "has{brace",
            "has\x00null",
            "has\x1fcontrol",
        ]
        for name in invalid_names:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    self.sanitizer.sanitize_branch_name(name)

    def test_sanitize_branch_name_accepts_valid_names(self):
        """Test that sanitize_branch_name accepts valid git branch names."""
        valid_names = [
            "feature-branch",
            "bugfix_123",
            "release.1.0",
            "valid-branch_name.123",
        ]
        for name in valid_names:
            with self.subTest(name=name):
                result = self.sanitizer.sanitize_branch_name(name)
                self.assertEqual(result, name)

    def test_sanitize_command_string_rejects_malicious_sequences(self):
        """Test that sanitize_command_string rejects malicious command sequences."""
        malicious_commands = [
            "echo test\x1b[2J",  # ESC sequence
            "test\x03",  # Ctrl-C
            "test\x04",  # Ctrl-D
            "test\x0c",  # Ctrl-L
            "test\x01",  # Ctrl-A
            "test\x00end",  # Null byte
        ]
        for cmd in malicious_commands:
            with self.subTest(cmd=repr(cmd)):
                with self.assertRaises(ValueError):
                    self.sanitizer.sanitize_command_string(cmd)

    def test_sanitize_command_string_rejects_too_long_commands(self):
        """Test that sanitize_command_string rejects excessively long commands."""
        long_command = "echo " + "a" * 10000
        with self.assertRaises(ValueError) as context:
            self.sanitizer.sanitize_command_string(long_command)
        self.assertIn("Command too long", str(context.exception))

    def test_sanitize_command_string_accepts_safe_commands(self):
        """Test that sanitize_command_string accepts safe commands."""
        safe_commands = [
            "echo hello world",
            "ls -la",
            "cd /tmp",
            "python script.py --arg value",
        ]
        for cmd in safe_commands:
            with self.subTest(cmd=cmd):
                result = self.sanitizer.sanitize_command_string(cmd)
                self.assertEqual(result, cmd)


class TestSecurityIntegration(unittest.TestCase):
    """Integration tests for security fixes."""

    def setUp(self):
        self.mock_shell = MockShell()
        self.sanitizer = Sanitizer()

    def test_tmux_send_keys_rejects_malicious_commands(self):
        """Test that Tmux.send_keys rejects malicious commands."""
        tmux = Tmux(
            shell=self.mock_shell,
            session_name="test",
            base_window_name="main",
            sanitizer=self.sanitizer,
        )

        malicious_commands = [
            "echo test\x1b[2J",  # ESC sequence to clear screen
            "test\x03",  # Ctrl-C
            "echo\x00null",  # Null byte
        ]

        for cmd in malicious_commands:
            with self.subTest(cmd=repr(cmd)):
                with self.assertRaises(ValueError):
                    tmux.send_keys(window_name="test", command=cmd)

    def test_git_create_worktree_rejects_malicious_paths(self):
        """Test that Git.create_worktree rejects malicious paths."""
        git = Git(shell=self.mock_shell, sanitizer=self.sanitizer)

        malicious_paths = [
            "/tmp/../../../etc/passwd",
            "/tmp/test\x00",
            "/tmp/" + "a" * 5000,  # Too long
        ]

        for path in malicious_paths:
            with self.subTest(path=repr(path)):
                with self.assertRaises(ValueError):
                    git.create_worktree(
                        worktree_dir=path, branch_name="test", new_branch=True
                    )

    def test_git_remove_worktree_rejects_malicious_paths(self):
        """Test that Git.remove_worktree rejects malicious paths."""
        git = Git(shell=self.mock_shell, sanitizer=self.sanitizer)

        malicious_paths = ["/tmp/../../../etc", "/tmp/test\x00null"]

        for path in malicious_paths:
            with self.subTest(path=repr(path)):
                with self.assertRaises(ValueError):
                    git.remove_worktree(path)

    def test_git_branch_exists_with_invalid_names(self):
        """Test that Git branch existence methods handle invalid names properly."""
        git = Git(shell=self.mock_shell, sanitizer=self.sanitizer)

        invalid_names = [
            ".invalid",
            "invalid.",
            "has..dots",
            "has space",
            "has\x00null",
        ]

        for name in invalid_names:
            with self.subTest(name=repr(name)):
                # Should return False for invalid names instead of crashing
                result_local = git.branch_exists_locally(name)
                result_remote = git.branch_exists_remotely(name)
                self.assertFalse(result_local)
                self.assertFalse(result_remote)

    def test_tmux_constructor_validation(self):
        """Test that Tmux constructor validates its parameters."""
        # Test None shell
        with self.assertRaises(ValueError):
            Tmux(
                shell=None,
                session_name="test",
                base_window_name="main",
                sanitizer=self.sanitizer,
            )

        # Test empty session name
        with self.assertRaises(ValueError):
            Tmux(
                shell=self.mock_shell,
                session_name="",
                base_window_name="main",
                sanitizer=self.sanitizer,
            )

        # Test None session name
        with self.assertRaises(ValueError):
            Tmux(
                shell=self.mock_shell,
                session_name=None,
                base_window_name="main",
                sanitizer=self.sanitizer,
            )

        # Test empty base window name
        with self.assertRaises(ValueError):
            Tmux(
                shell=self.mock_shell,
                session_name="test",
                base_window_name="",
                sanitizer=self.sanitizer,
            )

    def test_git_constructor_validation(self):
        """Test that Git constructor validates its parameters."""
        with self.assertRaises(ValueError):
            Git(shell=None, sanitizer=self.sanitizer)


if __name__ == "__main__":
    # Run tests with verbose output
    unittest.main(verbosity=2)
