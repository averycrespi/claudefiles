# Jira Write Operations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Extend the Jira skill to support creating, editing, assigning, transitioning, and commenting on tickets.

**Architecture:** Add write operation documentation to the existing skill, reorganize references by entity (issues.md, comments.md), and update the main SKILL.md with write operation patterns and confirmation previews.

**Tech Stack:** Markdown documentation, ACLI commands

---

### Task 1: Rename workitems.md to issues.md and Add Write Operations

**Files:**
- Delete: `claude/skills/jira/references/workitems.md`
- Create: `claude/skills/jira/references/issues.md`

**Step 1: Create issues.md with read operations from workitems.md plus new write operations**

```markdown
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
```

**Step 2: Verify the new file is valid markdown**

Run: `head -50 claude/skills/jira/references/issues.md`
Expected: First 50 lines of the new issues.md file displayed correctly

**Step 3: Delete the old workitems.md file**

Run: `rm claude/skills/jira/references/workitems.md`
Expected: File deleted successfully

**Step 4: Commit**

```bash
git add claude/skills/jira/references/issues.md
git rm claude/skills/jira/references/workitems.md
git commit -m "refactor(jira): rename workitems.md to issues.md, add write operations"
```

---

### Task 2: Create comments.md Reference

**Files:**
- Create: `claude/skills/jira/references/comments.md`

**Step 1: Create comments.md with list and create operations**

```markdown
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
```

**Step 2: Verify the new file is valid markdown**

Run: `head -30 claude/skills/jira/references/comments.md`
Expected: First 30 lines displayed correctly

**Step 3: Commit**

```bash
git add claude/skills/jira/references/comments.md
git commit -m "feat(jira): add comments.md reference for list and create"
```

---

### Task 3: Update error-handling.md with Write-Specific Errors

**Files:**
- Modify: `claude/skills/jira/references/error-handling.md:37-46` (expand 403 section)
- Modify: `claude/skills/jira/references/error-handling.md:68-78` (add after Query Errors section)

**Step 1: Add write-specific error patterns after the existing 403 section**

Add after line 46 (after the existing 403 Forbidden section), a new section for write operation errors:

```markdown
## Write Operation Errors

### 400 Bad Request - Invalid Transition

**Symptom**: Status transition not allowed by workflow

**Recovery Pattern**:
1. The error message shows available transitions
2. Present valid status options to user
3. Let user pick a valid transition

**Example Response**:
```
Cannot transition PROJ-123 to "Done" directly. Available transitions from "To Do":
- In Progress
- Blocked

Which status would you like?
```

### 400 Bad Request - Required Field Missing

**Symptom**: Project requires fields not provided during create/edit

**Recovery Pattern**:
1. Parse error to identify missing field(s)
2. Prompt user for required values
3. Retry with complete data

**Example Response**:
```
PROJ requires the "Component" field. Which component should this be assigned to?
```

### 400 Bad Request - Invalid Assignee

**Symptom**: Specified user cannot be assigned to issue

**Recovery Pattern**:
1. Inform user the assignee is invalid
2. Suggest using `@me` for self-assignment
3. Or search for valid users in project

**Example Response**:
```
User "invalid@example.com" cannot be assigned to issues in PROJ.
Would you like to assign to yourself (@me) or specify a different user?
```

### 400 Bad Request - Invalid Issue Type

**Symptom**: Issue type doesn't exist in project

**Recovery Pattern**:
1. Query available issue types for project
2. Present options to user

**Example Response**:
```
Issue type "Feature" not available in PROJ. Available types:
- Bug
- Story
- Task
- Epic

Which type should this be?
```
```

**Step 2: Verify the changes**

Run: `grep -A 5 "Write Operation Errors" claude/skills/jira/references/error-handling.md`
Expected: Shows the new "Write Operation Errors" section header and first few lines

**Step 3: Commit**

```bash
git add claude/skills/jira/references/error-handling.md
git commit -m "feat(jira): add write operation error patterns"
```

---

### Task 4: Update SKILL.md - Frontmatter and Purpose

**Files:**
- Modify: `claude/skills/jira/SKILL.md:1-14`

**Step 1: Update frontmatter description to remove "read-only" language**

Replace lines 1-8:

```markdown
---
name: jira
description: |
  This skill should be used when the user asks about Jira work items, sprints, boards,
  or projects. Activates when detecting: ticket IDs (PROJ-123), questions about "current
  sprint", "my tickets", "Jira issues", board information, project status, or requests to
  create, update, or comment on tickets. Provides access to Jira Cloud via Atlassian CLI.
---
```

