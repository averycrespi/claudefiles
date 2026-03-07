#!/usr/bin/env bash

# Delete Steven ingestion logs older than 14 days.

set -euo pipefail

LOG_DIR="$HOME/steven-vault/logs"

if [ -d "$LOG_DIR" ]; then
  find "$LOG_DIR" -name "*.log" -mtime +14 -delete
  echo "Cleaned logs older than 14 days from $LOG_DIR"
else
  echo "Log directory $LOG_DIR does not exist"
fi
