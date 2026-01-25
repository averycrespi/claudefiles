# Asking-Questions Skill Design

## Problem

The workflow skills (brainstorming, writing-plans, executing-plans, completing-work) ask questions inconsistently:

- **brainstorming** uses `AskUserQuestion` for approach selection, conversational for exploration
- **writing-plans** uses conversational questions only
- **executing-plans** uses conversational questions only
- **completing-work** uses `AskUserQuestion` for decisions and reflection selection

This inconsistency means:
1. Users get different UX depending on which skill is active
2. Each skill reinvents question-asking patterns
3. Some skills miss the richer UI that `AskUserQuestion` provides

## Solution

Create an `asking-questions` skill that teaches consistent patterns for asking questions. Each workflow skill invokes it at the start, loading the guidance into context for the entire session.

## Design

### Two Question Patterns

| Type | When to use | How |
|------|-------------|-----|
| **Decision** | 2-4 clear, mutually exclusive options | `AskUserQuestion` with structured options |
| **Exploratory** | Open-ended, yes/no, or no reasonable option set | Conversational text |

### Decision Questions (AskUserQuestion)

Use when there are 2-4 clear options to choose from.

**Structure:**
```javascript
AskUserQuestion(
  questions: [{
    question: "Which approach should we take?",
    header: "Approach",        // Short label (max 12 chars)
    multiSelect: false,        // true if choices aren't mutually exclusive
    options: [
      { label: "Option A (Recommended)", description: "Trade-offs for A" },
      { label: "Option B", description: "Trade-offs for B" }
    ]
  }]
)
```

**Guidelines:**
- Lead with recommended option, add "(Recommended)" to label
- Keep labels concise (1-5 words)
- Descriptions explain trade-offs or implications
- Use `multiSelect: true` when user can pick multiple (e.g., "Which learnings to preserve?")
- If user selects "Other", ask follow-up questions to understand their alternative

### Exploratory Questions (Conversational)

Use when the question is open-ended or has no reasonable option set.

**Guidelines:**
- One question per message
- Wait for answer before asking another
- Keep questions concise and specific

**Examples:**
- "What's the main purpose of this feature?"
- "What constraints should we consider?"
- "Ready to execute?"

### General Principles

- **Don't ask what you can figure out** - Check context, files, git history first
- **Prefer multiple choice** - Faster for user, clearer options
- **One question per message** - Don't overwhelm
- **Handle "Other" gracefully** - Follow up to understand alternatives

## Integration

Each workflow skill adds this line near the top:

```markdown
**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

And invokes it at the start of the workflow.

### Skills to Update

1. **brainstorming** - Already uses both patterns, add invocation for consistency
2. **writing-plans** - Add invocation, update "Ready to execute?" to use AskUserQuestion
3. **executing-plans** - Add invocation, update "Continue or start fresh?" to use AskUserQuestion
4. **completing-work** - Already uses AskUserQuestion well, add invocation for consistency

## Skill Metadata

```yaml
name: asking-questions
description: Internal skill for consistent question-asking patterns across workflow skills
```

Not primarily user-invocable, but harmless if invoked directly.

## File Structure

```
claude/skills/asking-questions/
  SKILL.md          # Main skill content
  ATTRIBUTION.md    # Credit to superpowers if patterns derived from there
```
