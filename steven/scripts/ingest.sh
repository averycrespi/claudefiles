#!/usr/bin/env bash

# Wrapper for headless Steven ingestion via cron.
#
# Usage: ingest.sh "prompt for steven"
#
# Handles:
# - PATH setup so cron can find `claude`
# - Logging to ~/steven-vault/logs/
# - Exit code propagation

set -euo pipefail

PROMPT="$1"
LOG_DIR="$HOME/steven-vault/logs"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

# Ensure claude is on PATH (cron has minimal environment)
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "=== Steven Ingestion ===" >>"$LOG_FILE"
echo "Time: $(date)" >>"$LOG_FILE"
echo "Prompt: $PROMPT" >>"$LOG_FILE"
echo "---" >>"$LOG_FILE"

claude -p "$PROMPT" \
	--permission-mode dontAsk \
	--verbose \
	>>"$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "---" >>"$LOG_FILE"
echo "Exit code: $EXIT_CODE" >>"$LOG_FILE"
echo "Finished: $(date)" >>"$LOG_FILE"

exit $EXIT_CODE
