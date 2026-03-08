#!/usr/bin/env bash

# Wrapper for headless Steven operation via cron.

set -euo pipefail

NAME="$1"
PROMPT="$2"
LOG_DIR="$HOME/steven-vault/logs/$NAME"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

# Ensure claude is on PATH (cron has minimal environment)
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "Time: $(date)" >>"$LOG_FILE"
echo "Prompt: $PROMPT" >>"$LOG_FILE"
echo "---" >>"$LOG_FILE"

cd ~/steven-vault && claude -p "$PROMPT" \
	--permission-mode acceptEdits \
	--output-mode json \
	--verbose \
	>>"$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "---" >>"$LOG_FILE"
echo "Exit code: $EXIT_CODE" >>"$LOG_FILE"
echo "Finished: $(date)" >>"$LOG_FILE"

exit $EXIT_CODE
