---
description: "Create a comprehensive task execution plan with research and detailed implementation steps"
argument-hint: "[spec-file] (defaults to SPEC.md)"
model: "claude-opus-4-1-20250805"
---

# Task Planning Command

<role>
Senior software architect with specialized agent integration expertise. Ultrathink systematically through requirements to produce actionable execution plans leveraging parallel research capabilities.
</role>

<task>
Create detailed execution plan that transforms current system state into the target state defined in spec.

**Spec file**: $ARGUMENTS (defaults to `SPEC.md` if empty)
**Output**: Always write to `PLAN.md`

**Process**: Current state analysis → Gap identification → Transformation strategy
</task>

<validation>
- No arguments: Use `SPEC.md` as input, always output to `PLAN.md`
- Spec file doesn't exist: "Spec file not found at specified path"
- Spec file lacks target state definition: "Spec must define clear target system state"
- Current system analysis impossible: Request codebase context or constraints
</validation>

<research>
**Current State Analysis - Launch parallel Task agents**:

1. **System Architecture Analysis**: Analyze current codebase structure, patterns, conventions, existing components. Return architectural decisions, integration points, constraints.

2. **Technology Stack Assessment**: Research current dependencies, versions, configurations, build systems. Return technology choices, compatibility requirements, upgrade paths.

3. **Implementation Inventory**: Find existing similar features, reusable components, established patterns. Return locations, approaches to follow/avoid, integration strategies.

4. **Best Practices Research** (research-assistant): Investigate current best practices for transformation type and technology stack. Synthesize authoritative guidance with source attribution.

5. **Security Impact Analysis** (security-analyst): IF transformation involves auth/input/database/crypto/external APIs, analyze security implications of current→target state change.

**Target State Analysis**:
- Parse spec file for target system state definition
- Extract architectural requirements, behaviors, data models
- Identify validation criteria and success metrics
</research>

<analysis>
**Gap Analysis - Current vs Target State**:
Synthesize research findings to identify:
- **Architecture Gap**: How current structure differs from target state
- **Behavior Gap**: What behaviors need to change/be added/be removed
- **Data Gap**: Data model changes and migration requirements  
- **Integration Gap**: New/modified external connections
- **Performance Gap**: Performance characteristic changes needed
- **Security Gap**: Security model changes and implications

**Transformation Strategy**:
- Optimal transformation approach based on gap analysis and codebase patterns
- Integration points and dependencies for each change
- Risk assessment and mitigation strategies
- Success criteria and validation methods from spec
- Rollback and recovery considerations
</analysis>

<implementation-plan>
### Transformation Execution Plan

## Current State Snapshot
- **Architecture**: [Key aspects of current system architecture]
- **Key Components**: [Critical existing components that will be affected]
- **Data Structures**: [Current data models and storage]
- **Integration Points**: [Existing external connections]

## Target State Requirements (from spec)
- **Target Architecture**: [Desired end-state architecture]
- **Required Behaviors**: [New behaviors system must exhibit]
- **Target Data Model**: [Desired data structures and relationships]
- **Target Integrations**: [Required external connections]

## Transformation Steps
1. **Prerequisites**: [Dependencies, environment setup]
2. **Data Migration**: [Database/storage changes needed]
3. **Core Implementation**: [CREATE/MODIFY/DELETE with exact paths]
4. **Integration Updates**: [External system connection changes]
5. **Configuration Changes**: [Config files and settings]
6. **Testing Implementation**: [Test files and validation setup]
7. **Documentation Updates**: [When to call `/docs:update`]
8. **Final Verification**: [How to validate target state achieved]

## File Operation Details
```
[Specific file structure showing current → target changes]
src/
├── components/
│   ├── ExistingComponent.tsx    # MODIFY (what changes)
│   └── NewComponent.tsx         # CREATE (what it does)
└── utils/
    └── helpers.ts               # MODIFY (specific changes)
```

## Integration Strategy
- **Git Commit Points**: [When `/git:commit` should be called during execution]
- **Documentation Triggers**: [When implementation changes affect documented behavior]
- **Testing Validation**: [How to verify each transformation step]

## Success Validation
- **Architecture Validation**: [How to verify architectural transformation]
- **Behavior Validation**: [How to test new system behaviors match spec]
- **Integration Validation**: [How to verify external connections work]
- **Performance Validation**: [How to verify performance requirements met]

**Pre-execution validation**: Use code-reviewer agent to review transformation plan for architectural soundness and implementation feasibility.
</implementation-plan>

<examples>
**Example 1: Dark Mode Toggle Transformation**
```
Current State: Light theme only, no theme switching
Target State: Toggle between light/dark themes, persistent preference
Gap: Missing theme state management, UI toggle, persistence
Plan: Current analysis → Theme provider research → Implementation plan
```

**Example 2: API Rate Limiting Transformation**
```  
Current State: Unprotected API endpoints
Target State: Rate-limited endpoints with configurable limits
Gap: No rate limiting, no client identification, no limit storage
Plan: Current endpoint analysis → Rate limiting research → Transformation steps
```

**Example 3: User Authentication System**
```
Current State: No authentication, open endpoints
Target State: JWT-based auth with role-based access control
Gap: No user model, no auth middleware, no access control
Plan: Current security model analysis → Auth architecture research → Migration plan
```
</examples>

<output-requirements>
**Transformation Plan Output Format**:

# System Transformation Plan

## Executive Summary
- **Current State**: [Brief description of system as-is]
- **Target State**: [Brief description from spec]
- **Transformation Scope**: [What will change]

## [Include full implementation-plan sections as defined above]

**Plan Quality Standards**:
- **Unambiguous execution**: Another Claude can execute without clarification
- **Complete file mapping**: All affected files identified with exact paths
- **Clear validation**: Each step includes verification method
- **Integration aware**: Specifies when to call `/git:commit` and `/docs:update`
- **Risk aware**: Identifies potential issues and mitigation strategies

**Be specific**: Exact paths, precise commands, clear verification criteria.
**Focus on transformation**: How to get from current state to target state.
**Minimize code snippets**: Architecture and integration focus (5-10 line examples max).
</output-requirements>
