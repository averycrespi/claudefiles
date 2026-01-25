# Asking-Questions Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a skill that teaches consistent question-asking patterns for use by all workflow skills.

**Architecture:** Create the asking-questions skill with SKILL.md and ATTRIBUTION.md, then update each workflow skill to invoke it at the start and remove redundant inline guidance.

**Tech Stack:** Markdown, YAML frontmatter

---

### Task 1: Create the asking-questions skill

**Files:**
- Create: `claude/skills/asking-questions/SKILL.md`
- Create: `claude/skills/asking-questions/ATTRIBUTION.md`

**Step 1: Create skill directory**

```bash
mkdir -p claude/skills/asking-questions
```

**Step 2: Create ATTRIBUTION.md**

```markdown
Adapted from https://github.com/obra/superpowers under the MIT license.
```

**Step 3: Create SKILL.md**

```markdown
---
name: asking-questions
description: Internal skill for consistent question-asking patterns. Invoked by workflow skills at session start to load guidance into context.
---

# Asking Questions

## Overview

This skill teaches consistent patterns for asking questions across all workflow skills. Invoke this skill at the start of any workflow that involves user interaction.

## Two Question Patterns

| Type | When to use | How |
|------|-------------|-----|
| **Decision** | 2-4 clear, mutually exclusive options | `AskUserQuestion` tool |
| **Exploratory** | Open-ended, yes/no, or no reasonable option set | Conversational text |

## Decision Questions (AskUserQuestion)

Use when presenting 2-4 clear options for the user to choose from.

**Structure:**

```javascript
AskUserQuestion(
  questions: [{
    question: "Which approach should we take?",
    header: "Approach",        // Short label, max 12 chars
    multiSelect: false,        // true if choices aren't mutually exclusive
    options: [
      { label: "Option A (Recommended)", description: "Trade-offs for A" },
      { label: "Option B", description: "Trade-offs for B" }
    ]
  }]
)
```

**Guidelines:**

- **Lead with recommendation** - Put the recommended option first, add "(Recommended)" to its label
- **Concise labels** - 1-5 words per label
- **Descriptive trade-offs** - Descriptions explain implications, not just restate the label
- **Use multiSelect wisely** - Set `multiSelect: true` when choices aren't mutually exclusive (e.g., "Which learnings to preserve?")
- **Handle "Other"** - If user selects "Other", ask follow-up questions to understand their alternative

**When to use:**

- Choosing between approaches or architectures
- Selecting from a list of options
- Binary decisions with meaningful trade-offs
- Any time there are 2-4 clear, distinct choices

## Exploratory Questions (Conversational)

Use when the question is open-ended or there's no reasonable set of options to present.

**Guidelines:**

- **One question per message** - Don't overwhelm with multiple questions
- **Wait for answer** - Don't ask another question until the previous one is answered
- **Be specific** - Vague questions get vague answers

**When to use:**

- Understanding requirements or context
- Gathering information with unpredictable answers
- Simple yes/no confirmations
- Follow-up questions after "Other" selection

**Examples:**

- "What's the main purpose of this feature?"
- "What constraints should we consider?"
- "Ready to proceed?"

## General Principles

1. **Don't ask what you can figure out** - Check files, git history, and context before asking
2. **Prefer multiple choice** - Faster for user, clearer communication
3. **One question at a time** - Avoid overwhelming the user
4. **Handle "Other" gracefully** - Follow up conversationally to understand alternatives
```

**Step 4: Verify files exist**

```bash
ls -la claude/skills/asking-questions/
```

Expected: SKILL.md and ATTRIBUTION.md present

**Step 5: Commit**

```bash
git add claude/skills/asking-questions/
git commit -m "feat(asking-questions): create skill for consistent question patterns"
```

---

### Task 2: Update brainstorming to use asking-questions

**Files:**
- Modify: `claude/skills/brainstorming/SKILL.md`

**Step 1: Read current file**

Read `claude/skills/brainstorming/SKILL.md` to understand current structure.

**Step 2: Add sub-skill invocation after the Overview section**

After the Overview section (around line 12), add:

```markdown
**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

**Step 3: Simplify the AskUserQuestion example**

The current "Exploring approaches" section has detailed AskUserQuestion guidance. Replace the detailed code block and guidelines with a reference to the asking-questions skill:

Replace lines 27-40 (the code block and surrounding text about AskUserQuestion) with:

```markdown
- Then use `AskUserQuestion` to capture the decision (see asking-questions skill for format)
```

**Step 4: Simplify Key Principles**

Update the "Multiple choice preferred" bullet to:

```markdown
- **Multiple choice preferred** - See asking-questions skill for patterns
```

**Step 5: Verify the file is valid markdown**

Read the modified file and check structure is correct.

**Step 6: Commit**

```bash
git add claude/skills/brainstorming/SKILL.md
git commit -m "refactor(brainstorming): use asking-questions skill for question patterns"
```

---

### Task 3: Update writing-plans to use asking-questions

**Files:**
- Modify: `claude/skills/writing-plans/SKILL.md`

**Step 1: Read current file**

Read `claude/skills/writing-plans/SKILL.md` to understand current structure.

**Step 2: Add sub-skill invocation after the announce line**

After the "Announce at start" line (around line 14), add:

```markdown
**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

**Step 3: Update the execution handoff question**

The current handoff (lines 102-104) uses a simple conversational question. Update to use AskUserQuestion pattern:

Replace:
```markdown
Then ask the user if they want to execute:

**"Plan complete and saved to `.plans/<filename>.md`. Ready to execute?"**
```

