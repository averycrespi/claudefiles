# Jira Integration Skill

Integrate Jira into Claude Code conversations with automatic ticket detection, retrieval, and the ability to create, update, and comment on issues.

## What It Does

**Reading:** Automatically detects and fetches Jira issue information when you mention ticket IDs (e.g., "PROJ-123") or ask about sprints, boards, and projects.

**Writing:** Create tickets, update fields, change status, and add comments - all with confirmation before execution.

## Setup

1. Install and authenticate ACLI:
   ```bash
   brew install acli
   acli jira auth login
   ```

2. The skill activates automatically when you mention Jira keywords or ticket IDs

## Usage Examples

**Reading:**
- "What's PROJ-123 about?"
- "Show me my current tickets"
- "What's in the current sprint?"

**Writing:**
- "Create a bug ticket for the login timeout issue"
- "Mark PROJ-123 as in progress"
- "Assign PROJ-456 to me"
- "Add a comment to PROJ-789 that I'm investigating"

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including command reference, JQL patterns, and write operation patterns.
