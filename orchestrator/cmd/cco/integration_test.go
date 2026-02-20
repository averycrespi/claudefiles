package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

var ccoBinary string

func TestMain(m *testing.M) {
	// Build the binary once for all tests
	tmpDir, err := os.MkdirTemp("", "cco-test-bin")
	if err != nil {
		panic(err)
	}
	ccoBinary = filepath.Join(tmpDir, "cco")
	cmd := exec.Command("go", "build", "-o", ccoBinary, ".")
	if out, err := cmd.CombinedOutput(); err != nil {
		panic("failed to build cco: " + string(out))
	}
	code := m.Run()
	os.RemoveAll(tmpDir)
	os.Exit(code)
}

// helper: create a temp git repo with an initial commit.
// Returns the real (symlink-resolved) path to avoid macOS /var -> /private/var issues.
func setupRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	// Resolve symlinks so paths match what git reports
	dir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	runCmd(t, dir, "git", "init")
	runCmd(t, dir, "git", "config", "user.email", "test@test.com")
	runCmd(t, dir, "git", "config", "user.name", "Test")
	runCmd(t, dir, "git", "commit", "--allow-empty", "-m", "init")
	return dir
}

// resolvedTempDir returns a symlink-resolved temp dir for XDG_DATA_HOME usage.
func resolvedTempDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func runCmd(t *testing.T, dir, name string, args ...string) string {
	t.Helper()
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %v failed: %s\n%s", name, args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func runCCO(t *testing.T, dir string, xdgDataHome string, args ...string) (string, string, int) {
	t.Helper()
	cmd := exec.Command(ccoBinary, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "XDG_DATA_HOME="+xdgDataHome)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("cco %v failed unexpectedly: %v", args, err)
		}
	}
	return stdout.String(), stderr.String(), exitCode
}

func tmuxSessionName(repoDir string) string {
	return filepath.Base(repoDir) + "-worktree"
}

func tmuxListWindows(t *testing.T, session string) []string {
	t.Helper()
	out, err := exec.Command("tmux", "list-windows", "-t", session, "-F", "#{window_name}").Output()
	if err != nil {
		return nil
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil
	}
	return strings.Split(raw, "\n")
}

func killTmuxSession(session string) {
	exec.Command("tmux", "kill-session", "-t", session).Run()
}

func sessionDir(xdgDataHome, repoDir, branch string) string {
	sanitized := sanitizeBranch(branch)
	return filepath.Join(xdgDataHome, "cco", "sessions", filepath.Base(repoDir), sanitized)
}

func sanitizeBranch(branch string) string {
	var b strings.Builder
	for _, r := range branch {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	return b.String()
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// --- Tests ---

func TestSmoke(t *testing.T) {
	stdout, _, code := runCCO(t, ".", resolvedTempDir(t), "--help")
	if code != 0 {
		t.Fatalf("cco --help exited %d", code)
	}
	if !strings.Contains(stdout, "cco") {
		t.Error("help output should contain 'cco'")
	}
}

func TestAddOutsideGitRepo(t *testing.T) {
	dir := resolvedTempDir(t)
	_, stderr, code := runCCO(t, dir, resolvedTempDir(t), "add", "some-branch")
	if code == 0 {
		t.Error("add should fail outside git repo")
	}
	if !strings.Contains(stderr, "not a git repository") {
		t.Errorf("expected 'not a git repository' in stderr, got: %s", stderr)
	}
}

func TestRmOutsideGitRepo(t *testing.T) {
	dir := resolvedTempDir(t)
	_, stderr, code := runCCO(t, dir, resolvedTempDir(t), "rm", "some-branch")
	if code == 0 {
		t.Error("rm should fail outside git repo")
	}
	if !strings.Contains(stderr, "not a git repository") {
		t.Errorf("expected 'not a git repository' in stderr, got: %s", stderr)
	}
}

func TestAddNewBranch(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	_, _, code := runCCO(t, dir, xdg, "add", "test-branch")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}

	sd := sessionDir(xdg, dir, "test-branch")
	if _, err := os.Stat(sd); os.IsNotExist(err) {
		t.Errorf("session dir should exist at %s", sd)
	}

	windows := tmuxListWindows(t, session)
	if !contains(windows, "test-branch") {
		t.Errorf("expected 'test-branch' window, got: %v", windows)
	}
}

func TestAddExistingBranch(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCmd(t, dir, "git", "branch", "existing-branch")
	_, _, code := runCCO(t, dir, xdg, "add", "existing-branch")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}

	sd := sessionDir(xdg, dir, "existing-branch")
	if _, err := os.Stat(sd); os.IsNotExist(err) {
		t.Error("session dir should exist")
	}
	windows := tmuxListWindows(t, session)
	if !contains(windows, "existing-branch") {
		t.Errorf("expected 'existing-branch' window, got: %v", windows)
	}
}

