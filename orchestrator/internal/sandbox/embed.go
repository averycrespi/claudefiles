package sandbox

import _ "embed"

//go:embed files/lima.yaml
var limaTemplate []byte

//go:embed files/CLAUDE.md
var claudeMD []byte

//go:embed files/settings.json
var settingsJSON []byte

//go:embed files/skills/executing-plans-in-sandbox/SKILL.md
var executingPlansInSandboxSkill []byte
