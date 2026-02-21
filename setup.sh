#!/usr/bin/env bash

# Setup script for the repository.
#
# This script is idempotent and can safely be run multiple times.

set -euo pipefail

echo 'Installing macOS dependencies from Brewfile ...'
brew bundle

echo 'Installing cco (Claude Code orchestrator) ...'
REPO_DIR=$(git rev-parse --show-toplevel)
(cd "$REPO_DIR/orchestrator" && go install ./cmd/cco)

CLAUDE_DIR="$HOME/.claude"
echo "Stowing Claude Code configuration to $CLAUDE_DIR ..."
mkdir -p "$CLAUDE_DIR" && stow claude -t "$CLAUDE_DIR"

echo 'Adding Atlassian MCP server ...'
if claude mcp get atlassian &>/dev/null; then
	echo 'Atlassian MCP server already configured'
else
	claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp --scope user
	echo 'Atlassian MCP server added'
fi

echo 'Done!'
echo ''
echo 'Optional: Atlassian authentication'
echo '  Run /mcp in Claude Code and authenticate with your Atlassian account.'
exit 0
