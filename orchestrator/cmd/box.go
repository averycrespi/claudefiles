package cmd

import (
	"github.com/spf13/cobra"
)

var boxCmd = &cobra.Command{
	Use:   "box",
	Short: "Manage the Lima sandbox VM",
}

func init() {
	rootCmd.AddCommand(boxCmd)
}
