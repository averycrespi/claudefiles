package logging

import "fmt"

// Logger abstracts logging for testability.
type Logger interface {
	Info(format string, args ...any)
	Debug(format string, args ...any)
}

// StdLogger implements Logger using fmt.Printf to stdout.
type StdLogger struct {
	verbose bool
}

// NewStdLogger returns a Logger that prints to stdout.
func NewStdLogger(verbose bool) *StdLogger {
	return &StdLogger{verbose: verbose}
}

func (l *StdLogger) Info(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

func (l *StdLogger) Debug(format string, args ...any) {
	if l.verbose {
		fmt.Printf(format+"\n", args...)
	}
}

// NoopLogger is a Logger that discards all output. Useful in tests.
type NoopLogger struct{}

func (NoopLogger) Info(string, ...any)  {}
func (NoopLogger) Debug(string, ...any) {}
