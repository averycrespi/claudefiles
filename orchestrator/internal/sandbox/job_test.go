package sandbox

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewJobID_Length(t *testing.T) {
	id := NewJobID()
	assert.Len(t, id, 8)
}

func TestNewJobID_Unique(t *testing.T) {
	id1 := NewJobID()
	id2 := NewJobID()
	assert.NotEqual(t, id1, id2)
}

func TestNewJobID_HexChars(t *testing.T) {
	id := NewJobID()
	for _, c := range id {
		assert.True(t, (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'),
			"expected hex char, got %c", c)
	}
}
