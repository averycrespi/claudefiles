package cmd

import (
	"os"

	ccoexec "github.com/averycrespi/claudefiles/cco/internal/exec"
	"github.com/averycrespi/claudefiles/cco/internal/git"
	"github.com/averycrespi/claudefiles/cco/internal/lima"
	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/averycrespi/claudefiles/cco/internal/tmux"
	"github.com/averycrespi/claudefiles/cco/internal/workspace"
)

func newWorkspaceService() *workspace.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return workspace.NewService(
		git.NewClient(runner),
		tc,
		logger,
		runner,
	)
}

func newTmuxClient() *tmux.Client {
	runner := ccoexec.NewOSRunner()
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return tc
}

func newGitClient() *git.Client {
	runner := ccoexec.NewOSRunner()
	return git.NewClient(runner)
}

func newSandboxService() *sandbox.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	return sandbox.NewService(
		lima.NewClient(runner),
		logger,
	)
}
