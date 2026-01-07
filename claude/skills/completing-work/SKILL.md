---
name: completing-work
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion by presenting structured options
---

# Completing Work

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice.

**Announce at start:** "I'm using the completing-work skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Present Options

Present exactly these 2 options:

```
Implementation complete. What would you like to do?

1. Push and create a Pull Request
2. Keep the branch as-is (I'll handle it later)

Which option?
```

**Don't add explanation** - keep options concise.

### Step 3: Execute Choice

#### Option 1: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR in draft mode
gh pr create --draft --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

#### Option 2: Keep As-Is

Report: "Keeping branch <name>."

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 2 structured options

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Present exactly 2 options
