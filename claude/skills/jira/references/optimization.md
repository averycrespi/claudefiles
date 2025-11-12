# Performance and Context Optimization

This reference documents strategies for minimizing token consumption and optimizing performance when using ACLI.

## Field Selection Strategies

To minimize token consumption, use selective field specifications based on query intent.

### Recommended Field Sets

#### 1. Quick View (Default for ticket lookups)
```bash
--fields key,summary,status,priority,assignee
```

**Use for:**
- Quick ticket references
- Status checks
- "What's PROJ-123?"
- Default single-ticket views

**Token cost:** Low (~100-200 tokens per ticket)

#### 2. Detailed View (When user needs more context)
```bash
--fields key,summary,status,priority,assignee,created,updated,description
```

**Use for:**
- "Show me details of PROJ-123"
- "What's the description of PROJ-123?"
- User explicitly asks for details

**Token cost:** Medium (~300-1000+ tokens per ticket, depending on description length)

#### 3. Search Results (List-based queries)
```bash
--fields key,summary,status,assignee --limit 20
```

**Use for:**
- JQL searches
- Sprint listings
- "Show my tickets"
- List views

**Token cost:** Low (~80-150 tokens per ticket × number of results)

#### 4. Count Only (When quantity is sufficient)
```bash
--count
```

**Use for:**
- "How many tickets..."
- "Count of issues..."
- Statistics queries

**Token cost:** Minimal (~10 tokens)

### Field Cost Analysis

#### Expensive Fields (High token cost)
- `description` - Can be very large text blocks (100-5000+ tokens)
- `comment` - Array of all comments with full text (100-10000+ tokens)
- `attachment` - Array of attachment metadata (50-500+ tokens)
- `*all` or `*navigable` - Returns all available fields (500-10000+ tokens)

#### Efficient Fields (Low token cost)
- `key` - Just the ticket ID (5 tokens)
- `summary` - One-line description (10-50 tokens)
- `status` - Status object (name, id) (10-20 tokens)
- `priority` - Priority object (name, id) (10-20 tokens)
- `assignee` - User object (displayName, emailAddress) (15-30 tokens)
- `created`, `updated` - Timestamps (10-15 tokens each)
- `issuetype` - Issue type object (10-20 tokens)

### Best Practices

#### 1. Start Minimal
Use quick view fields by default, fetch additional details only when needed.

```bash
# Default approach
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json

# Only if user asks for details
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json
```

#### 2. Avoid Wildcards
Never use `*all` or `*navigable` unless absolutely necessary.

```bash
# Bad - fetches everything
acli jira workitem view PROJ-123 --fields "*all" --json

# Good - selective fields
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json
```

#### 3. Exclude Expensive Fields
Use `-field` syntax to explicitly exclude expensive fields.

```bash
# Fetch navigable fields but exclude expensive ones
acli jira workitem view PROJ-123 --fields "*navigable,-description,-comment,-attachment" --json
```

#### 4. Limit Results
Always add `--limit` to searches (default: 20, adjust as needed).

```bash
# Good - limited results
acli jira workitem search --jql "sprint in openSprints()" --fields key,summary,status,assignee --limit 20 --json

# Bad - potentially unlimited results
acli jira workitem search --jql "sprint in openSprints()" --json
```

#### 5. Use Count
When user only needs quantity, use `--count` instead of fetching all data.

```bash
# Good - just count
acli jira workitem search --jql "assignee = currentUser() AND status != Done" --count

# Bad - fetch all data just to count
acli jira workitem search --jql "assignee = currentUser() AND status != Done" --json | jq '. | length'
```

#### 6. Selective Comments
Use `--limit 5 --order "-created"` to show only recent comments.

```bash
# Good - recent comments only
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json

# Bad - all comments (can be thousands)
acli jira workitem comment list --key PROJ-123 --paginate --json
```

#### 7. Two-Stage Fetching
For large searches, first show keys/summaries, then fetch details for specific items user wants.

```bash
# Stage 1: Show list with minimal fields
acli jira workitem search --jql "sprint in openSprints()" --fields key,summary,status --limit 20 --json

# Stage 2: User asks about specific ticket
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json
```

## Result Limiting

### Default Limits by Query Type

#### Work Item Search
```bash
# Default limit: 20
acli jira workitem search --jql "..." --limit 20 --json

# Adjust based on user needs
# "Show me 50 tickets" → --limit 50
# "Show all tickets" → --paginate (use sparingly)
```

#### Comments
```bash
# Default limit: 5 recent comments
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json

# All comments (use very sparingly)
acli jira workitem comment list --key PROJ-123 --paginate --json
```

#### Projects
```bash
# Default: Recent projects
acli jira project list --recent --json

# All projects (when needed)
acli jira project list --paginate --json
```

