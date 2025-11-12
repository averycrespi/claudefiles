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
  - Default (ACLI): `key,issuetype,summary,status,assignee,description`
  - **Recommended default**: `key,summary,status,priority,assignee` (excludes expensive `description` and `issuetype`)
  - `*all` - Returns all fields (avoid - expensive)
  - `*navigable` - Returns navigable fields (avoid - expensive)
  - Prefix with `-` to exclude: `-description` excludes description
  - Examples:
    - `key,summary,status,priority,assignee` - Minimal, efficient (recommended default)
    - `key,summary,status,priority,assignee,created,updated,description` - Detailed view
    - `*navigable,-comment,-description` - All navigable fields except expensive ones
- `--web` - Open work item in web browser

**Examples:**
```bash
# Recommended: Quick view with minimal fields (default usage)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json

# Detailed view (when user asks for details)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json

# Avoid: Full fields (very expensive)
acli jira workitem view PROJ-123 --fields "*all" --json  # Don't use unless necessary
```

### Search Work Items
```bash
acli jira workitem search [options]
```

**Options:**
- `--jql <query>` - JQL query string (required unless using --filter)
- `--filter <id>` - Filter ID to use for search
- `--json` - Generate JSON output (always use this)
- `--csv` - Generate CSV output (more compact for large result sets)
- `--fields <fields>` - Comma-separated list of fields to display
  - Default (ACLI): `issuetype,key,assignee,priority,status,summary`
  - **Recommended**: `key,summary,status,assignee` (excludes `issuetype`, `priority` unless needed)
- `--limit <num>` - Maximum number of work items to fetch
  - **Always use this**: Default to `--limit 20` to prevent excessive results
- `--paginate` - Fetch all work items by paginating (ignores --limit, use sparingly)
- `--count` - Return count of matching work items only (use when user only needs quantity)
- `--web` - Open search in web browser

**Examples:**
```bash
# Recommended: Search with minimal fields and limit
acli jira workitem search --jql "project = TEAM" --fields key,summary,status,assignee --limit 20 --json

# Count only (efficient when user needs quantity)
acli jira workitem search --jql "sprint in openSprints()" --count

# Search with custom fields and limit
acli jira workitem search --jql "assignee = currentUser()" --fields "key,summary,status" --limit 20 --json

# Use sparingly: Paginate through all results (can be expensive)
acli jira workitem search --jql "project = TEAM AND status != Done" --paginate --json
```

### List Comments
```bash
acli jira workitem comment list [options]
```

**Options:**
- `--key <KEY>` - Work item key (required)
- `--json` - Generate JSON output
- `--limit <num>` - Maximum comments per page (default: 50)
  - **Recommended**: Use `--limit 5` to show only recent comments by default
- `--order <field>` - Order by field: `created` or `updated` (default: `+created`)
  - Prefix with `+` for ascending, `-` for descending
  - **Recommended**: Use `--order "-created"` to show newest first
- `--paginate` - Fetch all comments (ignores --limit, use very sparingly - can be extremely expensive)

**Examples:**
```bash
# Recommended: Recent comments only (efficient)
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json

# List all comments on first page (default limit)
acli jira workitem comment list --key PROJ-123 --json

# Use sparingly: Get all comments (very expensive for issues with many comments)
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
- `description` - Full description text (expensive - use selectively)
- `status` - Current status object with `name` field
- `priority` - Priority object with `name` field (Highest, High, Medium, Low, Lowest)
- `issuetype` - Issue type object (Bug, Story, Task, etc.)
- `assignee` - User object with `displayName` and `emailAddress`
- `reporter` - User object for issue creator
- `created` - ISO 8601 timestamp
- `updated` - ISO 8601 timestamp
- `comment` - Comments array (expensive - use selectively)

### Field Specifications
When specifying fields:
- Case-sensitive: Use exact field names
- Custom fields: Use field ID like `customfield_10001`
- System fields: Use standard names like `summary`, `description`, `status`
- Field expansion: Some fields require explicit request (e.g., `comment`)

## Context Optimization

### Field Selection Strategies

To minimize token consumption, use selective field specifications based on query intent:

**Recommended field sets:**

1. **Quick view** (default for ticket lookups):
   ```bash
   --fields key,summary,status,priority,assignee
   ```
   Use for: Quick ticket references, status checks, "What's PROJ-123?"

2. **Detailed view** (when user needs more context):
   ```bash
   --fields key,summary,status,priority,assignee,created,updated,description
   ```
   Use for: "Show me details of PROJ-123", "What's the description of PROJ-123?"

3. **Search results** (list-based queries):
   ```bash
   --fields key,summary,status,assignee --limit 20
   ```
   Use for: JQL searches, sprint listings, "Show my tickets"

4. **Count only** (when quantity is sufficient):
   ```bash
   --count
   ```
   Use for: "How many tickets...", "Count of issues..."

**Performance considerations:**

- **Expensive fields** (high token cost):
  - `description` - Can be very large text blocks
  - `comment` - Array of all comments with full text
  - `attachment` - Array of attachment metadata
  - `*all` or `*navigable` - Returns all available fields

- **Efficient fields** (low token cost):
  - `key` - Just the ticket ID
  - `summary` - One-line description
  - `status` - Status object (name, id)
  - `priority` - Priority object (name, id)
  - `assignee` - User object (displayName, emailAddress)
  - `created`, `updated` - Timestamps

**Best practices:**

1. **Start minimal**: Use quick view fields by default, fetch additional details only when needed
2. **Avoid wildcards**: Never use `*all` or `*navigable` unless absolutely necessary
3. **Exclude expensive fields**: Use `-description,-comment` to explicitly exclude
4. **Limit results**: Always add `--limit` to searches (default: 20, adjust as needed)
5. **Use count**: When user only needs quantity, use `--count` instead of fetching all data
6. **Selective comments**: Use `--limit 5 --order "-created"` to show only recent comments
7. **Two-stage fetching**: For large searches, first show keys/summaries, then fetch details for specific items user wants

**Examples:**

```bash
# Minimal ticket view (default)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json

# Detailed ticket view (when user asks for details)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json

# Efficient search (always with limit)
acli jira workitem search --jql "sprint in openSprints()" --fields key,summary,status,assignee --limit 20 --json

# Count only (no field fetching)
acli jira workitem search --jql "assignee = currentUser() AND status != Done" --count

# Recent comments only (not all)
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json

# Exclude expensive fields
acli jira workitem view PROJ-123 --fields "*navigable,-description,-comment,-attachment" --json
```

## Important Notes

1. **Always use `--json` flag** for programmatic access to ensure consistent, parseable output
2. **JQL queries must be quoted** when containing spaces or special characters
3. **Pagination is recommended** for large result sets to avoid timeouts
4. **Field names are case-sensitive** in JQL and field specifications
5. **Board and Sprint IDs are numeric** - use search commands to find them first
6. **Project keys are uppercase** (e.g., TEAM, PROJ) and used in many commands
7. **Help is contextual** - use `--help` for command-specific guidance
