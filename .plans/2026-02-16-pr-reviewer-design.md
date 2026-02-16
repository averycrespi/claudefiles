# PR Reviewer Design

## Context

The structured development workflow currently has two levels of code review:

1. **Per-task spec review** — "Did we build the right thing?" (during executing-plans)
2. **Per-task code quality review** — "Did we build it well?" (during executing-plans)

Both reviews see only a single task's diff in isolation. There is no holistic review of the full changeset after all tasks are complete. This means cross-cutting concerns — inconsistent patterns across components, integration gaps, duplicated logic between tasks — can slip through.

The completing-work skill currently verifies task completion, runs tests, reflects on learnings, and creates a PR. It does not review the code.

## Goals & Non-Goals

**Goals:**
- Add a holistic code review that sees the entire PR as a single changeset
- Post review findings as a PR comment (advisory, not blocking)
- Restrict the reviewer agent to read-only tools + comment creation

**Non-Goals:**
- Design alignment review (comparing against design docs) — may add later
- Blocking gate that prevents PR creation
- Changes to per-task review behavior in executing-plans

## Design

### New Agent: pr-reviewer

A new agent at `claude/agents/pr-reviewer.md` that performs holistic code review of a full PR.

**Responsibility:** Review the complete PR diff as a human reviewer would — looking at cross-cutting concerns, component interactions, consistency, integration quality, and overall cohesion.

**Interface:**
- Input: PR number, dispatched via Task tool from completing-work
- Output: Review findings posted as a `gh pr comment`

**Tool restrictions:** Read, Glob, Grep, Bash (for `gh pr diff`, `gh pr view`, `gh pr comment`, `git` commands). No Write or Edit — this agent is read-only except for posting the comment.

**Review focus areas:**
- Cross-cutting consistency (naming, patterns, error handling across components)
- Integration quality (do the pieces fit together correctly?)
- Missing pieces (anything the per-task reviews wouldn't catch)
- Overall code cohesion and maintainability

**Output format:** Structured PR comment with findings categorized by severity, posted via `gh pr comment`. Not a pass/fail gate.

### Updated Completing-Work Flow

```
Step 0: Verify task completion
Step 1: Verify tests
Step 2: Reflect on learnings
Step 3: Present options (PR or keep branch)
Step 4: Execute choice
Step 5: If PR was created → dispatch pr-reviewer → post findings as PR comment
```

Step 5 only runs when the user chose "Push and create PR" in Step 3. If the user chose "Keep branch as-is", skip Step 5 silently.

The `gh pr comment` command is NOT in the global allow list. The user will be prompted for permission once per session when the pr-reviewer agent runs.

### How pr-reviewer Differs from Per-Task Reviews

| Aspect | Per-task reviews | PR reviewer |
|--------|-----------------|-------------|
| Scope | Single task diff | Full PR diff |
| When | During execution, after each task | After PR creation |
| Purpose | Verify task correctness | Verify changeset cohesion |
| Blocking | Yes (must pass to proceed) | No (advisory comment) |
| Agent | code-reviewer | pr-reviewer |

## Changes Required

1. **Create** `claude/agents/pr-reviewer.md` — new agent definition with tool restrictions
2. **Modify** `claude/skills/completing-work/SKILL.md` — add Step 5
3. **Modify** `CLAUDE.md` (project root) — add pr-reviewer to Agents table
4. **Modify** `README.md` — update mermaid diagram to show PR review step in Completing subgraph