With:
```markdown
Then ask the user if they want to execute using `AskUserQuestion`:

```javascript
AskUserQuestion(
  questions: [{
    question: "Plan complete. Ready to execute?",
    header: "Execute",
    multiSelect: false,
    options: [
      { label: "Yes, execute now", description: "Start implementing with review gates" },
      { label: "No, save for later", description: "Plan saved, execute anytime with /execute-plan" }
    ]
  }]
)
```
```

**Step 4: Verify the file is valid markdown**

Read the modified file and check structure is correct.

**Step 5: Commit**

```bash
git add claude/skills/writing-plans/SKILL.md
git commit -m "refactor(writing-plans): use asking-questions skill, structured handoff"
```

---

### Task 4: Update executing-plans to use asking-questions

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md`

**Step 1: Read current file**

Read `claude/skills/executing-plans/SKILL.md` to understand current structure.

**Step 2: Add sub-skill invocation after the announce line**

After the "Announce at start" line (around line 14), add:

```markdown
**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

**Step 3: Update the resume/fresh question**

The current guidance (lines 51-54) uses conversational question. Update to use AskUserQuestion pattern:

Replace:
```markdown
- **If tasks exist for this plan:** Ask the user: "Found existing tasks. Continue from where you left off, or start fresh in a new session?"
  - **Continue:** Use existing tasks, resume from first non-completed triplet
  - **Start fresh:** Advise user to start a new session for clean execution (tasks are session-scoped and cannot be deleted)
```

With:
```markdown
- **If tasks exist for this plan:** Use `AskUserQuestion` to ask:

```javascript
AskUserQuestion(
  questions: [{
    question: "Found existing tasks for this plan. How would you like to proceed?",
    header: "Resume",
    multiSelect: false,
    options: [
      { label: "Continue (Recommended)", description: "Resume from first incomplete task" },
      { label: "Start fresh", description: "Start new session for clean execution" }
    ]
  }]
)
```

  - **Continue:** Use existing tasks, resume from first non-completed triplet
  - **Start fresh:** Advise user to start a new session for clean execution (tasks are session-scoped and cannot be deleted)
```

**Step 4: Verify the file is valid markdown**

Read the modified file and check structure is correct.

**Step 5: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "refactor(executing-plans): use asking-questions skill, structured resume"
```

---

### Task 5: Update completing-work to use asking-questions

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md`

**Step 1: Read current file**

Read `claude/skills/completing-work/SKILL.md` to understand current structure.

**Step 2: Add sub-skill invocation after the announce line**

After the "Announce at start" line (around line 14), add:

```markdown
**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

**Step 3: Simplify the AskUserQuestion examples**

The completing-work skill already uses AskUserQuestion well. Add a reference note after the first AskUserQuestion example (around line 100):

After the reflection AskUserQuestion block, add:

```markdown
(See asking-questions skill for detailed AskUserQuestion patterns)
```

**Step 4: Update Step 3 to use AskUserQuestion**

The current Step 3 (lines 119-132) presents options as text. Update to use AskUserQuestion:

Replace:
```markdown
### Step 3: Present Options

Present exactly these 2 options:

```
Implementation complete. What would you like to do?

1. Push and create a Pull Request
2. Keep the branch as-is (I'll handle it later)

Which option?
```

**Don't add explanation** - keep options concise.
```

With:
```markdown
### Step 3: Present Options

Use `AskUserQuestion` to present exactly 2 options:

```javascript
AskUserQuestion(
  questions: [{
    question: "Implementation complete. What would you like to do?",
    header: "Complete",
    multiSelect: false,
    options: [
      { label: "Push and create PR", description: "Push branch and create draft pull request" },
      { label: "Keep branch as-is", description: "I'll handle it later" }
    ]
  }]
)
```
```

**Step 5: Verify the file is valid markdown**

Read the modified file and check structure is correct.

**Step 6: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "refactor(completing-work): use asking-questions skill, consistent patterns"
```

---

### Task 6: Test the integration

**Files:**
- None (verification only)

**Step 1: Verify all skill files are valid**

```bash
for f in claude/skills/asking-questions/SKILL.md claude/skills/brainstorming/SKILL.md claude/skills/writing-plans/SKILL.md claude/skills/executing-plans/SKILL.md claude/skills/completing-work/SKILL.md; do
  echo "=== $f ===" && head -20 "$f"
done
```

Expected: All files have valid YAML frontmatter and markdown structure.

**Step 2: Verify asking-questions skill is referenced in all workflow skills**

```bash
grep -l "asking-questions" claude/skills/*/SKILL.md
```

Expected: brainstorming, writing-plans, executing-plans, completing-work all listed.

**Step 3: Run stow to apply changes**

```bash
./setup.sh
```

Expected: Stow completes without errors.

**Step 4: Commit verification (if any stow changes)**

If setup.sh modified anything, commit:

```bash
git status
# Only commit if there are changes
```

---

### Task 7: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Step 1: Update README.md Reference Skills table**

In `README.md`, find the "Reference Skills" table (around line 132-137) and add asking-questions:

```markdown
### Reference Skills

| Skill                     | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `asking-questions`        | Consistent question patterns for workflow skills  |
| `test-driven-development` | TDD discipline: red-green-refactor cycle          |
```

**Step 2: Update CLAUDE.md Reference Skills table**

In `CLAUDE.md`, find the "Reference Skills" table (around line 66-70) and add asking-questions:

```markdown
### Reference Skills

| Skill                     | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `asking-questions`        | Consistent question patterns for workflow skills  |
| `test-driven-development` | TDD discipline: red-green-refactor cycle          |
```

**Step 3: Verify changes**

Read both files to confirm the tables are correctly formatted.

**Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add asking-questions to reference skills tables"
```
