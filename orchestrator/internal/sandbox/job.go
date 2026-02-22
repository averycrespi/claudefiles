package sandbox

import (
	"crypto/rand"
	"fmt"
)

// NewJobID generates a short random hex string for job namespacing.
func NewJobID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate job ID: " + err.Error())
	}
	return fmt.Sprintf("%x", b)
}
