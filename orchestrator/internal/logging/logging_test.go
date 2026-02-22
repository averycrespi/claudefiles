package logging

import (
	"bytes"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w
	fn()
	w.Close()
	os.Stdout = old
	var buf bytes.Buffer
	buf.ReadFrom(r)
	return buf.String()
}

func TestStdLogger_ImplementsLogger(t *testing.T) {
	var _ Logger = &StdLogger{}
}

func TestNoopLogger_ImplementsLogger(t *testing.T) {
	var _ Logger = NoopLogger{}
}

func TestStdLogger_InfoAlwaysPrints(t *testing.T) {
	logger := NewStdLogger(false)
	out := captureStdout(t, func() {
		logger.Info("hello %s", "world")
	})
	assert.Equal(t, "[cco:info] hello world\n", out)
}

func TestStdLogger_WarnAlwaysPrints(t *testing.T) {
	logger := NewStdLogger(false)
	out := captureStdout(t, func() {
		logger.Warn("something %s", "wrong")
	})
	assert.Equal(t, "[cco:warn] something wrong\n", out)
}

func TestStdLogger_DebugSilentByDefault(t *testing.T) {
	logger := NewStdLogger(false)
	out := captureStdout(t, func() {
		logger.Debug("should not appear")
	})
	assert.Empty(t, out)
}

func TestStdLogger_DebugPrintsWhenVerbose(t *testing.T) {
	logger := NewStdLogger(true)
	out := captureStdout(t, func() {
		logger.Debug("verbose %s", "msg")
	})
	assert.Equal(t, "[cco:debug] verbose msg\n", out)
}

func TestNoopLogger_DoesNotPrint(t *testing.T) {
	logger := NoopLogger{}
	out := captureStdout(t, func() {
		logger.Info("should not appear")
		logger.Warn("should not appear")
		logger.Debug("should not appear")
	})
	assert.Empty(t, out)
}
