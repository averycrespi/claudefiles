# Completing-Work Reflection Step Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a reflection step to the completing-work skill that captures project-specific patterns and updates the project's CLAUDE.md.

**Architecture:** Modify the existing SKILL.md to insert a new Step 2 (Reflect) between test verification and presenting options. The step uses AskUserQuestion with multiSelect to let users choose which learnings to preserve.

**Tech Stack:** Markdown skill definition, AskUserQuestion tool

---

### Task 1: Update Overview and Core Principle

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:8-14`

**Step 1: Update the overview section**

Change the core principle from:
```
**Core principle:** Verify tests → Present options → Execute choice.
```

To:
```
**Core principle:** Verify tests → Reflect on learnings → Present options → Execute choice.
```

**Step 2: Verify the change**

Read the file and confirm the core principle now includes "Reflect on learnings".

**Step 3: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "docs(completing-work): update core principle to include reflection"
```

---

### Task 2: Add Step 2 (Reflect on Learnings)

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:39` (insert after Step 1)

**Step 1: Insert the new Step 2 section**

Add the following after the "**If tests pass:** Continue to Step 2." line:

```markdown
### Step 2: Reflect on Learnings

**If you have project-specific learnings from this session, present them for user approval.**

**What to look for:**
- Explicit corrections or guidance from the user during the session
- Findings from spec-reviewer and code-quality-reviewer subagents
- Friction points you figured out (build commands, test setup, file locations, naming conventions)
- Patterns discovered in existing code that weren't documented

**What makes a good reflection:**
- Actionable for future sessions (not one-off fixes)
- Project-specific (not general programming knowledge)
- Concise enough to fit naturally in CLAUDE.md

**What to exclude:**
- User preferences (belong in user's global CLAUDE.md, not project CLAUDE.md)
- Temporary workarounds or environment-specific quirks
- Things already documented in the project

**If you have learnings to propose:**

Use `AskUserQuestion` with `multiSelect: true`:

```
AskUserQuestion(
  questions: [{
    question: "Which learnings should be preserved in CLAUDE.md?",
    header: "Reflections",
    multiSelect: true,
    options: [
      {
        label: "<short label>",
        description: "<learning> → <target section in CLAUDE.md>"
      },
      // ... more options
    ]
  }]
)
```

**Example:**
```
options: [
  { label: "Build prereq", description: "Run `npm run build` before tests → ## Development" },
  { label: "API naming", description: "Query params use snake_case → new ## API Conventions" }
]
```

**After user selects:**
- If user selects any options → Update project CLAUDE.md, placing learnings in proposed sections
- Commit: `docs(CLAUDE.md): <summarize selected learnings>`
- If user selects nothing → Skip, continue to Step 3

**If no learnings to propose:** Skip silently, continue to Step 3.
```

**Step 2: Update "Continue to Step 2" reference**

Change:
```
**If tests pass:** Continue to Step 2.
```

To:
```
**If tests pass:** Continue to Step 2.
```

(This stays the same since we're inserting Step 2 as the reflection step.)

**Step 3: Verify the new section is properly formatted**

Read the file and confirm Step 2 is complete and properly indented.

**Step 4: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "feat(completing-work): add Step 2 for reflecting on learnings"
```

---

### Task 3: Renumber Existing Steps

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md`

**Step 1: Rename "Step 2: Present Options" to "Step 3: Present Options"**

Change:
```
### Step 2: Present Options
```

To:
```
### Step 3: Present Options
```

**Step 2: Rename "Step 3: Execute Choice" to "Step 4: Execute Choice"**

Change:
```
### Step 3: Execute Choice
```

To:
```
### Step 4: Execute Choice
```

**Step 3: Verify step numbering is correct**

Read the file and confirm:
- Step 1: Verify Tests
- Step 2: Reflect on Learnings
- Step 3: Present Options
- Step 4: Execute Choice

**Step 4: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "refactor(completing-work): renumber steps for new reflection step"
```

---

### Task 4: Update Common Mistakes and Red Flags

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md` (Common Mistakes and Red Flags sections)

**Step 1: Add reflection-related guidance to Common Mistakes**

Add after the "Open-ended questions" mistake:

```markdown
**Noisy reflections**
- **Problem:** Proposing too many trivial or already-documented learnings
- **Fix:** Only propose actionable, project-specific patterns not already in CLAUDE.md
```

**Step 2: Update "Always" list in Red Flags**

Change:
```
**Always:**
- Verify tests before offering options
- Present exactly 2 options
```

To:
```
**Always:**
- Verify tests before offering options
- Skip reflection silently if no learnings to propose
- Present exactly 2 options
```

**Step 3: Verify changes**

Read the file and confirm Common Mistakes has 3 items and Red Flags "Always" has 3 items.

**Step 4: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "docs(completing-work): add reflection guidance to mistakes and red flags"
```

---

### Task 5: Final Verification

**Step 1: Read the complete updated SKILL.md**

Verify the full flow is coherent:
1. Step 1: Verify Tests
2. Step 2: Reflect on Learnings (with AskUserQuestion multiSelect)
3. Step 3: Present Options
4. Step 4: Execute Choice

**Step 2: Verify skill loads correctly**

The skill is just a markdown file, so no runtime verification needed beyond reading it.

**Step 3: Final commit if any cleanup needed**

If any formatting issues were found, fix and commit.
