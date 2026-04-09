#!/usr/bin/env bash

# Setup script for the repository.
#
# This script is idempotent and can safely be run multiple times.

set -euo pipefail

echo 'Installing macOS dependencies from Brewfile ...'
brew bundle

echo 'Installing playwright-cli ...'
npm install -g @playwright/cli@latest

echo 'Installing Playwright and browsers ...'
npm install -g playwright@latest
playwright install

echo 'Installing Node dependencies for Pi extensions ...'
npm install

CLAUDE_DIR="$HOME/.claude"
echo "Stowing Claude Code configuration to $CLAUDE_DIR ..."
mkdir -p "$CLAUDE_DIR" && stow claude -t "$CLAUDE_DIR"

PI_DIR="$HOME/.pi"
echo "Stowing Pi agent configuration to $PI_DIR ..."
mkdir -p "$PI_DIR" && stow pi -t "$PI_DIR"

echo 'Adding Atlassian MCP server ...'
if claude mcp get atlassian &>/dev/null; then
	echo 'Atlassian MCP server already configured'
else
	claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp --scope user
	echo 'Atlassian MCP server added'
fi

echo 'Adding Datadog MCP server ...'
if claude mcp get datadog &>/dev/null; then
	echo 'Datadog MCP server already configured'
else
	claude mcp add --transport http datadog https://mcp.datadoghq.com/api/unstable/mcp-server/mcp --scope user
	echo 'Datadog MCP server added'
fi

echo 'Done!'
echo ''
echo 'Optional: Atlassian authentication'
echo '  Run /mcp in Claude Code and authenticate with your Atlassian account.'
echo ''
echo 'Optional: Datadog authentication'
echo '  Run /mcp in Claude Code and authenticate with your Datadog account.'
exit 0
