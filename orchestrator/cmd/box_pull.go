package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var boxPullCmd = &cobra.Command{
	Use:   "pull <job-id>",
	Short: "Pull sandbox results back to the host",
	Long: `Poll for an output bundle from a sandbox job and fast-forward merge it into the current branch.

Waits up to 30 minutes for the sandbox to produce a bundle.
Cleans up the exchange directory and sandbox tmux pane on success.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		jobID := args[0]

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		if err := svc.Pull(cwd, jobID, 30*time.Minute, 3*time.Second); err != nil {
			return err
		}

		// Clean up tmux pane (best effort)
		logger := logging.NewStdLogger(verbose)
		gitClient := newGitClient()
		info, err := gitClient.RepoInfo(cwd)
		if err != nil {
			logger.Warn("could not look up workspace to clean up pane: %s", err)
			return nil
		}

		repoName := info.Name
		if info.IsWorktree {
			commonDir, err := gitClient.CommonDir(cwd)
			if err != nil {
				logger.Warn("could not determine main repo: %s", err)
				return nil
			}
			resolved := filepath.Clean(filepath.Join(cwd, commonDir))
			repoName = filepath.Base(filepath.Dir(resolved))
		}

		tmuxSession := paths.TmuxSessionName(repoName)
		tc := newTmuxClient()

		if !tc.SessionExists(tmuxSession) {
			return nil
		}

		paneID, err := tc.FindPaneByOption(tmuxSession, "cco-job", jobID)
		if err != nil {
			logger.Info("sandbox pane already closed")
			return nil
		}

		if err := tc.KillPane(paneID); err != nil {
			logger.Warn("could not close sandbox pane: %s", err)
		} else {
			logger.Info("closed sandbox pane")
		}

		return nil
	},
}

func init() { boxCmd.AddCommand(boxPullCmd) }
