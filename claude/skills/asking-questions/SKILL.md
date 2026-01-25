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
