package tmux

import (
	"testing"
)

// Use a unique session name per test to avoid collisions
func testSession(t *testing.T) string {
	t.Helper()
	name := "cco-test-" + t.Name()
	t.Cleanup(func() {
		KillSession(name)
	})
	return name
}

func TestCreateSession(t *testing.T) {
	session := testSession(t)
	if SessionExists(session) {
		t.Fatal("session should not exist before creation")
	}
	if err := CreateSession(session, "main"); err != nil {
		t.Fatalf("CreateSession() error: %v", err)
	}
	if !SessionExists(session) {
		t.Error("session should exist after creation")
	}
}

func TestWindowExists(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	if !WindowExists(session, "main") {
		t.Error("main window should exist")
	}
	if WindowExists(session, "nonexistent") {
		t.Error("nonexistent window should not exist")
	}
}

func TestCreateWindow(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	if err := CreateWindow(session, "test-win", dir); err != nil {
		t.Fatalf("CreateWindow() error: %v", err)
	}
	if !WindowExists(session, "test-win") {
		t.Error("test-win should exist after creation")
	}
}

func TestKillWindow(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	CreateWindow(session, "kill-me", dir)
	if err := KillWindow(session, "kill-me"); err != nil {
		t.Fatalf("KillWindow() error: %v", err)
	}
	if WindowExists(session, "kill-me") {
		t.Error("kill-me should not exist after KillWindow")
	}
}

func TestListWindows(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	CreateWindow(session, "win-a", dir)
	CreateWindow(session, "win-b", dir)
	windows, err := ListWindows(session)
	if err != nil {
		t.Fatalf("ListWindows() error: %v", err)
	}
	found := map[string]bool{}
	for _, w := range windows {
		found[w] = true
	}
	for _, want := range []string{"main", "win-a", "win-b"} {
		if !found[want] {
			t.Errorf("ListWindows() missing %q, got %v", want, windows)
		}
	}
}

func TestRenameWindow(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	CreateWindow(session, "old-name", dir)
	if err := RenameWindow(session, "old-name", "new-name"); err != nil {
		t.Fatalf("RenameWindow() error: %v", err)
	}
	if WindowExists(session, "old-name") {
		t.Error("old-name should not exist after rename")
	}
	if !WindowExists(session, "new-name") {
		t.Error("new-name should exist after rename")
	}
}

func TestSendKeys(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	if err := SendKeys(session, "main", "echo hello"); err != nil {
		t.Fatalf("SendKeys() error: %v", err)
	}
}

func TestWindowExistsWithBellPrefix(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	CreateWindow(session, "notified", dir)
	RenameWindow(session, "notified", "🔔 notified")
	if !WindowExists(session, "notified") {
		t.Error("WindowExists should find window with bell prefix")
	}
}
