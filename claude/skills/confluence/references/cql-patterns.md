# CQL (Confluence Query Language) Patterns

This reference provides common CQL query patterns for use with `confluence-search`.

## Important: CQL Mode vs Text Search

The `confluence-search` script supports two modes:

1. **CQL Mode (default)**: Passes your query directly as CQL
   - Use for: All queries with full CQL syntax
   - Example: `confluence-search "text ~ \"project documentation\""`
   - Example: `confluence-search "space = DEV AND text ~ \"API\""`

2. **Text Search Mode (with `--text` flag)**: Automatically wraps your query in `text ~ "query"` pattern
   - Use for: Simple keyword searches without CQL syntax
   - Example: `confluence-search --text "project documentation"`

**CQL is the default - no flag needed for CQL queries. Use `--text` flag for simple text searches.**

## Basic CQL Syntax

CQL queries are built using fields, operators, keywords, and functions.

### Search Operators

- `~` - Contains (case-insensitive text match)
- `=` - Equals (exact match)
- `!=` - Not equals
- `<`, `>`, `<=`, `>=` - Comparison operators
- `AND`, `OR`, `NOT` - Logical operators
- `IN` - Matches any value in a list
- `ORDER BY` - Sort results

## Common Search Patterns

### Simple Text Search (with --text flag)

**Simple text search** (using --text flag):
```bash
confluence-search --text "project documentation"
# Automatically becomes: text ~ "project documentation"
```

**Multiple terms**:
```bash
confluence-search --text "API guide authentication"
# Automatically becomes: text ~ "API guide authentication"
```

### Natural Language to CQL Mapping

| User Query | CQL Pattern |
|------------|-------------|
| "Find pages about authentication" | `text ~ "authentication"` |
| "Pages in the DEV space" | `space = DEV AND text ~ "query"` |
| "Recently updated pages" | `lastModified >= "2025-01-01"` |
| "Pages created by me" | `creator = currentUser()` |
| "Pages with 'api' label" | `label = "api"` |
| "Pages in multiple spaces" | `space IN (DEV, DOCS)` |

### CQL Query Construction (Default Mode)

Use CQL queries directly without any flag:

**Space filtering**:
```bash
# Search in specific space
confluence-search "space = DEV AND text ~ \"architecture\""

# Multiple spaces
confluence-search "space IN (DEV, DOCS) AND text ~ \"onboarding\""
```

**Date-based searches**:
```bash
# Pages modified in last 7 days
confluence-search "lastModified >= now(\"-7d\")"

# Pages created this month
confluence-search "created >= startOfMonth()"

# Date range
confluence-search "created >= \"2025-01-01\" AND created <= \"2025-01-31\""
```

**Author/Creator filtering**:
```bash
# Current user's pages
confluence-search "creator = currentUser()"

# Specific user (by username)
confluence-search "creator = \"john.doe@company.com\""

# Last modifier
confluence-search "lastModifiedBy = currentUser()"
```

**Label-based searches**:
```bash
# Single label
confluence-search "label = documentation"

# Multiple labels (pages with all labels)
confluence-search "label = api AND label = public"

# Multiple labels (pages with any label)
confluence-search "label IN (api, internal)"
```

**Type filtering**:
```bash
# Only pages
confluence-search "type = page"

# Only blog posts
confluence-search "type = blogpost"

# Exclude certain types
confluence-search "type != comment"
```

**Combining conditions**:
```bash
# Complex query
confluence-search "space = DEV AND label = architecture AND lastModified >= now(\"-30d\") AND creator = currentUser()"

# Using OR conditions
confluence-search "(space = DEV OR space = DOCS) AND text ~ \"API\""
```

## CQL Functions

Useful functions for dynamic queries:

- `currentUser()` - Currently authenticated user
- `now()` - Current date/time
- `now("-7d")` - 7 days ago (also: "-1w", "-1M", "-1y")
- `startOfDay()`, `endOfDay()` - Day boundaries
- `startOfWeek()`, `endOfWeek()` - Week boundaries
- `startOfMonth()`, `endOfMonth()` - Month boundaries
- `startOfYear()`, `endOfYear()` - Year boundaries

## Result Ordering

Sort results by specific fields using CQL ORDER BY:

```bash
# Most recently modified first
confluence-search "text ~ \"API\" ORDER BY lastModified DESC"

# Oldest first
confluence-search "space = DEV ORDER BY created ASC"

# By title (alphabetical)
confluence-search "label = documentation ORDER BY title ASC"
```

## Tips for Effective Searches

1. **Use CQL by default**: Pass CQL queries directly: `confluence-search "text ~ \"query\""`
2. **Use `--text` for convenience**: Add `--text` flag for simple searches: `confluence-search --text "query"`
3. **Combine space + text**: Most effective CQL pattern is `space = "KEY" AND text ~ "query"`
4. **Limit results**: Use `--limit` flag to control result count (works in both modes)
5. **Date functions over exact dates**: Use `now("-7d")` instead of hardcoded dates for maintainability

## Examples by Use Case

### Finding Documentation (Simple Text Search)

```bash
# Recent API documentation (using --text flag for convenience)
confluence-search --text "API documentation" --limit 20

# Onboarding guides
confluence-search --text "onboarding" --limit 10

# Release notes
confluence-search --text "release notes" --limit 15
```

### Team Collaboration (CQL)

```bash
# My recent pages
confluence-search "creator = currentUser()" --limit 50

# Team's recent updates
confluence-search "space = TEAM AND lastModified >= now(\"-7d\")" --limit 30

# Meeting notes with specific label
confluence-search "label = meeting-notes AND lastModified >= now(\"-30d\")" --limit 20
```

### Project Research (CQL)

```bash
# Architecture decisions in specific space
confluence-search "space = ARCH AND text ~ \"decision\"" --limit 20

# Design specifications with label
confluence-search "label = design AND text ~ \"spec\"" --limit 25

# Recent technical documentation
confluence-search "space = DOCS AND label = technical AND lastModified >= now(\"-90d\")" --limit 30
```

## Limitations

The `confluence-search` script uses the Confluence REST API's `/search` endpoint with CQL. Note:

- **Result cap**: API returns max 1000 results (use `--limit` to control)
- **Search scope**: Searches only content user has permission to view
- **Performance**: Complex queries with many conditions may be slower
- **Text search**: Uses Confluence's built-in text indexing (usually updated within minutes)

## Choosing Between CQL and Text Search

**Use CQL mode (default)** when:
- Filtering by space, label, creator, or date
- Combining multiple conditions with AND/OR
- Using CQL functions like `currentUser()` or `now("-7d")`
- Sorting results with ORDER BY
- Full control over query structure
- Example: `confluence-search "space = DEV AND lastModified >= now(\"-7d\")"`

**Use `--text` flag when**:
- Searching for simple keywords or phrases
- You don't need filters (space, labels, dates, creators)
- Prefer simpler command syntax without CQL operators
- Example: `confluence-search --text "API documentation"`

CQL mode (default) provides full access to Confluence Query Language without needing to construct manual API calls.

## See Also

- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/)
- [CQL Field Reference](https://developer.atlassian.com/cloud/confluence/cql-fields/)
- [CQL Functions Reference](https://developer.atlassian.com/cloud/confluence/cql-functions/)
