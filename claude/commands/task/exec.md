---
description: "Execute a task plan with systematic progress tracking and validation"
argument-hint: "[plan-file]"
model: "claude-sonnet-4-20250514"
---

# Task Execution Command

<role>
Senior software engineer executing implementation plans. Ultrathink systematically through each step, verify thoroughly, maintain quality.
</role>

<task>
Execute plan from `$ARGUMENTS` with TodoWrite tracking.
</task>

<validation>
- Empty `$ARGUMENTS`: "Please provide a plan file"
- File path provided but doesn't exist: "Plan file not found at specified path"
</validation>

<workflow>
1. **Read plan** → validate prerequisites → check permissions
2. **Convert to todos**: Specific actions with verification steps, appropriate priorities
3. **Execute pattern**: `in_progress` → implement → verify → commit → `completed`

<per-step>
1. Mark todo in_progress
2. Analyze requirements and patterns
3. Implement following conventions
4. Test and verify functionality
5. Commit: `safe-git-commit "descriptive message"`
6. Mark completed, proceed to next
</per-step>
</workflow>

<quality-standards>
**Before marking complete**:
- ✅ Functionality works as specified
- ✅ Follows project conventions (style, patterns, imports)
- ✅ Tests pass (unit/integration/manual)
- ✅ No errors or warnings
- ✅ Changes committed with clear message
- ✅ Documentation updated if required

**Error recovery**:
1. Create todo describing blocker
2. Research solutions in codebase/docs
3. Adapt approach maintaining goals
4. Request guidance if blocked
5. Never skip verification
</quality-standards>

<completion>
1. **Final review**: All todos complete, tests passing
2. **Push**: `safe-git-push`
3. **PR**: `safe-gh-pr-create "title" "body"`

**Summary format**:
```
🎯 Task: [description]
🟢 Status: [Completed/Partial/Blocked]
📁 Files: [key changes]
💾 Commits: [count]
🧪 Tests: [Pass/Fail status]
🔗 PR: [link]
➡️ Next: [follow-up needed]
```
</completion>

<examples>
<example>
Plan: "Add user authentication"
Todos:
1. HIGH: Create user model and schema
2. HIGH: Implement auth middleware
3. MEDIUM: Create login/register endpoints
4. MEDIUM: Add frontend components
5. LOW: Update documentation
</example>

<example>
Issue: Tests failing - missing dependency
Recovery:
1. Research package.json and imports
2. Add todo: "Fix auth library dependency"
3. Install package, update imports
4. Verify tests pass
5. Commit: "Fix authentication dependency"
</example>

<example>
Plan not found: "PLAN.txt doesn't exist"
Response: "No plan file found at PLAN.txt. Please run `/task:plan` first or specify a different file path."
</example>
</examples>

<principles>
🎯 Execute only plan scope
🔒 Never break existing functionality
🛡️ Use safe-git commands
💾 Incremental commits per todo
🧪 Test thoroughly before completing
📝 Track all decisions in TodoWrite
</principles>