func TestAddIdempotent(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "idem-branch")
	stdout, _, code := runCCO(t, dir, xdg, "-v", "add", "idem-branch")
	if code != 0 {
		t.Fatalf("second add exited %d", code)
	}
	if !strings.Contains(stdout, "already exists") {
		t.Errorf("expected 'already exists' on second add, got: %s", stdout)
	}
}

func TestRm(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "rm-branch")
	sd := sessionDir(xdg, dir, "rm-branch")
	if _, err := os.Stat(sd); os.IsNotExist(err) {
		t.Fatal("session dir should exist before rm")
	}

	_, _, code := runCCO(t, dir, xdg, "rm", "rm-branch")
	if code != 0 {
		t.Fatalf("rm exited %d", code)
	}

	if _, err := os.Stat(sd); !os.IsNotExist(err) {
		t.Error("session dir should not exist after rm")
	}
	windows := tmuxListWindows(t, session)
	if contains(windows, "rm-branch") {
		t.Error("rm-branch window should not exist after rm")
	}
}

func TestRmIdempotent(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "rm-idem")
	runCCO(t, dir, xdg, "rm", "rm-idem")

	stdout, _, code := runCCO(t, dir, xdg, "-v", "rm", "rm-idem")
	if code != 0 {
		t.Fatalf("second rm exited %d", code)
	}
	if !strings.Contains(stdout, "does not exist") {
		t.Errorf("expected 'does not exist' on second rm, got: %s", stdout)
	}
}

func TestNotifyFromMainRepo(t *testing.T) {
	dir := setupRepo(t)
	_, stderr, code := runCCO(t, dir, resolvedTempDir(t), "notify")
	if code != 0 {
		t.Fatalf("notify exited %d", code)
	}
	if !strings.Contains(stderr, "Skipped") {
		t.Errorf("expected 'Skipped' in stderr when notify run from main repo, got: %s", stderr)
	}
}

func TestNotifyFromWorktree(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "notify-branch")
	sd := sessionDir(xdg, dir, "notify-branch")

	stdout, _, code := runCCO(t, sd, xdg, "notify")
	if code != 0 {
		t.Fatalf("notify exited %d", code)
	}
	if !strings.Contains(stdout, "Adding notification") {
		t.Errorf("expected 'Adding notification' in stdout, got: %s", stdout)
	}

	windows := tmuxListWindows(t, session)
	if !contains(windows, "🔔 notify-branch") {
		t.Errorf("expected bell-prefixed window, got: %v", windows)
	}
}

func TestNotifyIdempotent(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "notify-idem")
	sd := sessionDir(xdg, dir, "notify-idem")

	runCCO(t, sd, xdg, "notify")
	stdout, _, code := runCCO(t, sd, xdg, "-v", "notify")
	if code != 0 {
		t.Fatalf("second notify exited %d", code)
	}
	if !strings.Contains(stdout, "already has a notification") {
		t.Errorf("expected 'already has a notification' on second notify, got: %s", stdout)
	}

	windows := tmuxListWindows(t, session)
	if contains(windows, "🔔 🔔 notify-idem") {
		t.Error("should not have double bell prefix")
	}
}

func TestBranchNameSanitization(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	_, _, code := runCCO(t, dir, xdg, "add", "feat/my-thing")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}

	sd := sessionDir(xdg, dir, "feat/my-thing")
	if _, err := os.Stat(sd); os.IsNotExist(err) {
		t.Error("session dir should exist")
	}
	windows := tmuxListWindows(t, session)
	if !contains(windows, "feat-my-thing") {
		t.Errorf("expected 'feat-my-thing' window, got: %v", windows)
	}
}

func TestAddCopiesLocalSettings(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0o755)
	os.WriteFile(filepath.Join(claudeDir, "settings.local.json"), []byte(`{"test": true}`), 0o644)

	_, _, code := runCCO(t, dir, xdg, "add", "settings-branch")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}

	sd := sessionDir(xdg, dir, "settings-branch")
	copied := filepath.Join(sd, ".claude", "settings.local.json")
	data, err := os.ReadFile(copied)
	if err != nil {
		t.Fatalf("could not read copied settings: %v", err)
	}
	if string(data) != `{"test": true}` {
		t.Errorf("copied settings = %q, want %q", string(data), `{"test": true}`)
	}
}

func TestVerboseFlag(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	// First add creates the session and worktree
	runCCO(t, dir, xdg, "add", "verbose-branch")

	// Second add without -v should not show "already exists"
	stdout, _, code := runCCO(t, dir, xdg, "add", "verbose-branch")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}
	if strings.Contains(stdout, "already exists") {
		t.Error("without -v, debug messages should be hidden")
	}

	// Second add with -v should show "already exists"
	stdout, _, code = runCCO(t, dir, xdg, "-v", "add", "verbose-branch")
	if code != 0 {
		t.Fatalf("add -v exited %d", code)
	}
	if !strings.Contains(stdout, "already exists") {
		t.Errorf("with -v, expected 'already exists' in output, got: %s", stdout)
	}
}
