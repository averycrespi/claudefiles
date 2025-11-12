# ACLI Command Reference

This reference documents the Atlassian CLI (ACLI) commands available for Jira integration. All commands follow the pattern: `acli jira <resource> <action> [arguments] [options]`

## Getting Help

Use the `--help` flag at any command level to get detailed information:

```bash
acli jira workitem view --help
```

The help output shows:
- Command description
- Usage syntax with required and optional parameters
- Available flags with descriptions
- Usage examples

## Authentication

### Check Authentication Status
```bash
acli jira auth status
```

Returns current authentication state and connected Jira instance.

### Login
```bash
acli jira auth login
```

**Note**: Requires interactive input. Cannot be automated. Guide user to run this command manually if authentication fails.

## Work Items (Issues)

### View Work Item
```bash
acli jira workitem view <KEY> [options]
```

**Arguments:**
- `<KEY>` - Work item key (e.g., PROJ-123)

**Options:**
- `--json` - Generate JSON output (always use this for parsing)
- `--fields <fields>` - Comma-separated list of fields to return
  - Default: `key,issuetype,summary,status,assignee,description`
  - `*all` - Returns all fields
  - `*navigable` - Returns navigable fields
  - Prefix with `-` to exclude: `-description` excludes description
  - Examples:
    - `summary,comment` - Only summary and comments
    - `*navigable,-comment` - All navigable fields except comments
- `--web` - Open work item in web browser

**Examples:**
```bash
# View with default fields as JSON
acli jira workitem view PROJ-123 --json

# View with specific fields
acli jira workitem view PROJ-123 --fields summary,assignee,priority --json

# View all fields
acli jira workitem view PROJ-123 --fields "*all" --json
```

### Search Work Items
```bash
acli jira workitem search [options]
```

**Options:**
- `--jql <query>` - JQL query string (required unless using --filter)
- `--filter <id>` - Filter ID to use for search
- `--json` - Generate JSON output (always use this)
- `--csv` - Generate CSV output
- `--fields <fields>` - Comma-separated list of fields to display
  - Default: `issuetype,key,assignee,priority,status,summary`
- `--limit <num>` - Maximum number of work items to fetch
- `--paginate` - Fetch all work items by paginating (ignores --limit)
- `--count` - Return count of matching work items only
- `--web` - Open search in web browser

**Examples:**
```bash
# Basic JQL search
acli jira workitem search --jql "project = TEAM" --json

# Search with custom fields
acli jira workitem search --jql "assignee = currentUser()" --fields "key,summary,status" --json

# Paginate through all results
acli jira workitem search --jql "project = TEAM AND status != Done" --paginate --json

# Get count only
acli jira workitem search --jql "sprint in openSprints()" --count
```

### List Comments
```bash
acli jira workitem comment list [options]
```

**Options:**
- `--key <KEY>` - Work item key (required)
- `--json` - Generate JSON output
- `--limit <num>` - Maximum comments per page (default: 50)
- `--order <field>` - Order by field: `created` or `updated` (default: `+created`)
  - Prefix with `+` for ascending, `-` for descending
- `--paginate` - Fetch all comments (ignores --limit)

**Examples:**
```bash
# List comments for an issue
acli jira workitem comment list --key PROJ-123 --json

# List recent comments first
acli jira workitem comment list --key PROJ-123 --order "-created" --json

# Get all comments
acli jira workitem comment list --key PROJ-123 --paginate --json
```

## Projects

### List Projects
```bash
acli jira project list [options]
```

**Options:**
- `--json` - Generate JSON output
- `--limit <num>` - Maximum number of projects (default: 30)
- `--paginate` - Fetch all projects (ignores --limit)
- `--recent` - Return up to 20 recently viewed projects

**Examples:**
```bash
# List recent projects
acli jira project list --recent --json

# List all projects
acli jira project list --paginate --json

# List specific number
acli jira project list --limit 50 --json
```

### View Project
```bash
acli jira project view --key <PROJECT_KEY> [options]
```

**Options:**
- `--key <KEY>` - Project key (required, e.g., TEAM, PROJ)
- `--json` - Generate JSON output

**Examples:**
```bash
# View project details
acli jira project view --key TEAM --json
```

