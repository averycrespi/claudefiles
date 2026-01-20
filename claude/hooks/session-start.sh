#!/usr/bin/env bash
# SessionStart hook - injects skill enforcement rules at session start
# Adapted from https://github.com/obra/superpowers

set -euo pipefail

SKILL_PATH="${HOME}/.claude/skills/using-skills/SKILL.md"

# Read using-skills content
if [ -f "$SKILL_PATH" ]; then
    skill_content=$(cat "$SKILL_PATH" 2>&1)
else
    skill_content="Error: Could not read using-skills skill at $SKILL_PATH"
fi

# Escape output for JSON using pure bash
escape_for_json() {
    local input="$1"
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\' ;;
            '"') output+='\"' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *) output+="$char" ;;
        esac
    done
    printf '%s' "$output"
}

skill_escaped=$(escape_for_json "$skill_content")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\n${skill_escaped}\n</EXTREMELY_IMPORTANT>"
  }
}
EOF

exit 0
