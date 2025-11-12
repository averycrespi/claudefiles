# JQL Query Patterns

This reference provides comprehensive JQL (Jira Query Language) patterns for constructing queries in ACLI commands.

## JQL Syntax Basics

**Important Notes:**
1. JQL queries must be **quoted** when containing spaces or special characters
2. Field names are **case-sensitive**
3. Operators: `=`, `!=`, `<`, `>`, `<=`, `>=`, `~` (contains), `!~` (not contains)
4. Logical operators: `AND`, `OR`, `NOT`
5. Keywords: `is`, `in`, `was`, `changed`

## User Filters

### Current User
```jql
# Issues assigned to current user
assignee = currentUser()

# Issues reported by current user
reporter = currentUser()

# Issues where current user is watcher
watcher = currentUser()
```

### Specific Users
```jql
# Assigned to specific user (by email)
assignee = "user@example.com"

# Assigned to specific user (by username)
assignee = jsmith

# Multiple users
assignee in ("user1@example.com", "user2@example.com")
```

### Unassigned
```jql
# Unassigned issues
assignee is EMPTY

# Unassigned issues in project
project = TEAM AND assignee is EMPTY
```

## Priority Filters

### Single Priority
```jql
# High priority issues
priority = High

# Critical issues
priority = Highest
```

### Multiple Priorities
```jql
# High or critical
priority in (High, Highest)

# Not low priority
priority != Low
```

### Priority Ranges
```jql
# Medium priority or higher
priority >= Medium

# Below high priority
priority < High
```

## Issue Type Filters

### Single Type
```jql
# Bugs only
type = Bug

# Stories only
type = Story

# Tasks only
type = Task
```

### Multiple Types
```jql
# Stories and tasks
type in (Story, Task)

# Everything except bugs
type != Bug
```

## Status Filters

### Single Status
```jql
# In progress work
status = "In Progress"

# To do items
status = "To Do"

# Done items
status = Done
```

### Multiple Statuses
```jql
# Active work (multiple statuses)
status in ("To Do", "In Progress", "In Review")

# Not done
status != Done
```

### Status Categories
```jql
# Not completed
statusCategory != Done

# In progress category
statusCategory = "In Progress"
```

## Time-Based Filters

### Creation Time
```jql
# Created in last 7 days
created >= -7d

# Created today
created >= startOfDay()

# Created this week
created >= startOfWeek()

# Created in specific range
created >= "2025-01-01" AND created <= "2025-01-31"
```

### Update Time
```jql
# Updated in last 24 hours
updated >= -1d

# Updated today
updated >= startOfDay()

# Updated this month
updated >= startOfMonth()
```

### Due Date
```jql
# Due today
due = startOfDay()

# Due this week
due <= endOfWeek()

# Overdue
due < now() AND status != Done

# No due date set
due is EMPTY
```

## Sprint Filters

### Active Sprints
```jql
# Issues in any active sprint
sprint in openSprints()

# Issues in active sprint for project
project = TEAM AND sprint in openSprints()
```

### Specific Sprint
```jql
# Issues in named sprint
sprint = "Sprint 23"

# Issues in sprint by ID
sprint = 123
```

### Sprint Status
```jql
# Issues in closed sprints
sprint in closedSprints()

# Issues in future sprints
sprint in futureSprints()
```

### Backlog
```jql
# Issues not in any sprint (backlog)
sprint is EMPTY

# Project backlog
project = TEAM AND sprint is EMPTY

# Unassigned backlog items
project = TEAM AND sprint is EMPTY AND assignee is EMPTY
```

## Project Filters

### Single Project
```jql
# All issues in project
project = TEAM

# Project by ID
project = 10001
```

### Multiple Projects
```jql
# Issues in multiple projects
project in (TEAM, PROJ, DEV)

# Not in specific project
project != TEAM
```

## Component Filters

```jql
# Issues in specific component
component = "Backend"

# Issues in multiple components
component in ("Frontend", "Backend")

# Issues without components
component is EMPTY
```

## Label Filters

```jql
# Issues with specific label
labels = "urgent"

# Issues with any of multiple labels
labels in ("urgent", "critical")

# Issues without labels
labels is EMPTY
```

## Text Search

### Search All Text
```jql
# Search in summary and description
text ~ "authentication"

# Search for exact phrase
text ~ "user login flow"
```

### Search Specific Fields
```jql
# Summary contains word
summary ~ "login"

# Description contains phrase
description ~ "user account"

# Comment contains text
comment ~ "discussed in standup"
```

## Complex Combinations

