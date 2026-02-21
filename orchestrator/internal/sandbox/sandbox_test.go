package sandbox

import (
	"strings"
	"testing"
)

func TestEmbeddedFiles_NotEmpty(t *testing.T) {
	if len(limaTemplate) == 0 {
		t.Error("limaTemplate is empty")
	}
	if len(claudeMD) == 0 {
		t.Error("claudeMD is empty")
	}
	if len(settingsJSON) == 0 {
		t.Error("settingsJSON is empty")
	}
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	if !strings.Contains(content, "minimumLimaVersion") {
		t.Error("limaTemplate missing minimumLimaVersion")
	}
	if !strings.Contains(content, "ubuntu-24.04") {
		t.Error("limaTemplate missing ubuntu-24.04")
	}
}

func TestEmbeddedSettingsJSON_ValidJSON(t *testing.T) {
	content := string(settingsJSON)
	if !strings.Contains(content, "permissions") {
		t.Error("settingsJSON missing permissions key")
	}
}
