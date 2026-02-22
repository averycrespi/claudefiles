package tmux

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

const bellPrefix = "🔔 "

const SocketName = "cco"

// Client wraps tmux operations with an injectable command runner.
type Client struct {
	runner  exec.Runner
	TmuxEnv string // value of $TMUX, used to detect if already inside cco socket
}

// NewClient returns a tmux Client using the given command runner.
func NewClient(runner exec.Runner) *Client {
	return &Client{runner: runner}
}

func (c *Client) tmuxArgs(args ...string) []string {
	return append([]string{"-L", SocketName}, args...)
}

func (c *Client) run(args ...string) ([]byte, error) {
	return c.runner.Run("tmux", c.tmuxArgs(args...)...)
}

func (c *Client) SessionExists(name string) bool {
	_, err := c.run("has-session", "-t", name)
	return err == nil
}

func (c *Client) CreateSession(name, windowName string) error {
	out, err := c.run("new-session", "-d", "-s", name, "-n", windowName)
	if err != nil {
		return fmt.Errorf("tmux new-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) WindowExists(session, window string) bool {
	windows, err := c.ListWindows(session)
	if err != nil {
		return false
	}
	for _, w := range windows {
		if w == window || w == bellPrefix+window {
			return true
		}
	}
	return false
}

func (c *Client) ActualWindowName(session, window string) string {
	windows, err := c.ListWindows(session)
	if err != nil {
		return ""
	}
	for _, w := range windows {
		if w == window {
			return window
		}
		if w == bellPrefix+window {
			return bellPrefix + window
		}
	}
	return ""
}

func (c *Client) CreateWindow(session, window, cwd string) error {
	out, err := c.run("new-window", "-t", session, "-n", window, "-c", cwd, "-d")
	if err != nil {
		return fmt.Errorf("tmux new-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) KillWindow(session, window string) error {
	out, err := c.run("kill-window", "-t", session+":"+window)
	if err != nil {
		return fmt.Errorf("tmux kill-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) KillSession(name string) error {
	out, err := c.run("kill-session", "-t", name)
	if err != nil {
		return fmt.Errorf("tmux kill-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SendKeys(session, window, command string) error {
	out, err := c.run("send-keys", "-t", session+":"+window, command, "C-m")
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SplitWindow(session, window string) (string, error) {
	out, err := c.run("split-window", "-h", "-t", session+":"+window, "-d", "-P", "-F", "#{pane_id}")
	if err != nil {
		return "", fmt.Errorf("tmux split-window failed: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func (c *Client) SelectLayout(session, window, layout string) error {
	out, err := c.run("select-layout", "-t", session+":"+window, layout)
	if err != nil {
		return fmt.Errorf("tmux select-layout failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SetPaneTitle(paneID, title string) error {
	out, err := c.run("select-pane", "-t", paneID, "-T", title)
	if err != nil {
		return fmt.Errorf("tmux set-pane-title failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SendKeysToPane(paneID, command string) error {
	out, err := c.run("send-keys", "-t", paneID, command, "C-m")
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) FindPaneByTitle(session, title string) (string, error) {
	out, err := c.run("list-panes", "-s", "-t", session, "-F", "#{pane_id} #{pane_title}")
	if err != nil {
		return "", fmt.Errorf("tmux list-panes failed: %s", strings.TrimSpace(string(out)))
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 && parts[1] == title {
			return parts[0], nil
		}
	}
	return "", fmt.Errorf("pane with title %q not found", title)
}

func (c *Client) KillPane(paneID string) error {
	out, err := c.run("kill-pane", "-t", paneID)
	if err != nil {
		return fmt.Errorf("tmux kill-pane failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) RenameWindow(session, oldName, newName string) error {
	out, err := c.run("rename-window", "-t", session+":"+oldName, newName)
	if err != nil {
		return fmt.Errorf("tmux rename-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) ListWindows(session string) ([]string, error) {
	out, err := c.run("list-windows", "-t", session, "-F", "#{window_name}")
	if err != nil {
		return nil, fmt.Errorf("tmux list-windows failed: %w", err)
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil, nil
	}
	return strings.Split(raw, "\n"), nil
}

func insideCcoSocket(tmuxEnv string) bool {
	if tmuxEnv == "" {
		return false
	}
	socketPath := tmuxEnv
	if i := strings.Index(tmuxEnv, ","); i >= 0 {
		socketPath = tmuxEnv[:i]
	}
	base := filepath.Base(socketPath)
	return base == SocketName
}

func (c *Client) IsActiveWindow(session, window string) bool {
	if !c.WindowExists(session, window) {
		return false
	}
	actual := c.ActualWindowName(session, window)
	out, err := c.run("display-message", "-t", session+":"+actual, "-p", "#{window_active}")
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "1"
}

func (c *Client) Attach(session string) error {
	if insideCcoSocket(c.TmuxEnv) {
		return c.runner.RunInteractive("tmux", c.tmuxArgs("switch-client", "-t", session)...)
	}
	return c.runner.RunInteractive("tmux", c.tmuxArgs("attach-session", "-t", session)...)
}

func (c *Client) AttachToWindow(session, window string) error {
	target := session + ":" + window
	if insideCcoSocket(c.TmuxEnv) {
		return c.runner.RunInteractive("tmux", c.tmuxArgs("switch-client", "-t", target)...)
	}
	return c.runner.RunInteractive("tmux", c.tmuxArgs("attach-session", "-t", target)...)
}
