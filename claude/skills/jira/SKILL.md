---
name: jira
description: |
  This skill should be used when the user asks about Jira work items, sprints, boards,
  or projects. Activates when detecting: ticket IDs (PROJ-123), questions about "current
  sprint", "my tickets", "Jira issues", board information, project status, or requests to
  create, update, or comment on tickets. Provides access to Jira Cloud via Atlassian CLI.
---

# Jira Integration Skill

## Purpose

Integrate Jira into development discussions by automatically detecting and retrieving issue information, and enabling ticket creation, updates, and comments using the Atlassian CLI (ACLI). Read operations are automatic; write operations require user approval.

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

The skill provides domain-specific reference files for detailed command documentation:

- **[`references/auth.md`](references/auth.md)** - Authentication commands and troubleshooting
- **[`references/issues.md`](references/issues.md)** - Issue operations (view, search, create, edit, transition)
- **[`references/comments.md`](references/comments.md)** - Comment operations (list, create)
- **[`references/projects.md`](references/projects.md)** - Project commands and key conventions
- **[`references/boards-sprints.md`](references/boards-sprints.md)** - Board and sprint operations
- **[`references/jql.md`](references/jql.md)** - Comprehensive JQL query patterns
- **[`references/optimization.md`](references/optimization.md)** - Performance and context optimization strategies

**Loading strategy:**
- Load references selectively based on query type to minimize token usage
- For reading tickets: Load `issues.md` and `jql.md`
- For creating/editing tickets: Load `issues.md`
- For comments: Load `comments.md`
- For sprint queries: Load `boards-sprints.md` and `jql.md`
- For authentication issues: Load `auth.md`
- Load multiple references in parallel when query spans domains

### Context Optimization

To minimize token usage, follow these field selection and limiting strategies:

**Default field specifications:**
- **Quick view** (default): `--fields key,summary,status,priority,assignee`
- **Detailed view** (when user asks for "details"): `--fields key,summary,status,priority,assignee,created,updated,description`
- **Search results**: `--fields key,summary,status,assignee` (always add `--limit 20`)

**Result limiting:**
- Always use `--limit` for searches: Default to `--limit 20`
- For comments: Use `--limit 5 --order "-created"` to show only recent comments
- Use `--count` when user only needs result counts

**Key principles:**
- Avoid expensive fields (`description`, `comment`, `attachment`) unless user asks
- Load reference files selectively based on query type
- Inform user about truncation: "Showing 20 of 150 results"

See [`references/optimization.md`](references/optimization.md) for comprehensive optimization strategies.

### Building JQL Queries

For natural language requests, construct appropriate JQL queries. Common patterns:

- "My tickets" → `assignee = currentUser()`
- "High priority bugs" → `priority = High AND type = Bug`
- "Current sprint" → `sprint in openSprints()`

See [`references/jql.md`](references/jql.md) for comprehensive JQL patterns and natural language mapping.

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
