# Brainstorming AskUserQuestion Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Integrate AskUserQuestion tool into the brainstorming skill's "Exploring approaches" phase for better UX and consistency with other skills.

**Architecture:** Single file edit to add explicit AskUserQuestion guidance in the "Exploring approaches" section. Keep conversational explanation before the tool call, add code example and handling for "Other" responses.

**Tech Stack:** Markdown skill file

---

### Task 1: Update "Exploring approaches" Section

**Files:**
- Modify: `claude/skills/brainstorming/SKILL.md:23-26`

**Step 1: Read current file state**

Verify the current "Exploring approaches" section at lines 23-26:

```markdown
**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
```

**Step 2: Replace with updated section**

Replace lines 23-26 with:

```markdown
**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Explain each approach conversationally first, with your recommendation and reasoning
- Lead with your recommended option and explain why
- Then use `AskUserQuestion` to capture the decision:

```javascript
AskUserQuestion(
  questions: [{
    question: "Which approach should we take?",
    header: "Approach",
    multiSelect: false,
    options: [
      { label: "<Approach> (Recommended)", description: "<trade-offs>" },
      { label: "<Approach 2>", description: "<trade-offs>" }
    ]
  }]
)
```

- If user selects "Other", ask follow-up questions to understand their alternative
```

**Step 3: Verify the edit**

Read the file and confirm:
- "Exploring approaches" section now includes AskUserQuestion example
- Code block is properly formatted with javascript syntax highlighting
- Guidance for "Other" response handling is present

**Step 4: Commit**

```bash
git add claude/skills/brainstorming/SKILL.md
git commit -m "feat(brainstorming): add AskUserQuestion for approach selection"
```

---

### Task 2: Update "Multiple choice preferred" Principle

**Files:**
- Modify: `claude/skills/brainstorming/SKILL.md:48`

**Step 1: Read current principle**

Verify line 48:

```markdown
- **Multiple choice preferred** - Easier to answer than open-ended when possible
```

**Step 2: Update to reference AskUserQuestion**

Replace with:

```markdown
- **Multiple choice preferred** - Use `AskUserQuestion` for approach selection; conversational for open-ended exploration
```

**Step 3: Verify the edit**

Read the file and confirm the principle now references `AskUserQuestion`.

**Step 4: Commit**

```bash
git add claude/skills/brainstorming/SKILL.md
git commit -m "docs(brainstorming): clarify multiple choice principle"
```
