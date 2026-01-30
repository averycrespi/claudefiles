# Comment Commands

This reference documents ACLI commands for working with Jira issue comments.

## Getting Help

```bash
acli jira workitem comment --help
acli jira workitem comment list --help
acli jira workitem comment create --help
```

## Reading Comments

### List Comments

```bash
acli jira workitem comment list [options]
```

**Required Options:**
- `-k, --key <KEY>` - Issue key

**Optional Options:**
- `--json` - Generate JSON output
- `--limit <num>` - Maximum comments to fetch (default: 50)
  - **Recommended**: Use `--limit 5` to show only recent comments by default
- `--order <field>` - Order by field: `created` or `updated`
  - Prefix with `+` for ascending, `-` for descending
  - **Recommended**: Use `--order "-created"` to show newest first

**Examples:**
```bash
# Recommended: Recent comments only (efficient)
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json

# Default page of comments
acli jira workitem comment list --key PROJ-123 --json
```

**Best Practices:**
1. **Limit comments by default**: Use `--limit 5` for recent comments
2. **Order by newest first**: Use `--order "-created"` for most relevant
3. **Only fetch when asked**: Don't include comments in default ticket views

## Writing Comments

### Create Comment

```bash
acli jira workitem comment create [options]
```

**Required Options:**
- `-k, --key <keys>` - Issue key(s) to comment on

**Content Options (one required):**
- `-b, --body <text>` - Comment body (plain text or ADF)
- `-F, --body-file <path>` - Read comment from file
- `-e, --editor` - Open text editor to write comment

**Optional Options:**
- `--json` - Output created comment as JSON

**Examples:**
```bash
# Add a simple comment
acli jira workitem comment create --key PROJ-123 --body "Started investigating this issue" --json

# Add a longer comment
acli jira workitem comment create --key PROJ-123 --body "Found the root cause - it's a race condition in the authentication flow. Will fix in next PR." --json

# Add comment to multiple issues
acli jira workitem comment create --key "PROJ-123,PROJ-124" --body "These are duplicates, linking together" --json
```

**Confirmation Preview Pattern:**
```
Adding comment to PROJ-123:
  "Started investigating this issue - looks like a race condition..."
```

**Use Cases:**
- Document investigation progress
- Note blockers or dependencies
- Record decisions made during development
- Link related PRs or commits

## JSON Output Fields

Comment objects contain:

- `id` - Comment ID
- `author` - User object with `displayName`, `emailAddress`
- `body` - Comment text (can be plain text or ADF)
- `created` - ISO 8601 timestamp
- `updated` - ISO 8601 timestamp

## Error Handling

### 403 Forbidden
**Cause**: User lacks permission to comment on issue
**Recovery**: Check project permissions with administrator

### 404 Not Found
**Cause**: Issue doesn't exist
**Recovery**: Verify issue key, search for similar issues
