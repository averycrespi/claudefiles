# Executing Plans in Sandbox — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a third plan execution mode that runs plans autonomously in the sandbox VM via `cco box push/pull`.

**Architecture:** A new skill file wraps the existing `cco box push` and `cco box pull` CLI commands. The writing-plans skill gets an additional handoff option. The project CLAUDE.md skills table gets updated.

**Tech Stack:** Markdown skill files, Bash CLI commands

---

### Task 1: Create the executing-plans-in-sandbox skill

**Files:**
- Create: `claude/skills/executing-plans-in-sandbox/SKILL.md`

**Step 1: Create the skill file**

Create `claude/skills/executing-plans-in-sandbox/SKILL.md` with:

```markdown
---
name: executing-plans-in-sandbox
description: Use when you have a written implementation plan file to execute in the sandbox VM - pushes plan to sandbox, waits for results, reintegrates
---

# Executing Plans in Sandbox

## Overview

Execute implementation plans autonomously in a sandbox VM. Pushes the plan and current branch into the sandbox, where Claude Code runs the full executing-plans workflow unattended. Pulls results back when complete.

**Core principle:** Full isolation in a disposable VM — best for autonomous work where you don't want to block the host.

**Announce at start:** "I'm using the executing-plans-in-sandbox skill to run this plan in the sandbox."

## The Process

### Step 1: Push Plan to Sandbox

1. Validate the plan file path exists
2. Run `cco box push <plan-path>`
3. Capture the job ID from the output (format: `job <ID> started`)

### Step 2: Wait for Results

1. Run `cco box pull <job-id>`
2. This blocks up to 30 minutes, polling for the output bundle
3. On success, results are fast-forward merged into the current branch

### Step 3: Complete Development

**REQUIRED SUB-SKILL:** Use Skill(completing-work)
```

**Step 2: Verify the skill file renders correctly**

Run: `cat claude/skills/executing-plans-in-sandbox/SKILL.md`
Expected: File exists with correct frontmatter and content.

**Step 3: Commit**

```bash
git add claude/skills/executing-plans-in-sandbox/SKILL.md
git commit -m "feat: add executing-plans-in-sandbox skill"
```

---

### Task 2: Add sandbox option to writing-plans handoff

**Files:**
- Modify: `claude/skills/writing-plans/SKILL.md:109-141` (Execution Handoff section)

**Step 1: Update the AskUserQuestion options**

In `claude/skills/writing-plans/SKILL.md`, replace the existing `AskUserQuestion` block and handler section with a version that adds the sandbox option as the third choice:

```javascript
AskUserQuestion(
  questions: [{
    question: "Plan is ready. How would you like to proceed?",
    header: "Execute",
    multiSelect: false,
    options: [
      { label: "Execute with subagents (Recommended)", description: "Full isolation - best for complex plans or autonomous work" },
      { label: "Execute quickly", description: "Faster - does implementation and reviews in main context" },
      { label: "Execute in sandbox", description: "Runs autonomously in a sandbox VM - doesn't block the host" },
      { label: "Don't execute", description: "Stop here - execute manually later" }
    ]
  }]
)
```

Add the handler block after the existing "Execute quickly" handler:

```markdown
**Execute in sandbox:**
- **REQUIRED SUB-SKILL:** Use Skill(executing-plans-in-sandbox)
- Pushes plan to sandbox VM, waits for results, reintegrates
- Best for autonomous work where you don't want to block the host
```

**Step 2: Verify the changes**

Run: `grep -A 5 "sandbox" claude/skills/writing-plans/SKILL.md`
Expected: Shows the new sandbox option and handler.

**Step 3: Commit**

```bash
git add claude/skills/writing-plans/SKILL.md
git commit -m "feat(writing-plans): add sandbox execution option"
```

---

### Task 3: Update project CLAUDE.md skills table

**Files:**
- Modify: `CLAUDE.md:54-61` (Workflow Skills table)

**Step 1: Add the new skill to the workflow skills table**

Add a row for `executing-plans-in-sandbox` after the `executing-plans-quickly` row:

```markdown
| `executing-plans-in-sandbox` | Execute plans autonomously in a sandbox VM              |
```

**Step 2: Verify the table renders correctly**

Run: `grep "executing-plans" CLAUDE.md`
Expected: Shows all three executing-plans variants in the table.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add executing-plans-in-sandbox to skills table"
```

<!-- No documentation updates needed beyond the CLAUDE.md skills table already covered in Task 3 -->
