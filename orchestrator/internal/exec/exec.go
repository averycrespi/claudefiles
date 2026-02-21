package exec

import (
	"os"
	osexec "os/exec"
)

// Runner abstracts command execution for testability.
type Runner interface {
	// Run executes a command and returns its combined output.
	Run(name string, args ...string) ([]byte, error)
	// RunDir executes a command in a specific directory.
	RunDir(dir, name string, args ...string) ([]byte, error)
	// RunInteractive executes a command with stdin/stdout/stderr connected.
	RunInteractive(name string, args ...string) error
}

// OSRunner implements Runner using os/exec.
type OSRunner struct{}

// NewOSRunner returns a Runner that uses real OS commands.
func NewOSRunner() *OSRunner { return &OSRunner{} }

func (r *OSRunner) Run(name string, args ...string) ([]byte, error) {
	return osexec.Command(name, args...).CombinedOutput()
}

func (r *OSRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	cmd := osexec.Command(name, args...)
	cmd.Dir = dir
	return cmd.CombinedOutput()
}

func (r *OSRunner) RunInteractive(name string, args ...string) error {
	cmd := osexec.Command(name, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
