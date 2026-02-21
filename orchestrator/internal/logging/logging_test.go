package logging

import (
	"bytes"
	"os"
	"testing"
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

func TestInfoAlwaysPrints(t *testing.T) {
	SetVerbose(false)
	out := captureStdout(t, func() {
		Info("hello %s", "world")
	})
	if out != "hello world\n" {
		t.Errorf("Info output = %q, want %q", out, "hello world\n")
	}
}

func TestDebugSilentByDefault(t *testing.T) {
	SetVerbose(false)
	out := captureStdout(t, func() {
		Debug("should not appear")
	})
	if out != "" {
		t.Errorf("Debug output = %q, want empty", out)
	}
}

func TestDebugPrintsWhenVerbose(t *testing.T) {
	SetVerbose(true)
	defer SetVerbose(false)
	out := captureStdout(t, func() {
		Debug("verbose %s", "msg")
	})
	if out != "verbose msg\n" {
		t.Errorf("Debug output = %q, want %q", out, "verbose msg\n")
	}
}
