# Design: executing-plans-quickly Skill

A lightweight variant of `executing-plans` that does all work inline in the main context.

## Overview

**executing-plans-quickly** keeps the same task triplet structure and review discipline as `executing-plans`, but skips subagent dispatch for faster execution.

- **Same task triplet structure** - Implement → Spec Review → Code Review for each plan task
- **Same task system** - Uses native tasks to track progress
- **No subagent dispatch** - Implementation and reviews happen in main context
- **Simplified review prompts** - Shorter inline checklists instead of full reviewer templates

### When to Use

**Use executing-plans-quickly when:**
- Simple plans with 1-3 tasks
- Well-understood changes where context pollution isn't a concern
- Interactive sessions where speed matters more than isolation

**Use full executing-plans when:**
- Complex plans with many tasks
- Long-running autonomous work
- When you want independent review perspectives

## Process Flow

```
For each task triplet:
  1. Mark "Implement" in_progress
  2. Implement the task inline (TDD, commit)
  3. Mark "Implement" complete
  4. Mark "Spec Review" in_progress
  5. Self-review against spec (inline checklist)
  6. If issues → fix inline, amend commit
  7. Mark "Spec Review" complete
  8. Mark "Code Review" in_progress
  9. Self-review for code quality (inline checklist)
  10. If issues → fix inline, amend commit
  11. Mark "Code Review" complete
  12. Proceed to next triplet

After all triplets:
  Use completing-work skill
```

**Key differences from full executing-plans:**
- Steps 2, 5, 9 happen in main context instead of subagent dispatch
- No agent IDs to track (no resumption needed)
- Fix loops are immediate inline edits, not subagent resumptions

## Inline Review Checklists

**Spec Review Checklist:**
```
After implementing, verify:
□ All requirements from task spec implemented
□ No extra features added beyond spec
□ No requirements misinterpreted
□ Tests cover the specified behavior

If any issues found → fix and amend commit before proceeding
```

**Code Quality Checklist:**
```
After spec review passes, verify:
□ Tests actually test behavior (not implementation details)
□ Error handling appropriate for the context
□ Follows existing codebase patterns
□ No obvious bugs or edge cases missed

If any issues found → fix and amend commit before proceeding
```

These are intentionally shorter than the full reviewer templates since:
- Main context already knows what was just implemented
- No need to "distrust the implementer" (it's the same context)
- Focus on catching obvious issues, not adversarial review

## Writing-Plans Integration

After the plan is written and committed, `writing-plans` will offer three options:

```javascript
AskUserQuestion(
  questions: [{
    question: "Plan is ready. How would you like to proceed?",
    header: "Execute",
    multiSelect: false,
    options: [
      { label: "Execute with subagents (Recommended)", description: "Full isolation - best for complex plans or autonomous work" },
      { label: "Execute quickly", description: "Faster - does implementation and reviews in main context" },
      { label: "Don't execute", description: "Stop here - execute manually later" }
    ]
  }]
)
```

**Based on selection:**
- **Execute with subagents** → `Skill(executing-plans)`
- **Execute quickly** → `Skill(executing-plans-quickly)`
- **Don't execute** → End session

## Skill File Structure

```
executing-plans-quickly/
├── SKILL.md              # Main skill instructions
└── (no prompt templates) # Reviews are inline checklists in SKILL.md
```

Unlike `executing-plans` which has separate prompt templates, this skill keeps everything in SKILL.md since:
- No subagent dispatch means no need for prompt templates
- Inline checklists are short enough to include directly
- Simpler structure for a simpler skill

## Implementation Summary

**Files to create:**
1. `/Users/avery/.claude/skills/executing-plans-quickly/SKILL.md` - The new skill

**Files to modify:**
1. `/Users/avery/.claude/skills/writing-plans/SKILL.md` - Add third execution option
2. `/Users/avery/Workspace/claudefiles/CLAUDE.md` - Add skill to the workflow skills table
3. `/Users/avery/Workspace/claudefiles/README.md`:
   - Update mermaid diagram to reflect both execution options
   - Add "When to use full vs quick execution" guidance
