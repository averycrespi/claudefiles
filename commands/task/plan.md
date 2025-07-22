---
description: "Create a comprehensive task execution plan"
argument-hint: "task description"
allowed-tools: ["Task", "Read", "Grep", "Bash", "WebSearch", "LS", "Glob", "Write", "mcp__context7__resolve-library-id", "mcp__context7__get-library-docs"]
---

# Task Planning Command

- **Task**: Create detailed execution plan for **$ARGUMENTS**
- **Method**: Ultrathink methodology - extensive reasoning, multiple approaches, comprehensive details
- **Output**: Write complete plan to `PLAN.txt` only

## Input Validation

**Argument Check**:
- If `$ARGUMENTS` is empty/unclear → Request specific task description
- If task is too broad → Ask for scope clarification
- If context needed → Prompt for additional requirements

## Core Requirements

- 🔍 **Research extensively** using parallel Task agents
- 📋 **Follow existing patterns** and codebase conventions
- 🎯 **Include specifics**: file paths, code snippets, commands
- 🤖 **Enable execution** by another Claude instance
- 🧠 **Apply ultrathink**: Consider multiple approaches and edge cases

## Research Phase

**Launch parallel Task agents** to gather information:

**Agent 1: Codebase Analysis**
```
Analyze project structure: directories, existing patterns, code style,
testing frameworks, build processes. Return file paths and examples.
```

**Agent 2: Tech Stack**
```
Research dependencies, libraries, version constraints, dev/prod configs.
Return specific versions and usage patterns.
```

**Agent 3: Similar Features**
```
Find existing implementations of related functionality. Identify reusable
components and integration patterns. Return code examples and locations.
```

**Agent 4: External Resources** *(if needed)*
```
Research current docs, best practices, security considerations, performance
optimizations. Return links and specific recommendations.
```

## Analysis Phase

**Synthesize findings** and determine:

- 🎯 **Optimal approach** based on research
- 🔗 **Integration points** with existing systems
- ⚠️ **Potential challenges** and solutions
- ✅ **Success criteria** for verification

## Execution Plan

### Implementation Steps
```
□ Step 1: [Action with file paths]
□ Step 2: [Action with code snippets]
□ Step N: [Verification]
```

### File Changes
```
project/
├── src/components/
│   └── NewComponent.tsx    # Create
├── utils/
│   └── helpers.ts          # Modify
└── tests/
    └── Component.test.ts   # Add
```

### Code Examples
```typescript
// Following project patterns
export const newFunction = (param: Type): ReturnType => {
  // Implementation based on research
};
```

### Dependencies
- **Install**: `npm install package@version`
- **Config**: [Specific file changes]
- **Env vars**: [New variables needed]

### Testing
- **Unit**: [Test files and cases]
- **Integration**: [Component verification]
- **Manual**: [Validation steps]

### Deployment
- **Build**: [Script modifications]
- **Data**: [Migration requirements]
- **Environment**: [Production setup]

## Quality Checklist

- ⚠️ **Error handling** strategies
- 🔒 **Security** considerations
- ⚡ **Performance** implications
- ♿ **Accessibility** (if UI changes)
- 📚 **Documentation** updates
- 🔄 **Rollback** procedures

## Validation Requirements

Ensure the executing agent can:
- 📍 Follow each step without ambiguity
- 📁 Find all referenced files and resources
- 🧠 Understand complete context
- ✅ Validate successful completion
- 🛡️ Handle expected edge cases

---

**Note**: Be extraordinarily specific about file paths, exact changes, commands, and verification steps for successful execution by another Claude instance.
