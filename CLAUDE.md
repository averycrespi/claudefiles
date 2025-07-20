# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
```bash
python3 tests/test-worktree-manager.py    # Run unit tests for worktree manager
```

### Git Workflow (Safety-Enforced)
Use the provided safe Git commands which include secret detection, file size limits, and branch protection:
```bash
safe-git-commit "commit message"            # Commit with gitleaks and size checks
safe-git-push                               # Push with branch protection
safe-gh-pr-create "title" "body"           # Create PR with validation
```

### Setup and Installation
```bash
./setup.sh                                 # Full environment setup
```

## Architecture Overview

This is a **Claude Code configuration and utilities repository** designed for macOS development environments. The codebase provides:

1. **Safe Git Command Layer** - Bash scripts that wrap Git operations with comprehensive safety checks including secret detection via gitleaks, file size limits (10MB), and branch protection
2. **Worktree Management System** - Python script for automated Git worktree creation with tmux session orchestration and Claude Code integration
3. **Claude Code Configuration** - Global settings and permissions system that restricts operations to approved safe commands

### Key Components

**Safe Git Scripts** (`scripts/`):
- Replace standard Git commands with safety-enforced versions
- Prevent commits containing secrets, oversized files, or direct pushes to protected branches
- Integrate GitHub CLI with duplicate PR detection

**Worktree Manager** (`scripts/worktree-manager`):
- Python implementation: Modular class-based architecture with dependency injection
- Automated branch sanitization and naming conventions
- Claude Code auto-launch integration

**Configuration System** (`claude/`):
- `settings.json`: Permission allow/deny lists, notification hooks, model selection
- `CLAUDE.md`: Global development guidelines enforcing safe Git command usage

### Security Model

The codebase implements multiple safety layers:
- **Secret Detection**: Gitleaks integration prevents credential exposure
- **Branch Protection**: Blocks direct pushes to main/master branches
- **File Size Limits**: 10MB maximum for staged changes
- **Permission System**: Claude Code restricted to approved command set only
- **Input Validation**: All scripts validate arguments and environment state

### Testing Framework

Uses Python unittest with comprehensive mock-based testing:
- Dependency injection pattern for testability
- Mock objects for Git, Tmux, Shell, and Logger interactions
- Unit test coverage for all core worktree management functionality

## Important Notes

- This repository manages Claude Code configuration via stow symlinks to `~/.claude/`
- The setup process installs Homebrew dependencies and configures shell integration
- All Git operations should use the provided safe commands to maintain security posture
- Worktree manager requires tmux and expects specific tmux configuration patterns

## Development Workflow Requirements

**ALWAYS run tests after changing Python scripts:**
```bash
python3 tests/test-worktree-manager.py
```

**ALWAYS update this CLAUDE.md file after making significant changes to:**
- Scripts or command functionality
- Architecture or component structure
- Development workflow or testing procedures
- New dependencies or setup requirements
