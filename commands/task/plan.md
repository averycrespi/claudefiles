---
description: "Create a comprehensive task execution plan with research and detailed implementation steps"
argument-hint: "task description or requirements"
---

# Task Planning Command

<role>
You are a senior software architect tasked with creating comprehensive execution plans. You ultrathink step-by-step through complex requirements and produce actionable, detailed plans.
</role>

<task>
**Objective**: Create detailed execution plan for: **$ARGUMENTS**
**Output**: Write complete plan to `PLAN.txt`
**Method**: Systematic research → analysis → detailed implementation plan
</task>

<validation>
**Argument Requirements**:
- If `$ARGUMENTS` is empty: "Please provide a specific task description"
- If task is too broad: "Please clarify the scope and specific requirements"
- If context is missing: "Please provide additional context or constraints"
</validation>

<research>
**Launch parallel Task agents** to gather comprehensive information:

**Agent 1: Project Analysis**
```
Analyze: project structure, existing patterns, code conventions, testing
frameworks, build processes. Return: specific file paths, code examples,
architectural patterns currently in use.
```

**Agent 2: Technology Assessment**
```
Research: dependencies, libraries, versions, configurations, compatibility.
Return: package.json/requirements, specific versions, integration patterns.
```

**Agent 3: Implementation Research**
```
Find: similar existing features, reusable components, integration points.
Return: code examples, file locations, patterns to follow or avoid.
```

**Agent 4: Best Practices** *(if external research needed)*
```
Research: current documentation, security practices, performance patterns.
Return: specific recommendations, links, implementation guidelines.
```
</research>

<analysis>
**Think through findings to determine**:
- Optimal technical approach based on existing codebase
- Integration points and dependencies
- Potential challenges and mitigation strategies
- Success criteria and validation methods
</analysis>

<implementation-plan>
### Step-by-Step Implementation
```
1. [Specific action with exact file paths]
2. [Configuration changes with code snippets]
3. [Testing implementation with commands]
4. [Validation and verification steps]
```

### File Structure Changes
```
[Show exact directory structure and changes]
src/
├── components/
│   └── NewFeature.tsx     # CREATE: Main component
├── utils/
│   └── helpers.ts         # MODIFY: Add utility functions
└── __tests__/
    └── NewFeature.test.ts # CREATE: Test suite
```

### Code Implementation
```typescript
// Example following project patterns
[Include specific code examples that match existing conventions]
```

### Dependencies & Configuration
- **Install**: [Exact commands]
- **Config files**: [Specific changes]
- **Environment**: [New variables/settings]

### Testing Strategy
- **Unit tests**: [Specific test files and scenarios]
- **Integration**: [Component interaction tests]
- **Manual verification**: [Step-by-step validation]

### Quality Assurance
- Error handling implementation
- Security consideration checklist
- Performance optimization points
- Accessibility requirements (if UI)
- Documentation requirements
</implementation-plan>

<examples>
**Example Planning Output Structure**:
```
Task: Add dark mode toggle to application

Research Findings:
- Project uses React with styled-components
- Existing theme system in src/styles/theme.ts
- Components use ThemeProvider pattern

Implementation:
1. CREATE: src/components/ThemeToggle.tsx
2. MODIFY: src/styles/theme.ts (add dark theme)
3. MODIFY: src/App.tsx (add toggle component)
4. CREATE: src/hooks/useTheme.ts (theme persistence)
5. TEST: Manual verification + unit tests

[... detailed code examples and file changes ...]
```
</examples>

<output-requirements>
**The plan must enable another Claude instance to**:
- Execute each step without ambiguity
- Locate all referenced files and dependencies
- Understand the complete technical context
- Validate successful implementation
- Handle expected edge cases and errors

**Be extraordinarily specific**: exact file paths, complete code snippets, precise commands, and clear verification steps.
</output-requirements>