### My Active Work
```jql
# My issues that are in progress
assignee = currentUser() AND status = "In Progress"

# My high priority work not done
assignee = currentUser() AND priority in (High, Highest) AND status != Done
```

### Current Sprint
```jql
# Current sprint items not done
project = TEAM AND sprint in openSprints() AND status != Done

# My current sprint work
assignee = currentUser() AND sprint in openSprints()

# Current sprint bugs
sprint in openSprints() AND type = Bug
```

### High Priority Tracking
```jql
# High priority bugs not done
priority = High AND type = Bug AND status != Done

# Critical issues assigned to team
priority = Highest AND project = TEAM AND status != Done
```

### Recently Updated
```jql
# Recently updated unassigned issues
updated >= -3d AND assignee is EMPTY AND status = "To Do"

# My recently updated work
assignee = currentUser() AND updated >= -7d

# Recent changes to high priority items
priority in (High, Highest) AND updated >= -1d
```

### Overdue and At Risk
```jql
# Overdue issues
due < now() AND status != Done

# Due soon (within 3 days)
due >= now() AND due <= 3d AND status != Done

# Overdue high priority
due < now() AND priority in (High, Highest) AND status != Done
```

### Team Queries
```jql
# Team's active sprint work
project = TEAM AND sprint in openSprints() AND status != Done

# Unassigned team work
project = TEAM AND assignee is EMPTY AND status != Done

# Team bugs in progress
project = TEAM AND type = Bug AND status = "In Progress"
```

## Natural Language to JQL Mapping

### Common User Requests
- "My tickets" → `assignee = currentUser()`
- "My open tickets" → `assignee = currentUser() AND status != Done`
- "High priority bugs" → `priority = High AND type = Bug`
- "Current sprint" → `sprint in openSprints()`
- "Current sprint for TEAM" → `project = TEAM AND sprint in openSprints()`
- "Unassigned issues" → `assignee is EMPTY`
- "Overdue tasks" → `due < now() AND status != Done`
- "Created today" → `created >= startOfDay()`
- "Updated this week" → `updated >= startOfWeek()`
- "Backlog items" → `sprint is EMPTY`
- "My team's work" → `project = TEAM`
- "Blocked issues" → `status = Blocked`

## Advanced Patterns

### Changed Filters
```jql
# Status changed to In Progress today
status changed to "In Progress" after startOfDay()

# Priority increased in last week
priority changed from Low to High after -7d

# Assignee changed recently
assignee changed after -3d
```

### Was Filters
```jql
# Was unassigned
assignee was EMPTY

# Was in specific status
status was "To Do"
```

### Order By
```jql
# Order by priority descending, then created ascending
ORDER BY priority DESC, created ASC

# Order by updated time (most recent first)
ORDER BY updated DESC
```

## Performance Tips

1. **Be specific**: Add project filter to narrow scope
   ```jql
   # Better
   project = TEAM AND assignee = currentUser()

   # Slower
   assignee = currentUser()
   ```

2. **Use indexes**: Prefer indexed fields (status, priority, assignee, project)

3. **Limit text searches**: Text searches are expensive
   ```jql
   # Better (if you know the project)
   project = TEAM AND text ~ "authentication"

   # Slower
   text ~ "authentication"
   ```

4. **Combine with limits**: Always use `--limit` in ACLI for large result sets
   ```bash
   acli jira workitem search --jql "..." --limit 20 --json
   ```

## JQL Query Construction Guidelines

### For Natural Language Requests

1. **Identify key elements**:
   - Who: assignee, reporter, watcher
   - What: issue type, priority, status
   - When: created, updated, due dates
   - Where: project, sprint, component

2. **Combine with AND**:
   ```jql
   assignee = currentUser() AND priority = High AND status != Done
   ```

3. **Add context**:
   - Include project when known
   - Add status filters to exclude completed work
   - Use time filters for recency

4. **Handle missing context**:
   - Prompt user for project if needed
   - Use `sprint in openSprints()` for "current sprint" without board context
   - Use `currentUser()` for "my" queries

## Escaping and Quoting

### When to Quote
```jql
# Quote values with spaces
status = "In Progress"

# Quote dates
created >= "2025-01-01"

# Quote user emails
assignee = "user@example.com"
```

### Special Characters
```jql
# Escape quotes with backslash
summary ~ "\"quoted text\""

# Use single quotes for values containing double quotes
summary ~ '"quoted text"'
```

## Testing JQL Queries

Before using in scripts, test JQL queries:
```bash
# Test with count to verify syntax
acli jira workitem search --jql "YOUR_QUERY" --count

# Test with small limit to preview results
acli jira workitem search --jql "YOUR_QUERY" --limit 5 --json
```
