---
name: jira
description: |
  This skill should be used when the user asks about Jira work items, sprints, boards,
  or projects. Activates when detecting: ticket IDs (PROJ-123), questions about "current
  sprint", "my tickets", "Jira issues", board information, project status, or any Jira-related
  queries. Provides read-only access to Jira Cloud via Atlassian CLI.
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

1. **Single ticket**: Immediately fetch using `acli jira workitem view <KEY> --fields key,summary,status,priority,assignee --json`
2. **Multiple tickets**: Fetch ALL in parallel using multiple Bash tool calls in a single message

### Command Reference

Read [`references/commands.md`](references/commands.md) for comprehensive documentation of all options, field specifications, pagination, and advanced usage patterns.

### Context Optimization

To minimize token usage, follow these field selection and limiting strategies:

**Default field specifications:**
- **Quick view** (default): `--fields key,summary,status,priority,assignee`
- **Detailed view** (when user asks for "details"): `--fields key,summary,status,priority,assignee,created,updated,description`
- **Search results**: `--fields key,summary,status,assignee` (always add `--limit 20`)

**Result limiting:**
- Always use `--limit` for searches: Default to `--limit 20`, adjust based on user needs
- For comments: Use `--limit 5 --order "-created"` to show only recent comments
- Use `--count` when user only needs result counts: `acli jira workitem search --jql "<JQL>" --count`

**Selective detailed fetching:**
- Only include `description` when user explicitly asks for issue details or content
- Only fetch comments when user specifically asks about comments or discussion
- Avoid fetching all fields (`*navigable`) unless absolutely necessary

**Performance notes:**
- Expensive fields: `description`, `comment`, `attachment` consume significant tokens
- Keep field lists minimal by default; fetch additional fields only when needed
- When results are truncated, inform user: "Showing 20 of 150 results"

### Building JQL Queries

For natural language requests, construct appropriate JQL queries:

- "My tickets" → `assignee = currentUser()`
- "High priority bugs" → `priority = High AND type = Bug`
- "Current sprint" → `sprint in openSprints()`

Prompt for missing context (project key, board ID) when needed.

### Error Handling

Handle errors gracefully without disrupting conversation flow. Detailed error recovery patterns are in [`references/error-handling.md`](references/error-handling.md). Key principles:

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
- **Field selection**: Use minimal fields by default (`key,summary,status,priority,assignee`), fetch additional fields only when user needs details
- **Result limits**: Always apply appropriate limits to prevent excessive context consumption

## Security

Read-only operations are enforced in settings.json:
- Allowed: Retrieve issues, boards, sprints, projects, comments, search with JQL
- Blocked: Create, update, delete, assign, transition, or modify any Jira data

All write operations require explicit user approval and are denied by default.
