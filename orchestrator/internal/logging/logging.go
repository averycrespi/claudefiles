package logging

import "fmt"

var verbose bool

// SetVerbose controls whether Debug messages are printed.
func SetVerbose(v bool) { verbose = v }

// Info prints a message that is always shown to the user.
func Info(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

// Debug prints a message only when verbose mode is enabled.
func Debug(format string, args ...any) {
	if verbose {
		fmt.Printf(format+"\n", args...)
	}
}
