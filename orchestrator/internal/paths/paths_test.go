package paths

import (
	"os"
	"testing"
)

func TestDataDir_Default(t *testing.T) {
	os.Unsetenv("XDG_DATA_HOME")
	dir := DataDir()
	home, _ := os.UserHomeDir()
	expected := home + "/.local/share/cco"
	if dir != expected {
		t.Errorf("DataDir() = %q, want %q", dir, expected)
	}
}

func TestDataDir_XDG(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/custom/data")
	dir := DataDir()
	if dir != "/custom/data/cco" {
		t.Errorf("DataDir() = %q, want %q", dir, "/custom/data/cco")
	}
}

func TestSessionDir(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	dir := SessionDir("myapp", "feat/thing")
	expected := "/data/cco/sessions/myapp/feat-thing"
	if dir != expected {
		t.Errorf("SessionDir() = %q, want %q", dir, expected)
	}
}

func TestSanitizeBranch(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"feat/my-thing", "feat-my-thing"},
		{"simple", "simple"},
		{"a/b/c", "a-b-c"},
		{"feat_underscore", "feat-underscore"},
		{"UPPER/case", "UPPER-case"},
	}
	for _, tt := range tests {
		got := SanitizeBranch(tt.input)
		if got != tt.want {
			t.Errorf("SanitizeBranch(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestTmuxSessionName(t *testing.T) {
	name := TmuxSessionName("myapp")
	if name != "myapp-worktree" {
		t.Errorf("TmuxSessionName() = %q, want %q", name, "myapp-worktree")
	}
}

func TestTmuxWindowName(t *testing.T) {
	name := TmuxWindowName("feat/thing")
	if name != "feat-thing" {
		t.Errorf("TmuxWindowName() = %q, want %q", name, "feat-thing")
	}
}
