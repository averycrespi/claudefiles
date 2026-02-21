# Custom Tmux Socket Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Isolate cco's tmux sessions from the user's personal tmux by using a dedicated named socket.

**Architecture:** Add a `tmuxCmd` helper that injects `-L cco` into every tmux command. Update attach logic to detect whether we're inside the cco socket specifically. Update integration test helpers to use the same socket.

**Tech Stack:** Go, tmux `-L` flag

---

### Task 1: Add tmuxCmd helper and update all commands

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go`

**Step 1: Write the failing test**

Add a test that verifies `SessionExists` uses the cco socket by checking that a session created on the cco socket is found, and one on the default socket is not.

In `orchestrator/internal/tmux/tmux_test.go`, add:

```go
func TestSocketIsolation(t *testing.T) {
	session := testSession(t)
	if err := CreateSession(session, "main"); err != nil {
		t.Fatalf("CreateSession() error: %v", err)
	}

	// Session should exist on the cco socket
	if !SessionExists(session) {
		t.Error("session should exist on cco socket")
	}

	// Session should NOT exist on the default socket
	cmd := exec.Command("tmux", "has-session", "-t", session)
	if cmd.Run() == nil {
		t.Error("session should NOT exist on default tmux socket")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test -run TestSocketIsolation -count=1 -v ./internal/tmux/`
Expected: FAIL — both sockets see the same session because no `-L` flag is used yet.

**Step 3: Implement tmuxCmd helper and update all functions**

In `orchestrator/internal/tmux/tmux.go`:

1. Add the socket constant and helper after the `bellPrefix` constant:

```go
const SocketName = "cco"

func tmuxCmd(args ...string) *exec.Cmd {
	fullArgs := append([]string{"-L", SocketName}, args...)
	return exec.Command("tmux", fullArgs...)
}
```

2. Replace every `exec.Command("tmux", ...)` in the non-attach functions with `tmuxCmd(...)`:

- `SessionExists`: `tmuxCmd("has-session", "-t", name)`
- `CreateSession`: `tmuxCmd("new-session", "-d", "-s", name, "-n", windowName)`
- `CreateWindow`: `tmuxCmd("new-window", "-t", session, "-n", window, "-c", cwd, "-d")`
- `KillWindow`: `tmuxCmd("kill-window", "-t", session+":"+window)`
- `KillSession`: `tmuxCmd("kill-session", "-t", name)`
- `SendKeys`: `tmuxCmd("send-keys", "-t", session+":"+window, command, "C-m")`
- `RenameWindow`: `tmuxCmd("rename-window", "-t", session+":"+oldName, newName)`
- `ListWindows`: `tmuxCmd("list-windows", "-t", session, "-F", "#{window_name}")`

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test -run TestSocketIsolation -count=1 -v ./internal/tmux/`
Expected: PASS

**Step 5: Run all tmux unit tests**

Run: `cd orchestrator && go test -count=1 -v ./internal/tmux/`
Expected: All PASS

**Step 6: Commit**

```bash
git add orchestrator/internal/tmux/tmux.go orchestrator/internal/tmux/tmux_test.go
git commit -m "feat(cco): add custom tmux socket for session isolation"
```

---

### Task 2: Update attach functions to detect cco socket

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go`

**Step 1: Write the failing test**

In `orchestrator/internal/tmux/tmux_test.go`, add a test for the `insideCcoSocket` helper:

```go
func TestInsideCcoSocket(t *testing.T) {
	tests := []struct {
		name   string
		tmux   string
		expect bool
	}{
		{"empty", "", false},
		{"default socket", "/tmp/tmux-501/default,1234,0", false},
		{"cco socket", "/tmp/tmux-501/cco,1234,0", true},
		{"private tmp cco", "/private/tmp/tmux-501/cco,5678,1", true},
		{"similar name", "/tmp/tmux-501/cco-other,1234,0", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := insideCcoSocket(tt.tmux); got != tt.expect {
				t.Errorf("insideCcoSocket(%q) = %v, want %v", tt.tmux, got, tt.expect)
			}
		})
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test -run TestInsideCcoSocket -count=1 -v ./internal/tmux/`
Expected: FAIL — `insideCcoSocket` does not exist yet.

**Step 3: Implement insideCcoSocket and update Attach/AttachToWindow**

In `orchestrator/internal/tmux/tmux.go`:

1. Add the detection helper:

```go
func insideCcoSocket(tmuxEnv string) bool {
	if tmuxEnv == "" {
		return false
	}
	// $TMUX format: /path/to/socket,pid,index
	// Extract socket path (everything before first comma)
	socketPath := tmuxEnv
	if i := strings.Index(tmuxEnv, ","); i >= 0 {
		socketPath = tmuxEnv[:i]
	}
	// Check if the socket file basename matches our socket name exactly
	base := filepath.Base(socketPath)
	return base == SocketName
}
```

Add `"path/filepath"` to the imports.

2. Update `Attach`:

```go
func Attach(session string) error {
	if insideCcoSocket(os.Getenv("TMUX")) {
		cmd := tmuxCmd("switch-client", "-t", session)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	cmd := tmuxCmd("attach-session", "-t", session)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
```

3. Update `AttachToWindow`:

```go
func AttachToWindow(session, window string) error {
	target := session + ":" + window
	if insideCcoSocket(os.Getenv("TMUX")) {
		cmd := tmuxCmd("switch-client", "-t", target)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	cmd := tmuxCmd("attach-session", "-t", target)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test -count=1 -v ./internal/tmux/`
Expected: All PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/tmux/tmux.go orchestrator/internal/tmux/tmux_test.go
git commit -m "feat(cco): detect cco socket for attach behavior"
```

---

### Task 3: Update integration test helpers

**Files:**
- Modify: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Update tmuxListWindows helper**

Change `tmuxListWindows` to use the cco socket:

```go
func tmuxListWindows(t *testing.T, session string) []string {
	t.Helper()
	out, err := exec.Command("tmux", "-L", tmux.SocketName, "list-windows", "-t", session, "-F", "#{window_name}").Output()
	if err != nil {
		return nil
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil
	}
	return strings.Split(raw, "\n")
}
```

Add the import `"github.com/averycrespi/claudefiles/orchestrator/internal/tmux"` to the imports.

**Step 2: Update killTmuxSession helper**

```go
func killTmuxSession(session string) {
	exec.Command("tmux", "-L", tmux.SocketName, "kill-session", "-t", session).Run()
}
```

**Step 3: Run all integration tests**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/`
Expected: All PASS

**Step 4: Commit**

```bash
git add orchestrator/cmd/cco/integration_test.go
git commit -m "test(cco): update integration test helpers for custom tmux socket"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Step 1: Update CLAUDE.md**

In the **Session Management (cco)** table, add a row documenting how to list cco sessions. Update the description of `cco attach` to note cross-server behavior.

After the existing cco table, add a note:

```markdown
**Note:** cco uses a dedicated tmux socket (`cco`) to avoid interfering with personal tmux sessions. Use `tmux -L cco ls` to list cco sessions.
```

**Step 2: Check README.md for relevant sections**

Read `README.md` and update any tmux-related documentation with the socket info. If the README references `tmux ls` or similar commands, update them to `tmux -L cco ls`.

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document custom tmux socket for cco"
```
