---
description: "Create a comprehensive task execution plan"
argument-hint: "task description"
allowed-tools: ["Task", "Read", "Grep", "Bash", "WebSearch", "LS", "Glob", "Write", "mcp__context7__resolve-library-id", "mcp__context7__get-library-docs"]
---

# Comprehensive Task Planning Command

You are tasked with creating a **detailed execution plan** for: **$ARGUMENTS**

This command uses **ultrathink** methodology - employ extensive reasoning, research multiple approaches, and consider all implementation details.

## Instructions

Create a comprehensive plan that another Claude instance can execute successfully. You MUST:

1. **Output to PLAN.txt ONLY** - Do not modify any other files
2. **Research extensively** using subagents for parallel investigation
3. **Follow existing codebase patterns** and conventions
4. **Include specific implementation details** with file paths, code snippets, and resources

## Research Phase (Use Subagents)

Launch multiple Task agents in parallel to research:

### Agent 1: Codebase Structure Analysis
```
Task: "Analyze the current codebase structure, identifying:
- Main directories and their purposes
- Existing similar implementations or patterns
- Code style conventions (indentation, naming, imports)
- Testing patterns and frameworks used
- Build/deployment processes
- Return specific file paths and code examples"
```

### Agent 2: Dependencies & Technology Stack
```
Task: "Research the technology stack and dependencies:
- Package.json/requirements.txt/Cargo.toml analysis
- Existing libraries and frameworks in use
- Version constraints and compatibility requirements
- Development vs production dependencies
- Return specific dependency versions and usage patterns"
```

### Agent 3: Similar Feature Implementation
```
Task: "Find existing implementations of similar features:
- Search for related functionality already implemented
- Analyze how similar problems were solved
- Identify reusable components or utilities
- Document integration patterns
- Return specific code examples and file locations"
```

### Agent 4: External Research (if needed)
```
Task: "Research external resources and best practices:
- Current documentation for relevant technologies
- Community best practices and patterns
- Security considerations
- Performance optimization approaches
- Return links, examples, and specific recommendations"
```

## Analysis Phase

After subagent research, analyze all findings to:

1. **Synthesize research results** - Combine insights from all agents
2. **Identify the optimal approach** - Choose best implementation strategy
3. **Plan integration points** - How new code fits with existing systems
4. **Anticipate challenges** - Potential blockers and their solutions
5. **Define success criteria** - How to verify the implementation works

## Planning Phase

Create a detailed execution plan including:

### Implementation Steps
- [ ] **Step 1**: [Specific action with file paths]
- [ ] **Step 2**: [Next action with code snippets]
- [ ] **Step N**: [Final verification steps]

### File Structure Changes
```
project/
  src/
  components/             # New files to create
    NewComponent.tsx      # Specific example
  utils/                  # Files to modify
    helpers.ts            # Specific changes needed
  tests/                  # Test files to add
    NewComponent.test.ts  # Testing approach
```

### Code Snippets & Examples
Provide specific code examples following the codebase conventions:

```typescript
// Example implementation following project patterns
export const newFunction = (param: Type): ReturnType => {
  // Implementation details based on research
};
```

### Dependencies & Configuration
- **New dependencies to add**: `npm install package@version`
- **Configuration changes**: Specific file modifications needed
- **Environment variables**: Any new env vars required

### Testing Strategy
- **Unit tests**: Specific test files and test cases
- **Integration tests**: How to verify component integration
- **Manual testing**: Steps to validate functionality

### Deployment Considerations
- **Build process changes**: Any build script modifications
- **Database migrations**: If data changes are needed
- **Environment setup**: Production deployment considerations

## Quality Assurance

Ensure the plan includes:
- [ ] **Error handling** strategies
- [ ] **Security considerations**
- [ ] **Performance implications**
- [ ] **Accessibility requirements** (if UI changes)
- [ ] **Documentation updates** needed
- [ ] **Rollback procedures** if issues arise

## Execution Validation

The executing agent should be able to:
- [ ] Follow each step without ambiguity
- [ ] Find all referenced files and resources
- [ ] Understand the complete context
- [ ] Validate successful completion
- [ ] Handle expected edge cases

---

**Remember**: This plan will be executed by another Claude instance. Be extraordinarily specific about file paths, exact code changes, command sequences, and verification steps. Include everything needed for successful implementation.
