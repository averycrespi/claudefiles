# Smart PR Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Make the completing-work skill detect existing PRs and offer to update them instead of always offering to create a new one.

**Architecture:** Single-file edit to `claude/skills/completing-work/SKILL.md`. Add PR detection logic before Step 3, branch Step 3 into two option sets, and add a new execution path in Step 4.

**Tech Stack:** Markdown (skill definition), `gh` CLI

---

### Task 1: Add PR detection and update flow to completing-work skill

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:119-181` (Step 3 through end of file)

**Step 1: Update Step 3 to detect existing PRs**

Replace the current Step 3 (lines 119-135) with:

```markdown
### Step 3: Detect Existing PR and Present Options

**Before presenting options, check if a PR already exists for this branch:**

```bash
gh pr view --json url,title,number
```

**If a PR exists**, use `AskUserQuestion` to present exactly 2 options:

```javascript
AskUserQuestion(
  questions: [{
    question: "Implementation complete. PR #<number> exists for this branch. What would you like to do?",
    header: "Complete",
    multiSelect: false,
    options: [
      { label: "Push and update PR", description: "Push branch and update PR title and description" },
      { label: "Keep branch as-is", description: "I'll handle it later" }
    ]
  }]
)
```

**If no PR exists**, use `AskUserQuestion` to present exactly 2 options:

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

**Step 2: Update Step 4 to handle the update PR path**

Replace the current Step 4 (lines 137-151) with:

```markdown
### Step 4: Execute Choice

#### Option: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create draft PR
gh pr create --draft
```

#### Option: Push and Update PR

```bash
# Push branch
git push

# Update PR title and description based on all commits relative to base branch
gh pr edit <number> --title "..." --body "..."
```

The updated PR title and description are regenerated from scratch based on all commits on the branch relative to the base branch. Follow the PR description template from the project or global CLAUDE.md.

#### Option: Keep As-Is

Report: "Keeping branch <name>."
```

**Step 3: Update the Red Flags section**

Update the last two lines of the "Always" list (lines 179-180) which currently say:

```
- Present exactly 2 options
- Present exactly 2 options (push + PR, or keep branch)
```

Replace with:

```
- Present exactly 2 options (create PR, update PR, or keep branch — depending on whether a PR exists)
```

**Step 4: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "feat(completing-work): detect existing PRs and offer to update"
```

<!-- No documentation updates needed — the skill file is the documentation -->
