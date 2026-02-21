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

echo 'Identifying your shell ...'
SHELL_RC=""
if [ -n "${ZSH_VERSION-}" ]; then
  echo 'ZSH detected'
  SHELL_RC="$HOME/.zshrc"
elif [ -n "${BASH_VERSION-}" ]; then
  echo 'BASH detected'
  SHELL_RC="$HOME/.bashrc"
else
  echo 'Unable to identify your shell'
fi

echo 'Adding scripts directory to your PATH ...'
PATH_LINE="export PATH=\"$REPO_DIR/scripts:\$PATH\""
if [ -n "$SHELL_RC" ]; then
  if ! grep -Fxq "$PATH_LINE" "$SHELL_RC"; then
    echo "$PATH_LINE" >>"$SHELL_RC"
    echo "Added scripts directory to PATH in $SHELL_RC"
  else
    echo "Scripts directory already in PATH in $SHELL_RC"
  fi
else
  echo "Please add the following line to your shell configuration file:"
  echo "$PATH_LINE"
fi

echo 'Symlinking sandbox Claude config ...'
SANDBOX_CLAUDE="$HOME/.claude-sandbox"
SANDBOX_SOURCE="$REPO_DIR/sandbox/claude"
if [ -d "$SANDBOX_SOURCE" ]; then
  if [ -L "$SANDBOX_CLAUDE" ]; then
    echo "Sandbox symlink already exists at $SANDBOX_CLAUDE"
  else
    ln -s "$SANDBOX_SOURCE" "$SANDBOX_CLAUDE"
    echo "Created symlink $SANDBOX_CLAUDE -> $SANDBOX_SOURCE"
  fi
else
  echo "Sandbox source not found at $SANDBOX_SOURCE, skipping"
fi
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
