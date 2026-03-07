package exec

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOSRunner_ImplementsRunner(t *testing.T) {
	var _ Runner = &OSRunner{}
}

func TestOSRunner_Run(t *testing.T) {
	r := NewOSRunner()
	out, err := r.Run("echo", "hello")
	assert.NoError(t, err)
	assert.Contains(t, string(out), "hello")
}

func TestOSRunner_RunDir(t *testing.T) {
	r := NewOSRunner()
	out, err := r.RunDir("/tmp", "pwd")
	assert.NoError(t, err)
	assert.Contains(t, string(out), "tmp")
}
