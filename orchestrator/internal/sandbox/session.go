package sandbox

import (
	"crypto/rand"
	"fmt"
)

// NewSessionID generates a short random hex string for session namespacing.
func NewSessionID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate session ID: " + err.Error())
	}
	return fmt.Sprintf("%x", b)
}
