package lima

import (
	"testing"
)

func TestParseStatus_Running(t *testing.T) {
	status, err := parseStatus([]byte(`[{"name":"cco-sandbox","status":"Running"}]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "Running" {
		t.Errorf("status = %q, want %q", status, "Running")
	}
}

func TestParseStatus_Stopped(t *testing.T) {
	status, err := parseStatus([]byte(`[{"name":"cco-sandbox","status":"Stopped"}]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "Stopped" {
		t.Errorf("status = %q, want %q", status, "Stopped")
	}
}

func TestParseStatus_NotFound(t *testing.T) {
	status, err := parseStatus([]byte(`[]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "" {
		t.Errorf("status = %q, want empty string", status)
	}
}

func TestParseStatus_InvalidJSON(t *testing.T) {
	_, err := parseStatus([]byte(`not json`))
	if err == nil {
		t.Fatal("parseStatus() expected error for invalid JSON")
	}
}
