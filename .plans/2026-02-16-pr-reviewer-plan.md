# PR Reviewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a holistic PR review step to the completing-work skill that dispatches a pr-reviewer agent to review the full PR and post findings as an advisory comment.

**Architecture:** A new `pr-reviewer` agent definition restricted to read-only tools + Bash (for gh/git commands). The completing-work skill gets a new Step 5 that dispatches this agent after PR creation. Documentation updated to reflect the new agent and workflow step.

**Tech Stack:** Markdown (agent definitions, skill definitions, docs)

---

### Task 1: Create pr-reviewer Agent

**Files:**
- Create: `claude/agents/pr-reviewer.md`

**Step 1: Create the agent definition**

Create `claude/agents/pr-reviewer.md` with the following content:

```markdown
---
name: pr-reviewer
description: |
  Use this agent to perform a holistic code review of a pull request after it has been created. Unlike per-task code reviews (which see individual task diffs), this agent reviews the entire PR changeset as a single unit — catching cross-cutting concerns, integration gaps, and inconsistencies across components.
tools: Read, Glob, Grep, Bash
---

You are a Senior Code Reviewer performing a holistic review of a pull request. Unlike per-task reviews that examine individual changes in isolation, you are reviewing the **entire changeset** as a single unit — the way a human reviewer would see it.

## Your Task

1. Run `gh pr view {PR_NUMBER} --json title,body` to understand the PR context
2. Run `gh pr diff {PR_NUMBER}` to see the full changeset
3. Read any files that need more context beyond the diff
4. Write your review findings
5. Post your review as a PR comment using `gh pr comment {PR_NUMBER} --body "..."`

## What to Look For

**Cross-cutting consistency:**
- Are naming conventions consistent across all changed files?
- Are error handling patterns consistent across components?
- Are similar operations handled the same way everywhere?

**Integration quality:**
- Do the components fit together correctly?
- Are interfaces between components clean and well-defined?
- Are there implicit dependencies that should be explicit?

**Missing pieces:**
- Is anything referenced but not implemented?
- Are there TODO comments that should have been resolved?
- Are there edge cases at component boundaries?

**Overall cohesion:**
- Does the changeset tell a coherent story?
- Is the code maintainable as a whole?
- Are there opportunities to reduce duplication across components?

## Comment Format

Post your review as a PR comment with this structure:

```
## Holistic PR Review

### Summary
[1-2 sentences: overall impression of the changeset]

### Findings

#### Critical
- [issue with file:line - what's wrong, why it matters]

#### Important
- [issue with file:line - what's wrong, why it matters]

#### Suggestions
- [suggestion with file:line - what could be improved]

### Strengths
- [what was done well]

---
*Holistic review by pr-reviewer agent*
```

**If no issues found:**

```
## Holistic PR Review

### Summary
[1-2 sentences: overall impression]

Clean changeset with no cross-cutting issues identified.

### Strengths
- [what was done well]

---
*Holistic review by pr-reviewer agent*
```

## Rules

- **Be specific** — always reference file:line
- **Focus on cross-cutting concerns** — per-task reviews already checked individual task quality
- **Categorize by actual severity** — not everything is Critical
- **Acknowledge strengths** — note what was done well
- **Post exactly one comment** — consolidate all findings into a single comment
```

**Step 2: Verify the file was created correctly**

Run: `ls -la claude/agents/pr-reviewer.md`
Expected: File exists

**Step 3: Commit**

```bash
git add claude/agents/pr-reviewer.md
git commit -m "feat: add pr-reviewer agent for holistic PR review"
```

---

### Task 2: Add Step 5 to Completing-Work Skill

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:139-159` (after Step 4: Execute Choice)

**Step 1: Add Step 5 after the existing Step 4 section**

After the `#### Option 2: Keep As-Is` section (line 158) and before `## Common Mistakes` (line 161), insert:

```markdown
### Step 5: Holistic PR Review

**Only runs when user chose "Push and create PR" in Step 3. Skip silently otherwise.**

After the PR is created, dispatch the `pr-reviewer` agent to perform a holistic review of the full changeset:

```
Task tool (pr-reviewer):
  description: "Holistic review of PR #<number>"
  prompt: |
    Review PR #<number> in this repository.

    This PR was created as part of the structured development workflow.
    Individual tasks were already reviewed for spec compliance and code quality.
    Your job is to review the FULL changeset holistically — looking for
    cross-cutting concerns that per-task reviews wouldn't catch.
```

Report to user: "PR review posted as a comment on #<number>."
```

**Step 2: Update the "Core principle" line to reflect the new step**

Change line 12 from:
```
**Core principle:** Verify task completion → Verify tests → Reflect on learnings → Present options → Execute choice.
```
to:
```
**Core principle:** Verify task completion → Verify tests → Reflect on learnings → Present options → Execute choice → Holistic PR review.
```

**Step 3: Update the "Always" list in Red Flags section**

Add to the "Always" list (after line 185):
```
- Dispatch pr-reviewer after PR creation (advisory, not blocking)
```

**Step 4: Verify the changes look correct**

Run: `git diff claude/skills/completing-work/SKILL.md`
Expected: Shows the three additions (Step 5 section, updated core principle, updated red flags)

**Step 5: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "feat(completing-work): add holistic PR review step"
```

---

### Task 3: Update Documentation

**Files:**
- Modify: `CLAUDE.md:90-94` (Agents table)
- Modify: `README.md:65-68` (mermaid diagram Completing subgraph)

**Step 1: Add pr-reviewer to the Agents table in CLAUDE.md**

Change the Agents table (lines 92-94) from:
```markdown
| Agent           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards |
```
to:
```markdown
| Agent           | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards   |
| `pr-reviewer`   | Holistic review of full PR after creation         |
```

**Step 2: Update the mermaid diagram in README.md**

Change the Completing subgraph (lines 65-68) from:
```markdown
    subgraph Completing["Skill(completing-work)"]
        C1[Verify tests pass] --> C2[Reflect on learnings]
        C2 --> C3[Create draft PR]
    end
```
to:
```markdown
    subgraph Completing["Skill(completing-work)"]
        C1[Verify tests pass] --> C2[Reflect on learnings]
        C2 --> C3[Create draft PR]
        C3 --> C4[Holistic PR review]
    end
```

**Step 3: Verify the changes look correct**

Run: `git diff CLAUDE.md README.md`
Expected: Shows the two documentation updates

**Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add pr-reviewer to agents table and workflow diagram"
```
