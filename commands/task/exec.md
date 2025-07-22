---
description: "Execute a task plan with progress tracking"
argument-hint: "[plan-file]"
allowed-tools: ["TodoWrite", "Read", "Edit", "MultiEdit", "Write", "Bash", "Grep", "LS", "Glob", "Task", "WebSearch", "mcp__context7__resolve-library-id", "mcp__context7__get-library-docs"]
---

# Task Execution Command

- **Method**: Ultrathink execution - systematic, thorough, validated implementation
- **Source**: Execute plan from `$ARGUMENTS` (default: `PLAN.txt`)
- **Process**: Read → Plan → Execute → Verify → Commit → Complete

## Execution Workflow

### 1. Plan Analysis
**Read plan file** → **Analyze steps** → **Validate completeness**

### 2. Task Breakdown
**Convert to TodoWrite items**:
- 🎯 Specific, measurable actions
- 📅 Appropriate priorities (high/medium/low)
- ✅ Include verification steps
- 🔄 Incremental progression

### 3. Systematic Execution
**Per todo**: `in_progress` → **implement** → **verify** → **commit** → `completed`

**Pattern**:
```
1. Mark todo in_progress
2. Implement changes fully
3. Test/verify functionality
4. Commit: safe-git-commit "descriptive message"
5. Mark completed
6. Next todo
```

## Implementation Standards

### Code Conventions
- 🎨 **Match existing**: indentation, naming, imports, architecture
- 🧪 **Test patterns**: Follow project testing approaches
- ✅ **Verify**: All tests pass before completion

### Per-Step Process
1. 📝 **Understand** requirement clearly
2. 🔍 **Analyze** existing similar implementations
3. ⚙️ **Implement** following project patterns
4. 🧪 **Test** and verify functionality
5. 📚 **Document** if required by plan

## Error Handling
**Issue encountered** → **Document in TodoWrite** → **Research patterns** → **Adapt approach**

## Quality Gate
- ✅ All steps completed
- 🎨 Follows project conventions
- 🧪 Tests pass
- ⚠️ No console errors
- 📚 Documentation updated
- 💾 All changes committed incrementally

## Completion Workflow

### Push & PR
1. **Push**: `safe-git-push`
2. **Create PR**: `safe-gh-pr-create "title" "body"`
   - Title: Feature/task summary
   - Body: Task overview, changes, testing notes

### Summary Report
```
🎯 **Task**: [Description]
🟢 **Status**: [Completed/Partial/Blocked]
📁 **Files**: [Modified files]
💾 **Commits**: [Count]
🧪 **Tests**: [Pass/Fail/N/A]
🔗 **PR**: [Link]
➡️ **Next**: [Remaining work]
```

---

## Arguments
- **File specified**: Execute from `$ARGUMENTS`
- **Default**: Execute from `PLAN.txt`

## Key Principles

⚠️ **Scope**: Execute only what's in the plan
🔒 **Compatibility**: Don't break existing functionality
🛡️ **Safety**: Use project's safe-git commands
💾 **Incremental**: Each todo → commit
🧪 **Quality**: Test before committing
📝 **Tracking**: Document all issues in TodoWrite
🔄 **Complete**: Always push and create PR

**Result**: Reliable, traceable execution maintaining code quality and project standards.
