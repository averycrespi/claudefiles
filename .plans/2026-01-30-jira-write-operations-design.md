# Jira Write Operations Design

## Overview

Extend the existing Jira skill to support write operations: creating tickets, editing tickets, assigning tickets, transitioning status, and adding comments.

## Requirements

- **Operations**: Create, edit, assign, transition, comment
- **Confirmations**: Always confirm before any write operation (via Claude Code's default permission system)
- **Create flow**: Support both conversation-context-based and explicit specification
- **Project context**: Remember project key within session, reuse for subsequent creates

## Supported Operations

| Operation | Command | Use Case |
|-----------|---------|----------|
| **Create** | `acli jira workitem create` | Create new tickets from conversation or explicit spec |
| **Edit** | `acli jira workitem edit` | Modify summary, description, labels, type |
| **Assign** | `acli jira workitem edit --assignee` | Assign/reassign tickets |
| **Transition** | `acli jira workitem transition` | Change status (To Do → In Progress → Done) |
| **Comment** | `acli jira workitem comment create` | Add comments to existing tickets |

## Permission Model

No changes to `settings.json`. Write commands will use Claude Code's default permission behavior - when Claude attempts a write operation, the user receives a standard permission prompt to allow or deny.

This follows the principle of least privilege.

## Reference Structure

Reorganize references by entity (unified read/write per entity):

```
references/
├── issues.md         # view, search, create, edit, transition, assign
├── comments.md       # list, create (extracted from workitems.md)
├── boards-sprints.md # unchanged
├── projects.md       # unchanged
├── jql.md            # unchanged
├── auth.md           # unchanged
├── error-handling.md # add write-specific errors
└── optimization.md   # unchanged
```

Changes:
- **Rename** `workitems.md` → `issues.md`, add create/edit/transition/assign operations
- **Create** `comments.md` with list + create operations
- **Update** `error-handling.md` with write-specific errors

## Session Context for Project Keys

When creating tickets, Claude will:
1. Check if a project key was used earlier in the conversation
2. If yes, propose using that project (user can override)
3. If no, ask which project to use
4. Remember the choice for subsequent creates

This is conversational memory within the session - no persistent storage needed.

## Confirmation Preview Patterns

Before executing write operations, Claude shows a preview of what will happen:

**Create ticket:**
```
Creating ticket in PROJ:
  Type: Bug
  Summary: Fix login timeout on slow connections
  Description: Users report timeouts when... (truncated)
  Assignee: @me

[Claude Code will prompt for permission to run the command]
```

**Edit ticket:**
```
Editing PROJ-123:
  Summary: "Old title" → "New title"
  Assignee: unassigned → john@example.com

[Claude Code will prompt for permission]
```

**Transition:**
```
Transitioning PROJ-123:
  Status: "To Do" → "In Progress"

[Claude Code will prompt for permission]
```

**Add comment:**
```
Adding comment to PROJ-123:
  "Started investigating - looks like a race condition..."

[Claude Code will prompt for permission]
```

## Error Handling for Write Operations

| Error | Cause | Recovery |
|-------|-------|----------|
| **403 Forbidden** | No permission to create/edit in project | Check project permissions with admin |
| **400 Invalid transition** | Status transition not allowed by workflow | Show available transitions, let user pick valid one |
| **400 Required field missing** | Project requires fields not provided | Fetch project's required fields, prompt for them |
| **400 Invalid assignee** | User not assignable in project | Search for valid assignees in project |
| **404 Issue not found** | Ticket doesn't exist (for edit/transition) | Verify ticket key, search for similar |

## SKILL.md Updates

Update the main skill file to:
1. Remove "read-only" language from description and purpose
2. Add "Write Operations" section documenting create/edit/assign/transition/comment
3. Add confirmation preview patterns
4. Update loading strategy for new reference files
5. Update security section to reflect write capabilities with user approval

## README.md Updates

Update to mention write capabilities alongside read operations.
