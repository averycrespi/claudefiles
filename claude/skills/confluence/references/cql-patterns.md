# CQL (Confluence Query Language) Patterns

This reference provides common CQL query patterns for use with `confluence-search`.

## Important: Text Search vs CQL Mode

The `confluence-search` script supports two modes:

1. **Text Search Mode (default)**: Automatically wraps your query in `text ~ "query"` pattern
   - Use for: Simple keyword searches
   - Example: `confluence-search "project documentation"`

2. **CQL Mode (with `--cql` flag)**: Passes your query directly as CQL
   - Use for: Advanced queries with operators, functions, and filters
   - Example: `confluence-search --cql "space = DEV AND text ~ \"API\""`

**All advanced CQL examples in this document require the `--cql` flag.**

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

### Text Search (Default Mode)

**Simple text search** (no --cql flag needed):
```bash
confluence-search "project documentation"
# Automatically becomes: text ~ "project documentation"
```

**Multiple terms**:
```bash
confluence-search "API guide authentication"
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

### Advanced Query Construction (CQL Mode)

When users need more specific searches, use the `--cql` flag with custom CQL queries:

**Space filtering**:
```bash
# Search in specific space
confluence-search --cql "space = DEV AND text ~ \"architecture\""

# Multiple spaces
confluence-search --cql "space IN (DEV, DOCS) AND text ~ \"onboarding\""
```

**Date-based searches**:
```bash
# Pages modified in last 7 days
confluence-search --cql "lastModified >= now(\"-7d\")"

# Pages created this month
confluence-search --cql "created >= startOfMonth()"

# Date range
confluence-search --cql "created >= \"2025-01-01\" AND created <= \"2025-01-31\""
```

**Author/Creator filtering**:
```bash
# Current user's pages
confluence-search --cql "creator = currentUser()"

# Specific user (by username)
confluence-search --cql "creator = \"john.doe@company.com\""

# Last modifier
confluence-search --cql "lastModifiedBy = currentUser()"
```

**Label-based searches**:
```bash
# Single label
confluence-search --cql "label = documentation"

# Multiple labels (pages with all labels)
confluence-search --cql "label = api AND label = public"

# Multiple labels (pages with any label)
confluence-search --cql "label IN (api, internal)"
```

**Type filtering**:
```bash
# Only pages
confluence-search --cql "type = page"

# Only blog posts
confluence-search --cql "type = blogpost"

# Exclude certain types
confluence-search --cql "type != comment"
```

**Combining conditions**:
```bash
# Complex query
confluence-search --cql "space = DEV AND label = architecture AND lastModified >= now(\"-30d\") AND creator = currentUser()"

# Using OR conditions
confluence-search --cql "(space = DEV OR space = DOCS) AND text ~ \"API\""
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

Sort results by specific fields using the `--cql` flag:

```bash
# Most recently modified first
confluence-search --cql "text ~ \"API\" ORDER BY lastModified DESC"

# Oldest first
confluence-search --cql "space = DEV ORDER BY created ASC"

# By title (alphabetical)
confluence-search --cql "label = documentation ORDER BY title ASC"
```

## Tips for Effective Searches

1. **Start with default text search**: Use `confluence-search "query"` for simple keyword searches
2. **Use `--cql` for filters**: Add `--cql` flag when you need space, label, date, or creator filters
3. **Combine space + text**: Most effective CQL pattern is `space = "KEY" AND text ~ "query"`
4. **Limit results**: Use `--limit` flag to control result count (works in both modes)
5. **Date functions over exact dates**: Use `now("-7d")` instead of hardcoded dates for maintainability

## Examples by Use Case

### Finding Documentation (Text Search)

```bash
# Recent API documentation
confluence-search "API documentation" --limit 20

# Onboarding guides
confluence-search "onboarding" --limit 10

# Release notes
confluence-search "release notes" --limit 15
```

### Team Collaboration (CQL Mode)

```bash
# My recent pages
confluence-search --cql "creator = currentUser()" --limit 50

# Team's recent updates
confluence-search --cql "space = TEAM AND lastModified >= now(\"-7d\")" --limit 30

# Meeting notes with specific label
confluence-search --cql "label = meeting-notes AND lastModified >= now(\"-30d\")" --limit 20
```

### Project Research (CQL Mode)

```bash
# Architecture decisions in specific space
confluence-search --cql "space = ARCH AND text ~ \"decision\"" --limit 20

# Design specifications with label
confluence-search --cql "label = design AND text ~ \"spec\"" --limit 25

# Recent technical documentation
confluence-search --cql "space = DOCS AND label = technical AND lastModified >= now(\"-90d\")" --limit 30
```

## Limitations

The `confluence-search` script uses the Confluence REST API's `/search` endpoint with CQL. Note:

- **Result cap**: API returns max 1000 results (use `--limit` to control)
- **Search scope**: Searches only content user has permission to view
- **Performance**: Complex queries with many conditions may be slower
- **Text search**: Uses Confluence's built-in text indexing (usually updated within minutes)

## Choosing Between Text Search and CQL Mode

**Use default text search when**:
- Searching for keywords or phrases
- You don't need filters (space, labels, dates, creators)
- Simpler, more readable commands
- Example: `confluence-search "API documentation"`

**Use `--cql` mode when**:
- Filtering by space, label, creator, or date
- Combining multiple conditions with AND/OR
- Using CQL functions like `currentUser()` or `now("-7d")`
- Sorting results with ORDER BY
- Example: `confluence-search --cql "space = DEV AND lastModified >= now(\"-7d\")"`

The `--cql` flag provides full access to Confluence Query Language without needing to construct manual API calls.

## See Also

- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/)
- [CQL Field Reference](https://developer.atlassian.com/cloud/confluence/cql-fields/)
- [CQL Functions Reference](https://developer.atlassian.com/cloud/confluence/cql-functions/)
