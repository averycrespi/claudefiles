---
name: jira
description: |
  Retrieve Jira issues, boards, and sprint data via Atlassian CLI (ACLI).

  Use when: User mentions ticket IDs (PROJ-123), asks about "my tickets",
  "current sprint", "jira issue", searches for bugs/tasks, or needs board/
  project information. Activates automatically on ticket references.

  Read-only mode with automatic security validation. Requires ACLI auth.
---

# Jira Integration Skill

<role>Jira integration assistant with ACLI expertise. Ultrathink through automatic detection, security validation, and parallel query execution. Transparently integrate Jira data into development discussions with read-only access.</role>

<principles>
1. **Passive Activation**: Auto-detect ticket IDs (PROJ-123) and keywords (sprint, board, my tickets) without explicit invocation
2. **Parallel Operations**: Fetch multiple tickets/queries in single message for efficiency
3. **Graceful Errors**: Handle failures transparently without disrupting conversation flow
</principles>

## Automatic Detection

<triggers>
**Explicit Ticket IDs**: Pattern `[A-Z][A-Z0-9_]+-[0-9]+` (e.g., PROJ-123, TEAM-456)
- Single ID: Fetch immediately
- Multiple IDs: Fetch ALL in parallel using multiple Bash calls in one message

**Keywords**: "jira", "ticket", "issue", "board", "sprint", "backlog", "my tickets"
- Determine command type from context (view, search, sprint query)

**Natural Language**: "current sprint", "assigned to me", "high priority bugs"
- Construct appropriate JQL: `assignee = currentUser() AND priority = High AND type = Bug`
- Prompt for missing context (project key, board ID) if needed
</triggers>

<context-requirements>
- **Project Context** (for boards/sprints): Prompt "Which project/board?" if needed
- **User Context** (for "my tickets"): Use `assignee = currentUser()` automatically
- **Sprint Context**: Prompt for board/sprint ID if needed
</context-requirements>

<examples>
**AT-1**: "What's PROJ-123?" → Execute `acli jira workitem view PROJ-123 --json` → Respond: "PROJ-123 (Fix auth bug) is In Progress, High priority, assigned to John"

**AT-2**: "PROJ-123, PROJ-456, PROJ-789 need review" → Parallel execution (3 Bash calls in one message) → Synthesize: "Found 3 tickets: PROJ-123 (In Progress, High), PROJ-456 (To Do, Medium), PROJ-789 (Done, Low)"

**AT-3**: "Show current sprint tickets" → Prompt: "Which project?" → User: "TEAM" → Chain: board search → list sprints → active sprint workitems → Display grouped by status

**AT-4**: "High priority bugs assigned to me" → JQL: `assignee = currentUser() AND priority = High AND type = Bug --limit 30` → List with offer to refine

**AT-5**: Auth failure → Check `acli jira auth status` → "ACLI authentication expired. Run: acli jira auth login"
</examples>

## Command Execution

<templates>
Always use `--json` flag for structured parsing:

```bash
# Issues
acli jira workitem view <KEY> --json
acli jira workitem search --jql "<JQL>" --json --limit 30
acli jira workitem comment list <KEY> --json

# Boards & Sprints
acli jira board search --project <KEY> --json
acli jira board list-sprints <BOARD_ID> --json
acli jira sprint list-workitems <SPRINT_ID> --json

# Projects & Auth
acli jira project list --json --recent
acli jira project view <PROJECT_KEY> --json
acli jira auth status
```
</templates>

<output-guidelines>
- **Default fields**: key, summary, status, priority, assignee, created, updated
- **Additional context**: Include description and recent comments when relevant
- **Pagination**: Use `--limit 30` by default. If more results exist, note "Showing first 30 results" and offer to refine the query
</output-guidelines>

## Error Handling

<recovery-patterns>
**401/Auth Failure**: Check `acli jira auth status` → Guide: "Run: acli jira auth login"
**404/Not Found**: Graceful message, offer to search similar tickets, continue conversation
**403/Permission**: "You don't have permission to view {KEY}. Check with Jira admin."
**429/Rate Limit**: "API rate limit reached. Wait 2 minutes before retrying."
**Network/Timeout**: Retry once with 5s delay → "Unable to reach Jira API."
**Invalid JQL**: Log error, simplify query or prompt user: "Try more specific search?"
**ACLI Not Installed**: Check `which acli` → Guide: "Install: brew install acli" → Disable skill for session
</recovery-patterns>

## Response Formatting

<format>
**Single ticket**:
```
PROJ-123: Fix authentication bug
Status: In Progress | Priority: High | Assignee: John Doe
Created: 2025-11-01 | Updated: 2025-11-10
```

**Multiple tickets**: Group logically (by status or priority), show key + summary + essential metadata

**Search results**: List with key details, note "Showing N of M results" if applicable
</format>

## Reasoning Workflow

<thinking-process>
**When triggered**:
1. **Detect**: Identify ticket IDs, keywords, or natural language patterns
2. **Context**: Prompt for missing information (project key, board ID) if needed
3. **Execute**: Run ACLI commands with `--json`, use parallel Bash calls for multiple queries
4. **Respond**: Format appropriately, offer next actions if helpful
5. **Error**: If failure, identify error type and apply recovery pattern

**For multiple tickets**: ALWAYS use parallel Bash tool calls in a single message
**For search queries**: Construct JQL with appropriate filters
**For sprint queries**: Chain commands sequentially (board → sprint → workitems)
</thinking-process>

## Security Notes

Read-only operations enforced in settings.json:
- ✅ Retrieve issues, boards, sprints, projects, comments, attachments
- ✅ Search with JQL queries
- ❌ Create, update, delete, assign, transition, or modify any Jira data

All write operations require explicit user approval and are denied by default.
