# Brainstorming Skill: AskUserQuestion Integration

## Problem

The brainstorming skill says "Prefer multiple choice questions when possible" but doesn't use the `AskUserQuestion` tool. This creates two issues:

1. **UX friction** - Users must type responses instead of clicking buttons
2. **Inconsistency** - Other skills (completing-work) already use `AskUserQuestion`

## Solution

Integrate `AskUserQuestion` into the **"Exploring approaches"** phase of the brainstorming skill.

### Why Only This Phase?

| Phase | Fit | Reason |
|-------|-----|--------|
| Understanding the idea | Poor | Questions are exploratory; options unknown upfront |
| Exploring approaches | **Best** | 2-3 concrete options with known trade-offs |
| Presenting the design | Poor | Simple yes/no; tool adds friction |
| After the design | Decent | But simple enough to stay conversational |

### The Change

Replace the "Exploring approaches" section with:

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

### Format Details

- **header**: "Approach" (fits 12 char limit)
- **multiSelect**: false (picking one approach)
- **options**: 2-3 approaches, recommended first with "(Recommended)" suffix
- **Other**: Built-in; no need for explicit "combine" option (YAGNI)

### What Stays the Same

- Understanding the idea: conversational, open-ended
- Presenting the design: simple "Does this look right?" prompts
- After the design: conversational "Ready to implement?"

## Implementation

Single file change: `claude/skills/brainstorming/SKILL.md`

Update the "Exploring approaches" bullet points as shown above.
