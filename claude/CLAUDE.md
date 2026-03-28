# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Conventional Commits

Always use conventional commits when writing commit messages:

**Format:**
```
<type>: <description>

[optional body]
```

**Common Types:**
- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance tasks, dependencies
- `docs` - Documentation changes
- `refactor` - Code restructuring without behavior change
- `test` - Adding/updating tests

**Optional Scope:**
```
feat(auth): add OAuth2 support
fix(api): handle timeout errors
```

**Breaking Changes:**
```
feat!: change API response format
```

**Examples:**
```
feat: add user profile page
fix: resolve memory leak in connection pool
chore: update dependencies
docs: add API usage examples
refactor(parser): simplify token handling
test: add integration tests for checkout flow
```

**Best Practices:**
- Keep subject line under 50 characters
- Use imperative mood ("add" not "added")
- No period at end of subject
- Separate subject and body with blank line
- Wrap body at 72 characters

## Asking Questions

- **Decisions (2-4 options):** Use `AskUserQuestion` — lead with recommendation and "(Recommended)" label, concise labels, descriptions explain trade-offs
- **Open-ended/yes-no:** Ask conversationally in plain text
- **One question per message** — don't overwhelm with multiple questions
- **Don't ask what you can figure out** — check files, git history, and context first
- **Handle "Other"** — follow up conversationally to understand the alternative

## Pull Request Descriptions

**Title:** `TICKET-123: short description` if ticket available, otherwise conventional commit format. Under 70 characters.

**Body:**

```
## Context
- Why this change exists and what was wrong/missing before
- Link to ticket or design doc if available

## Changes
- What changed, grouped by concept (not file-by-file)

## Review Notes
- Non-obvious decisions, alternatives rejected, areas needing careful review
- Omit section if changes are straightforward

## Test Plan
- [ ] Steps to verify the changes work
```

**Key principles:**
- Explain *why*, not *how* — the diff already shows how
- Write for future readers, not just the current reviewer
- Be specific ("handles expired sessions mid-request") not vague ("fixes edge case")
- Don't substitute a ticket link for actual motivation

## Git Worktree Rules

When working inside a git worktree, **all git operations must target the worktree, not the main repository**:

- **Stay in the worktree.** Run git commands from the worktree directory. Do not `cd` to the main repo or use `git -C` pointing at the main repo.
- **Use `git -C <worktree-path>`** if you need to run git from a different working directory — always point it at the worktree, never at the original repo.
- **Commits, branches, and staging** all happen in the worktree. The main repo's working tree must not be modified.
- **Do not use `cd <main-repo> && git ...`** — this bypasses the worktree isolation and modifies the wrong working tree.

If you're unsure which directory is the worktree, check `git rev-parse --show-toplevel` from your current directory.

## Atlassian MCP Usage

To preserve context, **always delegate these Atlassian MCP operations to a subagent**:

- **Confluence page reads** (`getConfluencePage`, `searchConfluenceUsingCql`) — pages are verbose
- **Jira searches** (`searchJiraIssuesUsingJql`) — result sets contain full field metadata
- **Multi-step lookups** — any task requiring 2+ Atlassian MCP calls

Use the Agent tool with a clear prompt describing what to retrieve and how to summarize it. The subagent should return only the relevant details, not raw API output.

**OK to call directly** (without subagent): single-issue lookups (`getJiraIssue`) when you only need one field like status or assignee.

## Datadog MCP Usage

To preserve context, **always delegate these Datadog MCP operations to a subagent**:

- **Log searches and analysis** (`search_datadog_logs`, `analyze_datadog_logs`) — log results are verbose with many fields per entry
- **Span and trace searches** (`search_datadog_spans`, `get_datadog_trace`) — trace data includes full request waterfalls
- **Broad searches** (`search_datadog_hosts`, `search_datadog_services`, `search_datadog_events`, `search_datadog_rum_events`) — result sets can be large
- **Multi-step investigations** — any task requiring 2+ Datadog MCP calls (e.g. find a service, then search its logs, then pull a trace)

Use the Agent tool with a clear prompt describing what to investigate and what to summarize. The subagent should return only the relevant findings, not raw API output.

**OK to call directly** (without subagent): single-resource lookups (`get_datadog_metric`, `get_datadog_metric_context`, `get_datadog_incident`) when you need a specific, known item.
