# Project Commands

This reference documents ACLI commands for interacting with Jira projects.

## Getting Help

```bash
acli jira project --help
acli jira project list --help
acli jira project view --help
```

## List Projects

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
# List recent projects (most useful for active work)
acli jira project list --recent --json

# List all projects
acli jira project list --paginate --json

# List specific number
acli jira project list --limit 50 --json
```

**Best Practices:**
- Use `--recent` when user asks for "my projects" or "current projects"
- Use `--paginate` when user needs comprehensive project list
- Default to `--recent` for most queries to reduce context consumption

## View Project

```bash
acli jira project view --key <PROJECT_KEY> [options]
```

**Arguments:**
- `--key <KEY>` - Project key (required, e.g., TEAM, PROJ)

**Options:**
- `--json` - Generate JSON output

**Examples:**
```bash
# View project details
acli jira project view --key TEAM --json

# View specific project
acli jira project view --key PROJ --json
```

**Project Key Conventions:**
- Project keys are **uppercase** (e.g., TEAM, PROJ, DEV)
- Typically 2-10 characters
- Used throughout Jira commands and JQL queries
- Can be discovered via `acli jira project list`

## JSON Output Fields

Typical JSON fields for projects:

- `key` - Project key (e.g., TEAM)
- `id` - Numeric project ID
- `name` - Project display name
- `projectTypeKey` - Type of project (software, business, etc.)
- `lead` - Project lead user object
- `description` - Project description (if available)

## Project-Related JQL Patterns

### Filter by Project
```jql
# All issues in project
project = TEAM

# Multiple projects
project in (TEAM, PROJ, DEV)
```

### Project and Status
```jql
# Open issues in project
project = TEAM AND status != Done

# Todo items in specific project
project = TEAM AND status = "To Do"
```

### Project and Assignment
```jql
# My issues in project
project = TEAM AND assignee = currentUser()

# Unassigned issues in project
project = TEAM AND assignee is EMPTY
```

See `references/jql.md` for more comprehensive patterns.

## Usage Patterns

### Discovering Project Keys

When user mentions a project name but you need the key:
1. Use `acli jira project list --recent --json` to find likely matches
2. Search for project name in the results
3. Extract the `key` field for use in subsequent commands

### Project Context in Queries

Projects are often implicit in user queries:
- "Show current sprint tickets" → Need to determine which project/board
- "List my bugs" → May need to scope to specific project

**Strategy:**
1. Check if user has mentioned project name or key in conversation
2. If ambiguous, use `--recent` to show recently accessed projects
3. Ask user to clarify if multiple active projects exist