#### Boards and Sprints
```bash
# Default board limit: 50 (ACLI default)
acli jira board search --project TEAM --json

# Sprint items: Use reasonable limit
acli jira sprint list-workitems --board 6 --sprint 1 --limit 50 --json
```

### Informing About Truncation

When results are limited, inform the user:

```
Showing 20 of 150 results. Use more specific filters or ask to see more.
```

```
Showing 5 most recent comments. Ask if you need to see more.
```

## Performance Considerations

### Query Scoping

Always scope queries to reduce search space:

```jql
# Better - scoped to project
project = TEAM AND assignee = currentUser()

# Slower - searches all projects
assignee = currentUser()
```

### Text Search Optimization

Text searches are expensive - use sparingly and scope when possible:

```jql
# Better - scoped text search
project = TEAM AND text ~ "authentication"

# Slower - global text search
text ~ "authentication"
```

### Pagination Strategy

Avoid `--paginate` unless truly needed:

```bash
# Good - limited pages
acli jira workitem search --jql "..." --limit 100 --json

# Use sparingly - all results
acli jira workitem search --jql "..." --paginate --json
```

### Parallel Fetching

For multiple independent queries, use parallel Bash tool calls:

```bash
# Fetch multiple tickets in parallel (single message, multiple tool calls)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json
acli jira workitem view PROJ-456 --fields key,summary,status,priority,assignee --json
acli jira workitem view PROJ-789 --fields key,summary,status,priority,assignee --json
```

## Context Budget Management

### Token Allocation Strategy

Allocate token budget based on query complexity:

#### Simple Queries (Single ticket lookup)
- Budget: 100-300 tokens
- Strategy: Use quick view fields

#### Medium Queries (Search with 10-20 results)
- Budget: 1000-3000 tokens
- Strategy: Minimal fields per result, reasonable limit

#### Complex Queries (Multi-stage workflows)
- Budget: 3000-5000 tokens
- Strategy: Count first, then selective detailed fetching

#### Detailed Analysis (User needs full context)
- Budget: 5000-10000+ tokens
- Strategy: Fetch full details including description, comments

### Progressive Disclosure

Load information progressively based on user needs:

1. **Initial query**: Minimal fields, limited results
2. **User wants more**: Add fields or increase limit
3. **User wants details**: Fetch full details for specific items
4. **User wants comments**: Load comments separately

## Examples

### Optimized Ticket Lookup
```bash
# Minimal (default)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee --json
# Token cost: ~150 tokens

# Detailed (when asked)
acli jira workitem view PROJ-123 --fields key,summary,status,priority,assignee,created,updated,description --json
# Token cost: ~500-2000 tokens (depending on description)
```

### Optimized Search
```bash
# Efficient search
acli jira workitem search --jql "sprint in openSprints()" --fields key,summary,status,assignee --limit 20 --json
# Token cost: ~2000-3000 tokens (20 results × ~150 tokens each)

# Count only
acli jira workitem search --jql "assignee = currentUser() AND status != Done" --count
# Token cost: ~10 tokens
```

### Optimized Comments
```bash
# Recent comments only
acli jira workitem comment list --key PROJ-123 --limit 5 --order "-created" --json
# Token cost: ~500-2000 tokens (5 comments × 100-400 tokens each)

# Avoid: All comments
acli jira workitem comment list --key PROJ-123 --paginate --json
# Token cost: Potentially 5000-50000+ tokens
```

### Optimized Sprint Query
```bash
# Efficient sprint items
acli jira sprint list-workitems --board 6 --sprint 1 --fields key,summary,status,assignee --limit 50 --json
# Token cost: ~4000-7500 tokens

# Alternative: Use JQL (more efficient if you don't need board-specific info)
acli jira workitem search --jql "sprint in openSprints() AND project = TEAM" --fields key,summary,status,assignee --limit 20 --json
# Token cost: ~2000-3000 tokens
```

## Monitoring and Adjustment

### When to Increase Limits
- User says "show me more"
- Results seem incomplete for query
- User asks "how many total?"

### When to Add Fields
- User asks for "details"
- User asks about specific field (description, comments, etc.)
- Initial response lacks context user needs

### When to Use Pagination
- User explicitly asks for "all"
- Count shows manageable total (< 500 items)
- Comprehensive analysis needed

## Summary

**Default approach:**
1. Start with minimal fields
2. Use reasonable limits (20 for searches, 5 for comments)
3. Fetch additional data only when user needs it
4. Use `--count` when quantity is sufficient
5. Inform user about truncation
6. Scope queries with project/sprint filters when possible

**Token savings:**
- Quick view vs detailed view: 50-80% savings
- Limited search vs paginated: 60-90% savings
- Count vs full fetch: 95-99% savings
- Recent comments vs all comments: 70-95% savings
