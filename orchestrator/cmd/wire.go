package cmd

import (
	"os"

	ccoexec "github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/lima"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/averycrespi/claudefiles/orchestrator/internal/tmux"
	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
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

func newSandboxService() *sandbox.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	return sandbox.NewService(
		lima.NewClient(runner),
		logger,
		runner,
	)
}
