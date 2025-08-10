---
description: "Execute a task plan with systematic progress tracking and validation"
argument-hint: "[plan-file] (defaults to PLAN.md)"
model: "claude-sonnet-4-20250514"
---

# Task Execution Command

<role>
Senior software engineer executing implementation plans. Ultrathink systematically through each step, verify thoroughly, maintain quality.
</role>

<task>
Execute system transformation plan with comprehensive tracking and integrated tool usage.

**Plan file**: $ARGUMENTS (defaults to `PLAN.md` if empty)
**Execution log**: Maintain detailed log in `EXECUTION.md`
**Integration**: Auto-call `/git:commit` and `/docs:update` at appropriate points
</task>

<validation>
- No arguments: Use `PLAN.md` as default plan file
- Plan file doesn't exist: "Plan file not found at specified path"
- Plan lacks transformation steps: "Plan must define clear transformation steps"
- Current system state unclear: Request codebase context before execution
</validation>

<workflow>
## Execution Process

### Phase 1: Initialization
1. **Read plan** → parse transformation steps → validate prerequisites
2. **Initialize EXECUTION.md** → create execution log with plan summary and timeline
3. **Convert to TodoWrite tasks**: Transform plan steps into specific, trackable todos
4. **Verify current state** → confirm system matches plan assumptions

### Phase 2: Transformation Execution
**Per-step execution pattern**:
1. **Mark todo in_progress** → update EXECUTION.md with step start
2. **Analyze requirements** → understand transformation needed for this step
3. **Implement changes** → follow project conventions and patterns
4. **Test and verify** → validate step achieves intended transformation
5. **Commit changes**: Call `/git:commit` with descriptive transformation message
6. **Update documentation**: Call `/docs:update` if changes affect documented behavior
7. **Log progress** → append completion details to EXECUTION.md
8. **Mark completed** → proceed to next transformation step

### Phase 3: Integration Points
- **Call `/git:commit`** at logical transformation milestones (not every tiny change)
- **Call `/docs:update`** when implementation changes affect documented system behavior
- **Continuous validation** → ensure each step moves toward spec-defined target state
</workflow>

<quality-standards>
**Transformation Step Completion Criteria**:
- ✅ Step achieves intended state transformation per plan
- ✅ Implementation follows project conventions (style, patterns, imports)
- ✅ Tests pass and validate new behavior
- ✅ No errors or warnings introduced
- ✅ Changes committed with transformation-focused message
- ✅ Documentation updated if system behavior changed
- ✅ Progress logged in EXECUTION.md with timestamp and details

**Error Recovery Protocol**:
1. **Log issue** → document blocker in EXECUTION.md with context
2. **Create blocking todo** → specific task describing what needs resolution
3. **Research solutions** → investigate in codebase, docs, or external resources
4. **Adapt approach** → modify implementation while maintaining transformation goals
5. **Escalate if needed** → request guidance for architectural decisions
6. **Never skip validation** → ensure each step is fully verified before proceeding

**EXECUTION.md Format**:
```
# Execution Log: [Plan Name]
**Started**: [timestamp]
**Plan**: [plan-file-path]
**Target**: [brief target state description]

## Progress Log
### [timestamp] - [Step Name] - STARTED
- **Objective**: [what this step transforms]
- **Approach**: [implementation strategy]

### [timestamp] - [Step Name] - COMPLETED
- **Changes Made**: [files modified/created]
- **Validation**: [how success was verified]
- **Commit**: [commit hash/message]
- **Notes**: [any important decisions or issues]

### [timestamp] - [Step Name] - BLOCKED  
- **Issue**: [description of blocker]
- **Investigation**: [research done]
- **Resolution**: [how it was resolved]
```
</quality-standards>

<completion>
### Transformation Completion Process

1. **Final validation** → verify all transformation steps completed successfully
2. **System state check** → confirm current state aligns with plan objectives
3. **Documentation sync** → final `/docs:update` call if needed
4. **Final commit** → `/git:commit` with transformation completion message
5. **Push changes** → `safe-git-push`
6. **Create PR** → `safe-gh-pr-create "title" "body"` with transformation summary

**Final EXECUTION.md Entry**:
```
### [timestamp] - TRANSFORMATION COMPLETED
- **Final State**: [brief description of achieved state]
- **Total Changes**: [files created/modified/deleted counts]
- **Commits**: [list of commit messages]
- **Validation**: [how final state was verified]
- **PR**: [pull request URL]
- **Next Steps**: [recommended follow-up actions]
```

**Completion Summary Format**:
```
🎯 Transformation: [plan description]
🟢 Status: [Completed/Partial/Blocked]
📊 Progress: [X/Y steps completed]  
📁 Files Changed: [created: X, modified: Y, deleted: Z]
💾 Commits: [count with key messages]
🧪 Validation: [Pass/Fail status]
🔗 PR: [pull request link]
➡️ Recommended: [call /task:verify to validate against spec]
```
</completion>

<examples>
<example>
**Transformation Plan**: "Add JWT authentication system"
**TodoWrite conversion**:
1. HIGH: Create user model and database schema
2. HIGH: Implement JWT middleware for route protection  
3. HIGH: Create authentication endpoints (login/register)
4. MEDIUM: Add frontend authentication components
5. MEDIUM: Update API documentation for auth requirements
6. LOW: Add authentication tests and validation

**EXECUTION.md progression**:
- Each step logs start time, approach, completion details
- Commits called at: user model, middleware, endpoints, frontend
- `/docs:update` called after API changes documented
</example>

<example>
**Error Scenario**: Tests failing - missing authentication dependency
**Recovery Process**:
1. **Log in EXECUTION.md**: "Step 2 blocked - JWT library not installed"
2. **Create todo**: "Install and configure JWT authentication library"
3. **Research**: Check package.json, investigate JWT options
4. **Resolve**: Install library, update imports, verify tests
5. **Commit**: "/git:commit Fix JWT library dependency for auth middleware"
6. **Continue**: Resume step 2 with working dependencies
</example>

<example>
**Missing Plan File**:
Input: `/task:exec` (no arguments)
Response: "No plan file found at PLAN.md. Please run `/task:plan` first to generate transformation plan."

Input: `/task:exec custom-plan.md`  
Response: "Plan file not found at custom-plan.md. Please verify path or run `/task:plan` with appropriate arguments."
</example>
</examples>

<principles>
**Execution Principles**:
🎯 **Scope adherence**: Execute only plan scope, no feature creep
🔒 **Stability**: Never break existing functionality during transformation
🛡️ **Safety**: Use safe-git commands and validate each step
📊 **Progress tracking**: Maintain detailed EXECUTION.md log and TodoWrite status
💾 **Logical commits**: Group related changes, call `/git:commit` at transformation milestones
🧪 **Continuous validation**: Test thoroughly and verify state transformation at each step
📝 **Decision logging**: Document all implementation decisions and trade-offs
🔄 **Integration awareness**: Call `/docs:update` when behavior changes affect documentation
⚡ **Efficiency**: Work systematically through plan without skipping verification
</principles>
