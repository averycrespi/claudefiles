---
description: "Create a comprehensive task execution plan with research and detailed implementation steps"
argument-hint: "task description or requirements"
model: "claude-opus-4-20250514"
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
Analyze project structure, existing patterns, code conventions, testing
frameworks, build processes. Return specific file paths, architectural
patterns currently in use, integration approaches.
```

**Agent 2: Technology Assessment**
```
Research dependencies, libraries, versions, configurations, compatibility.
Return package.json/requirements, specific versions, integration patterns.
```

**Agent 3: Implementation Research**
```
Find similar existing features, reusable components, integration points.
Return file locations, architectural patterns to follow or avoid, integration approaches.
```

**Agent 4: Best Practices Research**
```
Use subagent research-assistant:
Investigate current best practices, documentation, and authoritative guidance
for the specific technology stack and implementation approach. Synthesize
findings from multiple sources. Return specific recommendations, links,
implementation guidelines with source attribution.
```

**Security Analysis (conditional)**
```
IF task involves authentication, user input, database operations, 
cryptographic functions, or external integrations:

Use subagent security-analyst:
Analyze security implications of the planned implementation. Identify
potential vulnerabilities, security best practices, and recommend
secure coding patterns. Return security requirements and mitigation strategies.
```
</research>

<analysis>
**Think through findings to determine**:
- Optimal technical approach based on existing codebase
- Integration points and dependencies
- Potential challenges and mitigation strategies
- Success criteria and validation methods
- Security requirements and risk assessment (if security-analyst was invoked)
- Compliance with established security practices and OWASP guidelines
</analysis>

<implementation-plan>
### Step-by-Step Implementation
1. **File Operations**: [Specific actions with exact file paths - CREATE/MODIFY/DELETE]
2. **Configuration Changes**: [Config files to update and key settings]
3. **Dependencies**: [Packages to install/update with exact commands]
4. **Testing Strategy**: [Test files to create and validation commands]
5. **Verification Steps**: [How to confirm successful implementation]

### File Structure Changes
```
[Show directory structure with CREATE/MODIFY/DELETE annotations]
src/
├── components/
│   └── NewFeature.tsx     # CREATE: Main component
├── utils/
│   └── helpers.ts         # MODIFY: Add utility functions
└── __tests__/
    └── NewFeature.test.ts # CREATE: Test suite
```

### Key Implementation Notes
- **Architecture**: [High-level design decisions and patterns to follow]
- **Integration Points**: [How this connects with existing code]
- **Critical Configurations**: [Only essential config snippets, 2-3 lines max]

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

### Implementation Plan Review
**After creating the implementation plan, validate it using code-reviewer**:
```
Use subagent code-reviewer:
Review the proposed implementation plan for potential issues, architectural
concerns, and best practices. Analyze the planned file structure, integration
points, and implementation approach. Return recommendations for improving
the plan before execution.
```
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
1. CREATE: src/components/ThemeToggle.tsx (button component with icon)
2. MODIFY: src/styles/theme.ts (add darkTheme object)
3. MODIFY: src/App.tsx (add toggle to header)
4. CREATE: src/hooks/useTheme.ts (localStorage persistence)
5. TEST: Toggle functionality + theme switching

Key Implementation Notes:
- Architecture: Extend existing ThemeProvider pattern
- Integration: Hook into current styled-components setup
- Critical Config: Add `darkTheme = { ...lightTheme, colors: {...} }`
```
</examples>

<output-requirements>
**The plan must enable another Claude instance to**:
- Execute each step without ambiguity
- Locate all referenced files and dependencies
- Understand the complete technical context
- Validate successful implementation
- Handle expected edge cases and errors

**Be extraordinarily specific**: exact file paths, precise commands, and clear verification steps.

**Avoid extensive code blocks**: Focus on architectural decisions, file operations, and integration points. Include only minimal code snippets (5-10 lines max) for critical configurations or patterns. Let the execution phase handle detailed implementation.
</output-requirements>
