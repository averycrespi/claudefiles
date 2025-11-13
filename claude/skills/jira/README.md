# Jira Integration Skill

Seamlessly integrate Jira data into Claude Code conversations with automatic ticket detection and retrieval.

## What It Does

Automatically detects and fetches Jira issue information when you mention ticket IDs (e.g., "PROJ-123") or ask about sprints, boards, and projects. Provides transparent, read-only access to Jira Cloud via the Atlassian CLI.

## Setup

1. Install and authenticate ACLI:
   ```bash
   brew install acli
   acli jira auth login
   ```

2. The skill activates automatically when you mention Jira keywords or ticket IDs

## Usage Examples

- "What's PROJ-123 about?"
- "Show me my current tickets"
- "What's in the current sprint?"
- "Find high priority bugs"

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including command reference, JQL patterns, and optimization strategies.