**Step 2: Update Purpose section**

Replace lines 10-14:

```markdown
# Jira Integration Skill

## Purpose

Integrate Jira into development discussions by automatically detecting and retrieving issue information, and enabling ticket creation, updates, and comments using the Atlassian CLI (ACLI). Read operations are automatic; write operations require user approval.
```

**Step 3: Verify changes**

Run: `head -15 claude/skills/jira/SKILL.md`
Expected: Updated frontmatter and purpose without "read-only" language

**Step 4: Commit**

```bash
git add claude/skills/jira/SKILL.md
git commit -m "docs(jira): update skill description to include write operations"
```

---

### Task 5: Update SKILL.md - Command Reference Section

**Files:**
- Modify: `claude/skills/jira/SKILL.md:33-50`

**Step 1: Update the Command Reference section to reflect new file structure**

Replace lines 33-50:

```markdown
### Command Reference

The skill provides domain-specific reference files for detailed command documentation:

- **[`references/auth.md`](references/auth.md)** - Authentication commands and troubleshooting
- **[`references/issues.md`](references/issues.md)** - Issue operations (view, search, create, edit, transition)
- **[`references/comments.md`](references/comments.md)** - Comment operations (list, create)
- **[`references/projects.md`](references/projects.md)** - Project commands and key conventions
- **[`references/boards-sprints.md`](references/boards-sprints.md)** - Board and sprint operations
- **[`references/jql.md`](references/jql.md)** - Comprehensive JQL query patterns
- **[`references/optimization.md`](references/optimization.md)** - Performance and context optimization strategies

**Loading strategy:**
- Load references selectively based on query type to minimize token usage
- For reading tickets: Load `issues.md` and `jql.md`
- For creating/editing tickets: Load `issues.md`
- For comments: Load `comments.md`
- For sprint queries: Load `boards-sprints.md` and `jql.md`
- For authentication issues: Load `auth.md`
- Load multiple references in parallel when query spans domains
```

**Step 2: Verify changes**

Run: `sed -n '33,52p' claude/skills/jira/SKILL.md`
Expected: Updated command reference with issues.md and comments.md

**Step 3: Commit**

```bash
git add claude/skills/jira/SKILL.md
git commit -m "docs(jira): update command reference for reorganized files"
```

---

### Task 6: Update SKILL.md - Add Write Operations Section

**Files:**
- Modify: `claude/skills/jira/SKILL.md` (add new section after line 114, before Security section)

**Step 1: Add Write Operations section before the Security section**

Insert before the "## Security" section (around line 116):

```markdown
## Write Operations

Write operations modify Jira data and require user approval via Claude Code's permission system.

### Creating Tickets

When user asks to create a ticket (or context suggests one should be created):

1. **Gather required information:**
   - Project key (remember from session if previously used, otherwise ask)
   - Issue type (Bug, Story, Task, etc.)
   - Summary (can be derived from conversation context)
   - Optional: description, assignee, labels

2. **Show confirmation preview:**
   ```
   Creating ticket in PROJ:
     Type: Bug
     Summary: Fix timeout on slow connections
     Description: Users report timeouts when... (truncated)
     Assignee: @me
   ```

3. **Execute with user approval:**
   ```bash
   acli jira workitem create --project PROJ --type Bug --summary "Fix timeout on slow connections" --description "..." --assignee @me --json
   ```

### Editing Tickets

When user asks to update a ticket:

1. **Show what will change:**
   ```
   Editing PROJ-123:
     Summary: "Old title" → "New title"
     Assignee: unassigned → john@example.com
   ```

2. **Execute with user approval:**
   ```bash
   acli jira workitem edit --key PROJ-123 --summary "New title" --assignee john@example.com --json
   ```

### Transitioning Status

When user asks to change ticket status:

1. **Show the transition:**
   ```
   Transitioning PROJ-123:
     Status: "To Do" → "In Progress"
   ```

2. **Execute with user approval:**
   ```bash
   acli jira workitem transition --key PROJ-123 --status "In Progress" --json
   ```

3. **Handle invalid transitions:** If transition fails, show available statuses and let user pick.

### Adding Comments

When user asks to comment on a ticket:

1. **Show the comment:**
   ```
   Adding comment to PROJ-123:
     "Started investigating - looks like a race condition..."
   ```

2. **Execute with user approval:**
   ```bash
   acli jira workitem comment create --key PROJ-123 --body "Started investigating..." --json
   ```

### Session Project Context

To reduce friction when creating multiple tickets:

1. Remember project key when user creates or views tickets
2. Propose reusing that project for subsequent creates
3. User can always override with explicit project specification
4. Context resets each session (no persistent storage)

See [`references/issues.md`](references/issues.md) and [`references/comments.md`](references/comments.md) for detailed command documentation.

```

