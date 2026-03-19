package cmd

import (
	"fmt"
	"os/user"
	"strconv"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/paths"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		params, err := hostTemplateParams()
		if err != nil {
			return err
		}

		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}

		// Add configured mounts + automatic worktree mount
		params.Mounts = append(cfg.Sandbox.Mounts, paths.WorktreeBaseDir())

		return newSandboxService().Create(params, cfg.Sandbox)
	},
}

func init() { boxCmd.AddCommand(boxCreateCmd) }

// hostTemplateParams returns TemplateParams populated from the current host user.
func hostTemplateParams() (sandbox.TemplateParams, error) {
	u, err := user.Current()
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to get current user: %w", err)
	}

	uid, err := strconv.Atoi(u.Uid)
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to parse UID: %w", err)
	}

	gid, err := strconv.Atoi(u.Gid)
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to parse GID: %w", err)
	}

	return sandbox.TemplateParams{
		Username: u.Username,
		UID:      uid,
		GID:      gid,
		HomeDir:  u.HomeDir,
	}, nil
}
