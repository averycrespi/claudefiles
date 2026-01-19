# Completing-Work Reflection Step Design

## Overview

Add a reflection step to the completing-work skill that captures project-specific patterns learned during implementation. Claude observes broadly during the session, then presents curated learnings for user approval before updating the project's CLAUDE.md.

**Updated flow:**
1. Verify tests pass
2. **Reflect** → summarize learnings → user selects → update & commit CLAUDE.md
3. Present PR/keep options

## Gathering Reflections

### What Claude observes during the session:
- Explicit corrections or guidance from the user
- Findings from spec-reviewer and code-quality-reviewer subagents
- Friction points: things Claude had to figure out (build commands, test setup, file locations, naming conventions)
- Patterns discovered in existing code that weren't documented

### What makes a good reflection:
- Actionable for future sessions (not one-off fixes)
- Project-specific (not general programming knowledge)
- Concise enough to fit naturally in CLAUDE.md

### What to exclude:
- User preferences that belong in user's global CLAUDE.md
- Temporary workarounds or environment-specific quirks
- Things already documented in the project

## Presenting Reflections to the User

Use the `AskUserQuestion` tool with `multiSelect: true`:

```
AskUserQuestion(
  questions: [{
    question: "Which learnings should be preserved in CLAUDE.md?",
    header: "Reflections",
    multiSelect: true,
    options: [
      {
        label: "Build prereq",
        description: "Run `npm run build` before tests → ## Development"
      },
      {
        label: "API naming",
        description: "snake_case for query params → new ## API Conventions"
      },
      ...
    ]
  }]
)
```

**Benefits:**
- Native UI with checkboxes
- User can also select "Other" to provide custom input
- Consistent with other Claude Code interactions

**If no reflections:** Skip silently, proceed directly to PR/keep options.

## Updating CLAUDE.md

### Placement logic:
- Claude proposes where each learning goes (shown in the option description)
- If an appropriate section exists, append to it
- If no fitting section exists, create a new one
- Keep learnings concise - one line or a short bullet point

### Commit:
- Stage only CLAUDE.md
- Commit message: `docs(CLAUDE.md): <summarize selected learnings>`
- Example: `docs(CLAUDE.md): add build prereqs, API naming convention`

**If user selects "none" or no options:** Skip the update, proceed directly to PR/keep options.

## Updated Completing-Work Flow

```
1. Announce: "I'm using the completing-work skill..."

2. Verify tests pass
   - If tests fail → stop, show failures, don't proceed

3. Reflect (if there are learnings)
   - Present learnings via AskUserQuestion with multiSelect
   - If user selects any → update CLAUDE.md, commit
   - If user selects none or skips → continue
   - If no learnings to present → skip silently

4. Present options
   - "1. Push and create a Pull Request"
   - "2. Keep the branch as-is"

5. Execute chosen option
```

**Key point:** The CLAUDE.md commit happens before the PR is created, so those changes can be included in the PR.
