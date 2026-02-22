package sandbox

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewSessionID_Length(t *testing.T) {
	id := NewSessionID()
	assert.Len(t, id, 8)
}

func TestNewSessionID_Unique(t *testing.T) {
	id1 := NewSessionID()
	id2 := NewSessionID()
	assert.NotEqual(t, id1, id2)
}

func TestNewSessionID_HexChars(t *testing.T) {
	id := NewSessionID()
	for _, c := range id {
		assert.True(t, (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'),
			"expected hex char, got %c", c)
	}
}