## Boards

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
# Search boards for a project
acli jira board search --project TEAM --json

# Find scrum boards by name
acli jira board search --name "Sprint" --type scrum --json

# List all boards with pagination
acli jira board search --paginate --json
```

### Get Board Details
```bash
acli jira board get --id <BOARD_ID> [options]
```

**Options:**
- `--id <num>` - Board ID (required)
- `--json` - Generate JSON output

### List Sprints
```bash
acli jira board list-sprints --id <BOARD_ID> [options]
```

**Options:**
- `--id <num>` - Board ID (required)
- `--json` - Generate JSON output

**Examples:**
```bash
# List all sprints for a board
acli jira board list-sprints --id 6 --json
```

## Sprints

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
- `--jql <query>` - Additional JQL filter for work items in sprint
- `--limit <num>` - Maximum issues per page (default: 50)
- `--paginate` - Fetch all pages

**Examples:**
```bash
# List all work items in a sprint
acli jira sprint list-workitems --board 6 --sprint 1 --json

# Filter sprint items with JQL
acli jira sprint list-workitems --board 6 --sprint 1 --jql "assignee = currentUser()" --json

# Get all items with pagination
acli jira sprint list-workitems --board 6 --sprint 1 --paginate --json
```

## Common JQL Patterns

### User Filters
```jql
# Issues assigned to current user
assignee = currentUser()

# Issues reported by current user
reporter = currentUser()

# Unassigned issues
assignee is EMPTY
```

### Priority and Type Filters
```jql
# High priority issues
priority = High

# Critical bugs
priority = Highest AND type = Bug

# Stories and tasks
type in (Story, Task)
```

### Status Filters
```jql
# In progress work
status = "In Progress"

# Not done
status != Done

# Multiple statuses
status in ("To Do", "In Progress")
```

### Time-based Filters
```jql
# Created in last 7 days
created >= -7d

# Updated today
updated >= startOfDay()

# Due this week
due <= endOfWeek()
```

### Sprint Filters
```jql
# Issues in active sprints
sprint in openSprints()

# Issues in specific sprint
sprint = "Sprint 23"

# Issues not in any sprint
sprint is EMPTY
```

### Combining Filters
```jql
# My high priority bugs not done
assignee = currentUser() AND priority = High AND type = Bug AND status != Done

# Current sprint items for a team
project = TEAM AND sprint in openSprints() AND status != Done

# Recently updated unassigned issues
updated >= -3d AND assignee is EMPTY AND status = "To Do"
```

### Text Search
```jql
# Search in summary and description
text ~ "authentication"

# Summary contains word
summary ~ "login"

# Description contains phrase
description ~ "user account"
```

## Output Format Notes

### JSON Output
Always use `--json` flag for structured, parseable output. Typical JSON fields include:

- `key` - Issue identifier (e.g., PROJ-123)
- `id` - Numeric issue ID
- `summary` - Brief description
- `description` - Full description text
- `status` - Current status object with `name` field
- `priority` - Priority object with `name` field (Highest, High, Medium, Low, Lowest)
- `issuetype` - Issue type object (Bug, Story, Task, etc.)
- `assignee` - User object with `displayName` and `emailAddress`
- `reporter` - User object for issue creator
- `created` - ISO 8601 timestamp
- `updated` - ISO 8601 timestamp
- `comment` - Comments array (when using view with comments field)

### Field Specifications
When specifying fields:
- Case-sensitive: Use exact field names
- Custom fields: Use field ID like `customfield_10001`
- System fields: Use standard names like `summary`, `description`, `status`
- Field expansion: Some fields require explicit request (e.g., `comment`)

## Important Notes

1. **Always use `--json` flag** for programmatic access to ensure consistent, parseable output
2. **JQL queries must be quoted** when containing spaces or special characters
3. **Pagination is recommended** for large result sets to avoid timeouts
4. **Field names are case-sensitive** in JQL and field specifications
5. **Board and Sprint IDs are numeric** - use search commands to find them first
6. **Project keys are uppercase** (e.g., TEAM, PROJ) and used in many commands
7. **Help is contextual** - use `--help` for command-specific guidance
