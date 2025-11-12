# Board and Sprint Commands

This reference documents ACLI commands for interacting with Jira boards and sprints.

## Getting Help

```bash
acli jira board --help
acli jira board search --help
acli jira board get --help
acli jira board list-sprints --help
acli jira sprint --help
acli jira sprint list-workitems --help
```

## Board Commands

### Search Boards

```bash
acli jira board search [options]
```

**Options:**
- `--json` - Generate JSON output
- `--csv` - Generate CSV output
- `--project <KEY>` - Filter to boards relevant to a project
- `--name <name>` - Filter to boards matching or partially matching name
- `--type <type>` - Filter by board type: `scrum`, `kanban`, or `simple`
- `--filter <id>` - Filter ID (not supported for next-gen boards)
- `--limit <num>` - Maximum boards to return (default: 50)
- `--paginate` - Load all boards
- `--orderBy <field>` - Sort by field: `name`, `-name`, or `+name`
- `--private` - Include private boards (name/type excluded for security)

**Examples:**
```bash
# Search boards for a project (most common usage)
acli jira board search --project TEAM --json

# Find scrum boards by name
acli jira board search --name "Sprint" --type scrum --json

# List all boards with pagination
acli jira board search --paginate --json

# Find boards by type
acli jira board search --type scrum --json
```

**Best Practices:**
- Use `--project` to scope search when user mentions a project
- Use `--name` for partial matching when user references board name
- Default to `--type scrum` when user asks about sprints

### Get Board Details

```bash
acli jira board get --id <BOARD_ID> [options]
```

**Arguments:**
- `--id <num>` - Board ID (required)

**Options:**
- `--json` - Generate JSON output

**Examples:**
```bash
# Get specific board details
acli jira board get --id 6 --json
```

**Board ID Discovery:**
Board IDs are numeric and must be discovered using `acli jira board search`. Typical workflow:
1. User asks about "sprint board" or "team board"
2. Search boards: `acli jira board search --project TEAM --json`
3. Extract board ID from results
4. Use ID for subsequent commands

### List Sprints

```bash
acli jira board list-sprints --id <BOARD_ID> [options]
```

**Arguments:**
- `--id <num>` - Board ID (required)

**Options:**
- `--json` - Generate JSON output

**Examples:**
```bash
# List all sprints for a board
acli jira board list-sprints --id 6 --json
```

**Usage:**
- Returns all sprints for a board (active, future, and closed)
- Use to find sprint IDs for `sprint list-workitems` command
- Look for sprints with `state: "active"` for current sprint

## Sprint Commands

### List Sprint Work Items

```bash
acli jira sprint list-workitems [options]
```

**Options:**
- `--board <num>` - Board ID (required)
- `--sprint <num>` - Sprint ID (required)
- `--json` - Generate JSON output
- `--csv` - Generate CSV output
- `--fields <fields>` - Comma-separated fields (default: `key,issuetype,summary,assignee,priority,status`)
  - **Recommended**: `key,summary,status,assignee` for minimal output
- `--jql <query>` - Additional JQL filter for work items in sprint
- `--limit <num>` - Maximum issues per page (default: 50)
- `--paginate` - Fetch all pages

**Examples:**
```bash
# List all work items in a sprint (minimal fields)
acli jira sprint list-workitems --board 6 --sprint 1 --fields key,summary,status,assignee --json

# Filter sprint items with JQL
acli jira sprint list-workitems --board 6 --sprint 1 --jql "assignee = currentUser()" --json

# Get all items with pagination
acli jira sprint list-workitems --board 6 --sprint 1 --paginate --json

# Count sprint items
acli jira sprint list-workitems --board 6 --sprint 1 --jql "status != Done" --json | jq '. | length'
```

**Best Practices:**
- Use minimal fields: `key,summary,status,assignee`
- Add `--jql` filter to narrow results (e.g., by assignee, status)
- Use `--paginate` only when needed for comprehensive sprint view

## Common Workflows

### Finding Current Sprint Tickets

**Sequential workflow** (requires board/sprint IDs):
1. Search for board: `acli jira board search --project TEAM --json`
2. Get board ID from results
3. List sprints: `acli jira board list-sprints --id <BOARD_ID> --json`
4. Find active sprint (look for `state: "active"`)
5. List sprint items: `acli jira sprint list-workitems --board <BOARD_ID> --sprint <SPRINT_ID> --json`

**JQL alternative** (more efficient):
```bash
acli jira workitem search --jql "sprint in openSprints() AND project = TEAM" --fields key,summary,status,assignee --limit 20 --json
```

**Recommendation**: Use JQL when possible for efficiency. Use board/sprint commands when user needs board-specific information.

### Finding Board and Sprint IDs

**Typical pattern:**
```bash
# 1. Find board for project
acli jira board search --project TEAM --json

# 2. Extract board ID (e.g., 6)
# 3. List sprints for that board
acli jira board list-sprints --id 6 --json

# 4. Extract sprint ID (e.g., 1 for active sprint)
# 5. Use IDs for sprint operations
acli jira sprint list-workitems --board 6 --sprint 1 --json
```

## Sprint-Specific JQL Patterns

### Active Sprints
```jql
# Issues in any active sprint
sprint in openSprints()

# Issues in active sprint for specific project
project = TEAM AND sprint in openSprints()
```

### Specific Sprint
```jql
# Issues in named sprint
sprint = "Sprint 23"

# Issues added to sprint
sprint = "Sprint 23" AND status != Done
```

### Sprint Status
```jql
# Completed sprint work
sprint = "Sprint 23" AND status = Done

# Incomplete sprint work
sprint in openSprints() AND status != Done
```

### No Sprint
```jql
# Backlog items (no sprint assigned)
sprint is EMPTY

# Project backlog
project = TEAM AND sprint is EMPTY
```

See [`jql.md`](jql.md) for more comprehensive patterns.

## JSON Output Fields

### Board Fields
- `id` - Board ID (numeric)
- `name` - Board display name
- `type` - Board type (scrum, kanban, simple)
- `location` - Board location information including project

### Sprint Fields
- `id` - Sprint ID (numeric)
- `name` - Sprint name (e.g., "Sprint 23")
- `state` - Sprint state (active, future, closed)
- `startDate` - ISO 8601 timestamp
- `endDate` - ISO 8601 timestamp
- `completeDate` - ISO 8601 timestamp (for closed sprints)

## Error Handling

### Board Not Found

**Symptom**: Board ID doesn't exist

**Recovery**:
```
Board not found. Use: acli jira board search --project TEAM --json
```

### Sprint Not Found

**Symptom**: Sprint ID doesn't exist for board

**Recovery**:
```
Sprint not found. Use: acli jira board list-sprints --id <BOARD_ID> --json
```

See [`error-handling.md`](error-handling.md) for comprehensive error patterns.
