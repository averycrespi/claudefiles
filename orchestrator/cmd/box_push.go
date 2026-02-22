package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	ccoexec "github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var boxPushCmd = &cobra.Command{
	Use:   "push <plan-path>",
	Short: "Push a plan into the sandbox for execution",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		planPath := args[0]
		logger := logging.NewStdLogger(verbose)

		if _, err := os.Stat(planPath); os.IsNotExist(err) {
			return fmt.Errorf("plan file not found: %s", planPath)
		}

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		// Look up workspace tmux session — resolve main repo name from worktrees
		gitClient := newGitClient()
		info, err := gitClient.RepoInfo(cwd)
		if err != nil {
			return err
		}

		repoName := info.Name
		if info.IsWorktree {
			commonDir, err := gitClient.CommonDir(cwd)
			if err != nil {
				return fmt.Errorf("could not determine main repo: %w", err)
			}
			resolved := filepath.Clean(filepath.Join(cwd, commonDir))
			repoName = filepath.Base(filepath.Dir(resolved))
		}

		tmuxSession := paths.TmuxSessionName(repoName)
		tc := newTmuxClient()

		if !tc.SessionExists(tmuxSession) {
			return fmt.Errorf("no workspace found for repo %q — run 'cco add <branch>' first", repoName)
		}

		// Determine current branch and check window exists before expensive Prepare
		runner := ccoexec.NewOSRunner()
		branchOut, err := runner.RunDir(cwd, "git", "rev-parse", "--abbrev-ref", "HEAD")
		if err != nil {
			return fmt.Errorf("failed to determine current branch: %w", err)
		}
		branch := strings.TrimSpace(string(branchOut))

		windowName := paths.TmuxWindowName(branch)
		if !tc.WindowExists(tmuxSession, windowName) {
			return fmt.Errorf("no workspace window for branch %q — run 'cco add %s' first", branch, branch)
		}

		// Prepare sandbox session (bundle, clone, build command)
		svc := newSandboxService()
		prepared, err := svc.Prepare(cwd, planPath)
		if err != nil {
			return err
		}

		// Split the workspace pane and launch Claude
		actualWindow := tc.ActualWindowName(tmuxSession, windowName)
		paneID, err := tc.SplitWindow(tmuxSession, actualWindow)
		if err != nil {
			return fmt.Errorf("failed to split pane: %w", err)
		}

		launched := false
		defer func() {
			if !launched {
				_ = tc.KillPane(paneID)
			}
		}()

		if err := tc.SelectLayout(tmuxSession, actualWindow, "even-horizontal"); err != nil {
			return fmt.Errorf("failed to set layout: %w", err)
		}

		if err := tc.SetPaneTitle(paneID, prepared.SessionID); err != nil {
			return fmt.Errorf("failed to set pane title: %w", err)
		}

		if err := tc.SendKeysToPane(paneID, prepared.Command); err != nil {
			return fmt.Errorf("failed to send command to pane: %w", err)
		}

		launched = true
		logger.Info("session %s started — pull with: cco box pull %s", prepared.SessionID, prepared.SessionID)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxPushCmd) }
