---
description: "Execute a task plan with progress tracking"
argument-hint: "[plan-file]"
allowed-tools: ["TodoWrite", "Read", "Edit", "MultiEdit", "Write", "Bash", "Grep", "LS", "Glob", "Task", "WebSearch", "mcp__context7__resolve-library-id", "mcp__context7__get-library-docs"]
---

# Task Execution Command

Execute a detailed plan from the specified file with systematic progress tracking.

## Execution Instructions

You will execute the plan created by `/task:plan`. Follow these steps:

### 1. Read and Parse the Plan

First, read the specified plan file to understand the complete task:

```
Read the plan file (argument: $ARGUMENTS) and analyze the implementation steps,
file structure changes, code examples, and validation criteria.
```

If no plan file is specified, default to `PLAN.txt`.

### 2. Create TodoWrite Items

Convert the plan's implementation steps into specific TodoWrite items:

- Break down each major step into actionable todos
- Set appropriate priorities (high/medium/low)
- Ensure each todo is specific and measurable
- Include verification steps as separate todos

### 3. Execute Systematically

Work through todos one at a time with incremental commits:

- Mark each todo as "in_progress" before starting
- Complete the specific task fully
- Verify the change works as expected
- Commit the change using `safe-git-commit "descriptive message"`
- Mark as "completed" only when fully done and committed
- Move to next todo

### 4. Follow Project Conventions

IMPORTANT: Always follow the project's established patterns:

#### Code Style
- Match existing indentation and formatting
- Follow established naming conventions
- Use the same import patterns as existing code
- Maintain consistency with project architecture

#### Testing
- Run existing test commands found in package.json or project docs
- Create tests following existing test patterns
- Verify all tests pass before marking tasks complete

### 5. Implementation Approach

For each implementation step:

1. **Understand the requirement** - Read the plan step carefully
2. **Analyze existing code** - Check how similar functionality is implemented
3. **Make the change** - Implement following project patterns
4. **Test the change** - Verify it works correctly
5. **Update documentation** - If required by the plan

### 6. Error Handling

If you encounter issues:

- **Document the problem** in TodoWrite as a new todo
- **Research solutions** using existing codebase patterns
- **Ask for clarification** if the plan is unclear
- **Adapt the approach** while maintaining the overall goal

### 7. Quality Verification

Before marking the overall task complete:

- [ ] All implementation steps completed
- [ ] Code follows project conventions
- [ ] Tests pass (if applicable)
- [ ] No console errors or warnings
- [ ] Documentation updated (if required)
- [ ] All changes committed incrementally using safe-git-commit

### 8. Push and Create Pull Request

Once all tasks are completed:

1. **Push changes**: Use `safe-git-push` to push all commits
2. **Create PR**: Use `safe-gh-pr-create "title" "body"` with:
   - **Title**: Summarize the implemented feature/task
   - **Body**: Include task summary, key changes, and testing notes

### 9. Final Reporting

Provide a concise summary:

```
## Execution Summary

**Task**: [Brief description]
**Status**: [Completed/Partial/Blocked]
**Files Modified**: [List of changed files]
**Commits**: [Number of incremental commits made]
**Tests**: [Pass/Fail/N/A]
**PR**: [Link to created pull request]
**Next Steps**: [If any remaining work]
```

---

## Argument Options

- **"plan-file.txt"**: Execute the complete plan from the specified file
- **No arguments**: Execute the complete plan from PLAN.txt (default)

## Important Notes

1. **Only execute what's in the plan** - Don't add extra features or changes
2. **Maintain backwards compatibility** - Don't break existing functionality
3. **Follow safe practices** - Use project's safe-git commands
4. **Commit incrementally** - Each completed todo should result in a commit
5. **Test thoroughly** - Verify changes work before committing and marking complete
6. **Document issues** - Track any problems or deviations in TodoWrite
7. **Complete the workflow** - Always push and create PR when all tasks are done

This systematic approach ensures reliable, traceable execution of complex tasks with proper git workflow, maintaining code quality and project standards.