**Step 2: Verify the section was added**

Run: `grep -n "## Write Operations" claude/skills/jira/SKILL.md`
Expected: Shows line number where Write Operations section exists

**Step 3: Commit**

```bash
git add claude/skills/jira/SKILL.md
git commit -m "feat(jira): add write operations section to SKILL.md"
```

---

### Task 7: Update SKILL.md - Security Section

**Files:**
- Modify: `claude/skills/jira/SKILL.md` (Security section, last ~7 lines)

**Step 1: Update Security section to reflect write capabilities**

Replace the Security section:

```markdown
## Security

Operations are controlled by Claude Code's permission system:

- **Read operations** (view, search, list): Allowed automatically via settings.json
- **Write operations** (create, edit, transition, comment): Require user approval for each command

This ensures users maintain control over any modifications to Jira data. Each write command is shown to the user before execution, and they must explicitly approve it.
```

**Step 2: Verify the changes**

Run: `tail -10 claude/skills/jira/SKILL.md`
Expected: Updated security section mentioning user approval for write operations

**Step 3: Commit**

```bash
git add claude/skills/jira/SKILL.md
git commit -m "docs(jira): update security section for write operations"
```

---

### Task 8: Update README.md

**Files:**
- Modify: `claude/skills/jira/README.md`

**Step 1: Update README to mention write capabilities**

Replace entire file:

```markdown
# Jira Integration Skill

Integrate Jira into Claude Code conversations with automatic ticket detection, retrieval, and the ability to create, update, and comment on issues.

## What It Does

**Reading:** Automatically detects and fetches Jira issue information when you mention ticket IDs (e.g., "PROJ-123") or ask about sprints, boards, and projects.

**Writing:** Create tickets, update fields, change status, and add comments - all with confirmation before execution.

## Setup

1. Install and authenticate ACLI:
   ```bash
   brew install acli
   acli jira auth login
   ```

2. The skill activates automatically when you mention Jira keywords or ticket IDs

## Usage Examples

**Reading:**
- "What's PROJ-123 about?"
- "Show me my current tickets"
- "What's in the current sprint?"

**Writing:**
- "Create a bug ticket for the login timeout issue"
- "Mark PROJ-123 as in progress"
- "Assign PROJ-456 to me"
- "Add a comment to PROJ-789 that I'm investigating"

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including command reference, JQL patterns, and write operation patterns.
```

**Step 2: Verify the changes**

Run: `cat claude/skills/jira/README.md`
Expected: Updated README with write capabilities mentioned

**Step 3: Commit**

```bash
git add claude/skills/jira/README.md
git commit -m "docs(jira): update README with write capabilities"
```

---

### Task 9: Update Project CLAUDE.md

**Files:**
- Modify: `claude/skills/jira/../../CLAUDE.md` (the project CLAUDE.md table)

**Step 1: Update the Jira skill description in the Integration Skills table**

In `/Users/averycrespi/claudefiles/CLAUDE.md`, find the Integration Skills table and update the Jira row:

Change:
```markdown
| `jira`       | Read-only access to Jira issues, boards, and sprints |
```

To:
```markdown
| `jira`       | Access Jira issues, boards, sprints; create and update tickets |
```

**Step 2: Verify the change**

Run: `grep -A 1 "Integration Skills" CLAUDE.md`
Expected: Shows the Integration Skills header and updated jira description

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Jira skill description in CLAUDE.md"
```

---

### Task 10: Final Verification

**Files:**
- Verify: All modified files

**Step 1: Verify all reference files exist**

Run: `ls -la claude/skills/jira/references/`
Expected: Shows issues.md, comments.md, and NO workitems.md

**Step 2: Verify SKILL.md has all sections**

Run: `grep "^## " claude/skills/jira/SKILL.md`
Expected: Shows Purpose, When to Use, How to Use, Write Operations, Security (in that order)

**Step 3: Verify no broken links in SKILL.md**

Run: `grep "workitems.md" claude/skills/jira/SKILL.md`
Expected: No output (no references to old filename)

**Step 4: Run stow to apply changes**

Run: `./setup.sh`
Expected: Stow completes successfully, changes are symlinked to ~/.claude

**Step 5: Final commit if any files were missed**

```bash
git status
# If any unstaged changes, add and commit them
```
