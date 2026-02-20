package tmux

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const bellPrefix = "🔔 "

func SessionExists(name string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}

func CreateSession(name, windowName string) error {
	cmd := exec.Command("tmux", "new-session", "-d", "-s", name, "-n", windowName)
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
	cmd := exec.Command("tmux", "new-window", "-t", session, "-n", window, "-c", cwd, "-d")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux new-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func KillWindow(session, window string) error {
	cmd := exec.Command("tmux", "kill-window", "-t", session+":"+window)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux kill-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func KillSession(name string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux kill-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func SendKeys(session, window, command string) error {
	cmd := exec.Command("tmux", "send-keys", "-t", session+":"+window, command, "C-m")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func RenameWindow(session, oldName, newName string) error {
	cmd := exec.Command("tmux", "rename-window", "-t", session+":"+oldName, newName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux rename-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func ListWindows(session string) ([]string, error) {
	cmd := exec.Command("tmux", "list-windows", "-t", session, "-F", "#{window_name}")
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

func Attach(session string) error {
	if os.Getenv("TMUX") != "" {
		cmd := exec.Command("tmux", "switch-client", "-t", session)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	cmd := exec.Command("tmux", "attach-session", "-t", session)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
