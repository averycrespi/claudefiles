# Issue Commands

This reference documents ACLI commands for interacting with Jira issues.

## Getting Help

```bash
acli jira workitem --help
acli jira workitem view --help
acli jira workitem search --help
acli jira workitem create --help
acli jira workitem edit --help
acli jira workitem transition --help
```

## Reading Issues

### View Issue

```bash
acli jira workitem view <KEY> [options]
```

**Arguments:**
- `<KEY>` - Issue key (e.g., PROJ-123)

**Options:**
- `--json` - Generate JSON output (always use this for parsing)
- `--fields <fields>` - Comma-separated list of fields to return
  - Default (ACLI): `key,issuetype,summary,status,assignee,description`
  - **Recommended default**: `key,summary,status,priority,assignee` (excludes expensive `description` and `issuetype`)
  - `*all` - Returns all fields (avoid - expensive)
  - `*navigable` - Returns navigable fields (avoid - expensive)
  - Prefix with `-` to exclude: `-description` excludes description
- `--web` - Open issue in web browser

**Field Selection Guidelines:**
- **Quick view** (default): `key,summary,status,priority,assignee`
- **Detailed view** (when user asks for details): `key,summary,status,priority,assignee,created,updated,description`
- **Minimal view** (for lists): `key,summary,status,assignee`

**Examples:**
```bash
# Recommended: Quick view with minimal fields (default usage)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json

# Detailed view (when user asks for details)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json
```

### Search Issues

```bash
acli jira workitem search [options]
```

**Options:**
- `--jql <query>` - JQL query string (required unless using --filter)
- `--filter <id>` - Filter ID to use for search
- `--json` - Generate JSON output (always use this)
- `--fields <fields>` - Comma-separated list of fields to display
  - **Recommended**: `key,summary,status,assignee`
- `--limit <num>` - Maximum number of issues to fetch
  - **Always use this**: Default to `--limit 20` to prevent excessive results
- `--count` - Return count of matching issues only

**Examples:**
```bash
# Recommended: Search with minimal fields and limit
acli jira workitem search --jql "project = TEAM" --fields key,summary,status,assignee --limit 20 --json

# Count only (efficient when user needs quantity)
acli jira workitem search --jql "sprint in openSprints()" --count
```

## Writing Issues

### Create Issue

```bash
acli jira workitem create [options]
```

**Required Options:**
- `-p, --project <key>` - Project key (e.g., PROJ)
- `-t, --type <type>` - Issue type (e.g., Bug, Story, Task, Epic)
- `-s, --summary <text>` - Issue summary/title

**Optional Options:**
- `-d, --description <text>` - Issue description (plain text or ADF)
- `-a, --assignee <email>` - Assignee email, `@me` for self, `default` for project default
- `-l, --label <labels>` - Comma-separated labels
- `--parent <key>` - Parent issue key (for subtasks or stories under epics)
- `--json` - Output created issue as JSON

**Examples:**
```bash
# Create a basic task
acli jira workitem create --project PROJ --type Task --summary "Implement login page" --json

# Create a bug with description and assignee
acli jira workitem create --project PROJ --type Bug --summary "Fix timeout error" --description "Users report timeouts on slow connections" --assignee @me --json

# Create a story with labels
acli jira workitem create --project PROJ --type Story --summary "User authentication" --label "auth,mvp" --json
```

**Confirmation Preview Pattern:**
Before executing, show the user what will be created:
```
Creating ticket in PROJ:
  Type: Bug
  Summary: Fix timeout error
  Description: Users report timeouts... (truncated if long)
  Assignee: @me
```

**Session Project Context:**
- If user created/viewed tickets in a project earlier, propose reusing that project
- Ask for project key if none is established in session
- User can always override with explicit project specification

### Edit Issue

```bash
acli jira workitem edit [options]
```

**Required Options:**
- `-k, --key <keys>` - Issue key(s) to edit (comma-separated for multiple)

**Optional Options:**
- `-s, --summary <text>` - New summary
- `-d, --description <text>` - New description
- `-a, --assignee <email>` - New assignee (`@me`, email, or `default`)
- `--remove-assignee` - Unassign the issue
- `-l, --labels <labels>` - Set labels (replaces existing)
- `--remove-labels <labels>` - Remove specific labels
- `-t, --type <type>` - Change issue type
- `-y, --yes` - Skip confirmation prompt
- `--json` - Output result as JSON

**Examples:**
```bash
# Update summary
acli jira workitem edit --key PROJ-123 --summary "New title" --json

# Assign to self
acli jira workitem edit --key PROJ-123 --assignee @me --json

# Assign to specific user
acli jira workitem edit --key PROJ-123 --assignee user@example.com --json

# Unassign
acli jira workitem edit --key PROJ-123 --remove-assignee --json

# Update multiple fields
acli jira workitem edit --key PROJ-123 --summary "Updated title" --description "New description" --json
```

**Confirmation Preview Pattern:**
```
Editing PROJ-123:
  Summary: "Old title" → "New title"
  Assignee: unassigned → john@example.com
```

### Transition Issue (Change Status)

```bash
acli jira workitem transition [options]
```

**Required Options:**
- `-k, --key <keys>` - Issue key(s) to transition
- `-s, --status <status>` - Target status name (e.g., "In Progress", "Done")

**Optional Options:**
- `-y, --yes` - Skip confirmation prompt
- `--json` - Output result as JSON

**Examples:**
```bash
# Move to In Progress
acli jira workitem transition --key PROJ-123 --status "In Progress" --json

# Mark as Done
acli jira workitem transition --key PROJ-123 --status "Done" --json

# Move back to To Do
acli jira workitem transition --key PROJ-123 --status "To Do" --json
```

**Confirmation Preview Pattern:**
```
Transitioning PROJ-123:
  Status: "To Do" → "In Progress"
```

**Error Handling:**
If transition fails (invalid workflow path), query available transitions:
```bash
# The transition command will show available statuses in error message
# Offer user the valid options from the error output
```

## JSON Output Fields

Typical JSON fields for issues:

- `key` - Issue identifier (e.g., PROJ-123)
- `id` - Numeric issue ID
- `summary` - Brief description
- `description` - Full description text (expensive - use selectively)
- `status` - Current status object with `name` field
- `priority` - Priority object with `name` field
- `issuetype` - Issue type object (Bug, Story, Task, etc.)
- `assignee` - User object with `displayName` and `emailAddress`
- `reporter` - User object for issue creator
- `created` - ISO 8601 timestamp
- `updated` - ISO 8601 timestamp

## Common JQL Patterns for Issues

```jql
# My assigned tickets
assignee = currentUser()

# Unassigned tickets in project
project = TEAM AND assignee is EMPTY

# In progress work
status = "In Progress" AND assignee = currentUser()

# Bugs only
type = Bug

# Recent updates
updated >= -7d AND project = TEAM
```

See [`jql.md`](jql.md) for comprehensive patterns.
