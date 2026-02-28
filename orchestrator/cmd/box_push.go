package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/config"
	ccoexec "github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/goproxy"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxPushCmd = &cobra.Command{
	Use:   "push <plan-path>",
	Short: "Push a plan into the sandbox for execution",
	Long: `Bundle the current branch, clone it in the sandbox VM, and launch Claude Code with the plan.

Resolves the plan path relative to the current directory.
Splits the workspace's tmux window and runs Claude in the new pane.
Use 'cco box pull <job-id>' to pull results back when done.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		// Verify plan file exists in the worktree (resolve symlinks for validation only)
		planPath := args[0]
		absPath := planPath
		if !filepath.IsAbs(absPath) {
			absPath = filepath.Join(cwd, absPath)
		}
		if _, err = filepath.EvalSymlinks(absPath); err != nil {
			return fmt.Errorf("plan file not found: %s", planPath)
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

		// Prepare sandbox job (bundle, clone, build command)
		svc := newSandboxService()
		prepared, err := svc.Prepare(cwd, planPath, 100)
		if err != nil {
			return err
		}

		// Cache matching Go dependencies for the sandbox
		cfg, err := config.Load()
		if err != nil {
			logger.Warn("failed to load config: %s", err)
		}
		if cfg != nil && len(cfg.GoProxy.Patterns) > 0 {
			deps, err := goproxy.FindMatchingDeps(cwd, cfg.GoProxy.Patterns)
			if err != nil {
				logger.Warn("failed to scan Go dependencies: %s", err)
			} else if len(deps) > 0 {
				logger.Info("caching %d Go dependencies for sandbox...", len(deps))
				exchangeDir := paths.JobExchangeDir(prepared.JobID)
				if _, err := goproxy.DownloadDeps(deps, exchangeDir); err != nil {
					logger.Warn("failed to cache Go dependencies: %s", err)
				} else {
					// Rebuild the command with proxy env vars
					prepared.Command = sandbox.BuildLaunchCommand(prepared.JobID, planPath, cfg.GoProxy.Patterns)
				}
			}
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

		if err := tc.SetPaneOption(paneID, "cco-job", prepared.JobID); err != nil {
			return fmt.Errorf("failed to set pane option: %w", err)
		}

		if err := tc.SendKeysToPane(paneID, prepared.Command); err != nil {
			return fmt.Errorf("failed to send command to pane: %w", err)
		}

		launched = true
		logger.Info("job %s started — pull with: cco box pull %s", prepared.JobID, prepared.JobID)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxPushCmd) }
