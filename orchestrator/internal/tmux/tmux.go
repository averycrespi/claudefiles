package tmux

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const bellPrefix = "🔔 "

const SocketName = "cco"

func tmuxCmd(args ...string) *exec.Cmd {
	fullArgs := append([]string{"-L", SocketName}, args...)
	return exec.Command("tmux", fullArgs...)
}

func SessionExists(name string) bool {
	cmd := tmuxCmd("has-session", "-t", name)
	return cmd.Run() == nil
}

func CreateSession(name, windowName string) error {
	cmd := tmuxCmd("new-session", "-d", "-s", name, "-n", windowName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux new-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func WindowExists(session, window string) bool {
	windows, err := ListWindows(session)
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

func ActualWindowName(session, window string) string {
	windows, err := ListWindows(session)
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

func CreateWindow(session, window, cwd string) error {
	cmd := tmuxCmd("new-window", "-t", session, "-n", window, "-c", cwd, "-d")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux new-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func KillWindow(session, window string) error {
	cmd := tmuxCmd("kill-window", "-t", session+":"+window)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux kill-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func KillSession(name string) error {
	cmd := tmuxCmd("kill-session", "-t", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux kill-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func SendKeys(session, window, command string) error {
	cmd := tmuxCmd("send-keys", "-t", session+":"+window, command, "C-m")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func RenameWindow(session, oldName, newName string) error {
	cmd := tmuxCmd("rename-window", "-t", session+":"+oldName, newName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux rename-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func ListWindows(session string) ([]string, error) {
	cmd := tmuxCmd("list-windows", "-t", session, "-F", "#{window_name}")
	out, err := cmd.Output()
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

func IsActiveWindow(session, window string) bool {
	if !WindowExists(session, window) {
		return false
	}
	actual := ActualWindowName(session, window)
	cmd := tmuxCmd("display-message", "-t", session+":"+actual, "-p", "#{window_active}")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "1"
}

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
