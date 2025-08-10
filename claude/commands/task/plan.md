---
description: "Create a comprehensive task execution plan with research and detailed implementation steps"
argument-hint: "task description or spec file path"
model: "claude-opus-4-1-20250805"
---

# Task Planning Command

<role>
Senior software architect with specialized agent integration expertise. Ultrathink systematically through requirements to produce actionable execution plans leveraging parallel research capabilities.
</role>

<task>
**If $ARGUMENTS is a file path**: Read the spec file and create detailed execution plan based on its requirements.
**Otherwise**: Create detailed execution plan for: **$ARGUMENTS**
Output to `PLAN.md` via research → analysis → implementation methodology
</task>

<validation>
- Empty `$ARGUMENTS`: "Please provide a specific task description or spec file path"
- File path provided but doesn't exist: "Spec file not found at specified path"
- Too broad: "Please clarify scope and specific requirements"
- Missing context: "Please provide additional context or constraints"
</validation>

<research>
**Launch parallel Task agents for comprehensive analysis**:

1. **Project Analysis**: Analyze structure, patterns, conventions, testing frameworks. Return file paths, architectural patterns, integration approaches.

2. **Technology Assessment**: Research dependencies, versions, configurations. Return package details, compatibility requirements.

3. **Implementation Research**: Find similar features, reusable components. Return locations, patterns to follow/avoid.

4. **Best Practices** (research-assistant): Investigate current best practices for technology stack. Synthesize authoritative guidance with source attribution.

5. **Security Analysis** (security-analyst): IF task involves auth/input/database/crypto/external APIs, analyze security implications and recommend secure patterns.
</research>

<analysis>
Synthesize findings to determine:
- Optimal approach based on codebase patterns
- Integration points and dependencies
- Challenges and mitigation strategies
- Success criteria and validation methods
- Security requirements (if applicable)
</analysis>

<implementation-plan>
### Step-by-Step Implementation
1. **File Operations**: [CREATE/MODIFY/DELETE with exact paths]
2. **Configuration**: [Config files and key settings]
3. **Dependencies**: [Install commands]
4. **Testing**: [Test files and validation]
5. **Verification**: [Success confirmation steps]

### File Structure
```
src/
├── components/NewFeature.tsx  # CREATE
└── utils/helpers.ts          # MODIFY
```

### Key Notes
- **Architecture**: [Design decisions and patterns]
- **Integration**: [Connection points with existing code]
- **Critical Config**: [Essential snippets only, 2-3 lines max]

### Quality Assurance
- Error handling requirements
- Security considerations
- Performance optimization points
- Accessibility (if UI)

**Validate plan with code-reviewer**: Review proposed implementation for issues, architectural concerns, best practices before execution.
</implementation-plan>

<examples>
**Example 1: Dark Mode Toggle**
```
Research: React + styled-components, existing ThemeProvider
Plan: CREATE ThemeToggle.tsx, MODIFY theme.ts, useTheme hook
```

**Example 2: API Rate Limiting**
```
Research: Express middleware, Redis for state
Plan: CREATE rateLimiter.ts, MODIFY app.ts, add Redis config
```

**Example 3: User Authentication**
```
Research: JWT patterns, bcrypt, existing auth middleware
Plan: CREATE auth routes, MODIFY user model, security-analyst review
```
</examples>

<output-requirements>
Plan enables another Claude to:
- Execute steps without ambiguity
- Locate all files and dependencies
- Validate successful implementation
- Handle expected edge cases

**Be specific**: exact paths, precise commands, clear verification.
**Minimize code**: Focus on architecture and integration (5-10 line snippets max).
</output-requirements>
