package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/spf13/cobra"
)

var verbose bool

var rootCmd = &cobra.Command{
	Use:   "cco",
	Short: "Claude Code Orchestrator - manage parallel Claude Code sessions",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		logging.SetVerbose(verbose)
	},
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "show detailed progress output")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
