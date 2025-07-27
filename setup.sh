#!/usr/bin/env bash

# Setup script for the repository.
#
# This script is idempotent and can safely be run multiple times.

set -euo pipefail

echo 'Installing macOS dependencies ...'
brew bundle

echo 'Stowing Claude Code configuration ...'
mkdir -p "$HOME/.claude" && stow claude -t "$HOME/.claude"

echo 'Configuring MCP servers for Claude Code ...'
if ! claude mcp list | grep -q 'context7'; then
  echo 'Adding context7 MCP server ...'
  claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp
else
  echo 'context7 MCP server already configured'
fi

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
REPO_DIR=$(git rev-parse --show-toplevel)
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

echo 'Done!'
exit 0
