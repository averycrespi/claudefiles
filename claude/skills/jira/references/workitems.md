# Work Item Commands

This reference documents ACLI commands for interacting with Jira work items (issues).

## Getting Help

```bash
acli jira workitem --help
acli jira workitem view --help
acli jira workitem search --help
acli jira workitem comment list --help
```

## View Work Item

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
- `--web` - Open work item in web browser

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

# Avoid: Full fields (very expensive)
acli jira workitem view PROJ-123 --fields "*all" --json  # Don't use unless necessary

# Exclude specific expensive fields
acli jira workitem view PROJ-123 --fields "*navigable,-description,-comment,-attachment" --json
```

**Usage Patterns:**
- **Single ticket reference**: Use quick view fields
- **User asks for details**: Add `created`, `updated`, `description`
- **Multiple tickets in parallel**: Fetch all using parallel Bash tool calls

## Search Work Items

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

**JQL Query Construction:**
For natural language requests, construct appropriate JQL queries:
- "My tickets" → `assignee = currentUser()`
- "High priority bugs" → `priority = High AND type = Bug`
- "Current sprint" → `sprint in openSprints()`
- "Unassigned issues" → `assignee is EMPTY`

See [`jql.md`](jql.md) for comprehensive JQL patterns.

**Best Practices:**
1. **Always use `--limit`**: Default to 20, adjust based on user needs
2. **Use `--count` when appropriate**: If user only needs quantity, use count instead of fetching all data
3. **Minimal fields for searches**: Use `key,summary,status,assignee` by default
4. **Inform about truncation**: If results are limited, tell user: "Showing 20 of 150 results"

## List Comments

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

**Best Practices:**
1. **Limit comments by default**: Use `--limit 5` to show only recent comments
2. **Order by newest first**: Use `--order "-created"` for most relevant comments
3. **Only fetch comments when asked**: Don't include comments in default ticket views
4. **Avoid pagination**: Comments can be numerous; paginating all can be very expensive

## JSON Output Fields

Typical JSON fields for work items:

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

**Field Specifications:**
- Case-sensitive: Use exact field names
- Custom fields: Use field ID like `customfield_10001`
- System fields: Use standard names like `summary`, `description`, `status`
- Field expansion: Some fields require explicit request (e.g., `comment`)

## Work Item-Specific JQL Patterns

### User Assignments
```jql
# My assigned tickets
assignee = currentUser()

# Unassigned tickets in project
project = TEAM AND assignee is EMPTY
```

### Status and Progress
```jql
# In progress work
status = "In Progress" AND assignee = currentUser()

# Blocked issues
status = Blocked
```

### Issue Types
```jql
# Bugs only
type = Bug

# Stories and tasks
type in (Story, Task)
```

See [`jql.md`](jql.md) for more comprehensive patterns.

## Error Handling

### 404 Not Found

**Symptom**: Issue not found

**Recovery Pattern**:
```
Unable to find issue PROJ-999. Would you like to search for similar issues?
```

### 403 Forbidden

**Symptom**: User lacks permission to access issue

**Recovery Pattern**:
```
Permission denied for PROJ-123. Check with Jira administrator for access.
```

See [`error-handling.md`](error-handling.md) for comprehensive error patterns.
