# ACLI Command Reference

This reference documents the Atlassian CLI (ACLI) commands available for Jira integration.

## Authentication

```bash
# Check authentication status
acli jira auth status

# Login (requires user interaction)
acli jira auth login
```

## Projects

```bash
# List recent projects
acli jira project list --json --recent

# View a project by key
acli jira project view --key <PROJECT_KEY> --json
```

## Boards

```bash
# Search for boards within a project
acli jira board search --project <KEY> --json

# Search for boards by name
acli jira board search --name <NAME> --json
```

## Sprints

```bash
# List sprints within a board
acli jira board list-sprints --id <BOARD_ID> --json

# List work items (issues) within a sprint
acli jira sprint list-workitems --board <BOARD_ID> --sprint <SPRINT_ID> --json
```

## Work Items (Issues)

```bash
# View a specific work item
acli jira workitem view <KEY> --json

# Search for work items using JQL
acli jira workitem search --jql "<JQL>" --json

# List comments for a work item
acli jira workitem comment list --key <KEY> --json
```

## Common JQL Patterns

```jql
# Issues assigned to current user
assignee = currentUser()

# High priority bugs
priority = High AND type = Bug

# Issues in current sprint
sprint in openSprints()

# Recently updated issues
updated >= -7d

# Combining filters
assignee = currentUser() AND priority = High AND type = Bug AND status != Done
```

## JSON Output Format

Always use the `--json` flag for structured, parseable output. The JSON response typically includes:

- `key`: Issue identifier (e.g., PROJ-123)
- `summary`: Brief description
- `status`: Current status (To Do, In Progress, Done, etc.)
- `priority`: Priority level (Highest, High, Medium, Low, Lowest)
- `assignee`: Assigned user information
- `created`: Creation timestamp
- `updated`: Last update timestamp
- `description`: Full description text
- `comments`: Array of comment objects (when using comment list)
