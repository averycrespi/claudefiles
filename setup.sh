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

echo 'Done!'
exit 0
