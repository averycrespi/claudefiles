package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var boxPullCmd = &cobra.Command{
	Use:   "pull <session-id>",
	Short: "Pull sandbox results back to the host",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		sessionID := args[0]

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		if err := svc.Pull(cwd, sessionID, 30*time.Minute, 3*time.Second); err != nil {
			return err
		}

		// Clean up tmux pane (best effort)
		logger := logging.NewStdLogger(verbose)
		gitClient := newGitClient()
		info, err := gitClient.RepoInfo(cwd)
		if err != nil {
			logger.Info("warning: could not look up workspace to clean up pane: %s", err)
			return nil
		}

		tmuxSession := paths.TmuxSessionName(info.Name)
		tc := newTmuxClient()

		if !tc.SessionExists(tmuxSession) {
			return nil
		}

		paneID, err := tc.FindPaneByTitle(tmuxSession, sessionID)
		if err != nil {
			logger.Info("sandbox pane already closed")
			return nil
		}

		if err := tc.KillPane(paneID); err != nil {
			logger.Info("warning: could not close sandbox pane: %s", err)
		} else {
			logger.Info("closed sandbox pane")
		}

		return nil
	},
}

func init() { boxCmd.AddCommand(boxPullCmd) }
