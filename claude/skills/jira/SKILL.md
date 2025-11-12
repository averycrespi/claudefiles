---
name: jira
description: |
  This skill should be used when the user mentions Jira ticket IDs (e.g., PROJ-123),
  asks about tickets, sprints, boards, or searches for issues. Automatically activates
  on ticket references and provides read-only access to Jira data via Atlassian CLI.
  Requires ACLI authentication.
---

# Jira Integration Skill

## Purpose

Transparently integrate Jira data into development discussions by automatically detecting and retrieving issue information, sprint data, and board contents using the Atlassian CLI (ACLI). Provide seamless read-only access to Jira without disrupting conversation flow.

## When to Use This Skill

Activate this skill when detecting:

- **Explicit ticket IDs**: Pattern `[A-Z][A-Z0-9_]+-[0-9]+` (e.g., PROJ-123, TEAM-456)
- **Jira keywords**: "jira", "ticket", "issue", "board", "sprint", "backlog", "my tickets"
- **Natural language queries**: "current sprint", "assigned to me", "high priority bugs"

## How to Use This Skill

### Automatic Detection and Fetching

When ticket IDs appear in user messages:

1. **Single ticket**: Immediately fetch using `acli jira workitem view <KEY> --json`
2. **Multiple tickets**: Fetch ALL in parallel using multiple Bash tool calls in a single message

### Command Reference

Detailed ACLI commands and JQL patterns are available in `references/commands.md`. Always use the `--json` flag for structured output. Common commands include:

- View specific issue: `acli jira workitem view <KEY> --json`
- Search issues: `acli jira workitem search --jql "<JQL>" --json`
- List sprints: `acli jira board list-sprints --id <BOARD_ID> --json`
- View comments: `acli jira workitem comment list --key <KEY> --json`

### Building JQL Queries

For natural language requests, construct appropriate JQL queries:

- "My tickets" → `assignee = currentUser()`
- "High priority bugs" → `priority = High AND type = Bug`
- "Current sprint" → `sprint in openSprints()`

Prompt for missing context (project key, board ID) when needed.

### Error Handling

Handle errors gracefully without disrupting conversation flow. Detailed error recovery patterns are in `references/error-handling.md`. Key principles:

- Check `acli jira auth status` for authentication failures
- Provide actionable guidance for recovery
- Continue assisting with other tasks while resolving errors
- Disable skill for session if ACLI is not installed

### Response Formatting

Present information concisely:

**Single ticket**:
```
PROJ-123: Fix authentication bug
Status: In Progress | Priority: High | Assignee: John Doe
Created: 2025-11-01 | Updated: 2025-11-10
```

**Multiple tickets**: Group logically by status or priority, showing key + summary + essential metadata.

**Search results**: List with key details, noting "Showing N of M results" if results are truncated.

### Execution Strategy

- **Multiple tickets**: Use parallel Bash tool calls in a single message for efficiency
- **Sprint queries**: Chain commands sequentially (board search → list sprints → sprint workitems)
- **Default fields**: Display key, summary, status, priority, assignee, created, updated
- **Additional context**: Include description and recent comments when relevant to the discussion

## Security

Read-only operations are enforced in settings.json:
- Allowed: Retrieve issues, boards, sprints, projects, comments, search with JQL
- Blocked: Create, update, delete, assign, transition, or modify any Jira data

All write operations require explicit user approval and are denied by default.
