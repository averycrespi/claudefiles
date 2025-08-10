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

3. **Testing Infrastructure Analysis**: Research current testing setup including frameworks, test runners, coverage tools, test organization patterns. Return testing conventions, test types in use, coverage levels, test execution workflows.

4. **Implementation Inventory**: Find existing similar features, reusable components, established patterns. Return locations, approaches to follow/avoid, integration strategies.

5. **Best Practices Research** (research-assistant): Investigate current best practices for transformation type and technology stack, including TDD approaches and testing methodologies. Synthesize authoritative guidance with source attribution.

6. **Security Impact Analysis** (security-analyst): IF transformation involves auth/input/database/crypto/external APIs, analyze security implications of current→target state change.

**Target State Analysis**:
- Parse spec file for target system state definition
- Extract architectural requirements, behaviors, data models
- Identify validation criteria and success metrics
- Map target behaviors to testable requirements
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
- **Test Coverage Gap**: Missing tests for target behaviors, inadequate test types, uncovered edge cases
- **Test Architecture Gap**: Testing infrastructure needs, test organization improvements, TDD readiness

**Test-Driven Development Strategy**:
- **Test Planning**: Define test categories (unit, integration, e2e) and coverage targets for each transformation step
- **TDD Methodology**: Apply Red-Green-Refactor cycle systematically - write failing tests first, implement minimal passing code, then refactor
- **Test Organization**: Structure test files to mirror source organization and follow project testing conventions
- **Test Execution Flow**: Run tests continuously during development with clear failure handling protocols
- **Coverage Requirements**: Establish minimum coverage thresholds and validate test quality over quantity
- **Regression Safety**: Ensure new tests don't break existing functionality and all tests pass before commits

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

## Test-Driven Transformation Steps
Each step follows the Red-Green-Refactor TDD cycle:

1. **Prerequisites & Test Setup**: 
   - [Dependencies, environment setup]
   - [Testing framework configuration and test directory structure]

2. **Data Migration (TDD)**:
   - **Red**: Write failing tests for data model changes and migration
   - **Green**: Implement minimal database/storage changes to pass tests
   - **Refactor**: Optimize data structures while keeping tests green

3. **Core Implementation (TDD)**:
   - **Red**: Write failing tests for each new behavior from spec
   - **Green**: Implement minimal code to make tests pass [CREATE/MODIFY/DELETE with exact paths]
   - **Refactor**: Improve code quality and design while maintaining green tests

4. **Integration Updates (TDD)**:
   - **Red**: Write failing integration tests for external system connections
   - **Green**: Implement minimal integration code to pass tests
   - **Refactor**: Optimize integration patterns while keeping tests green

5. **Configuration Changes (TDD)**:
   - **Red**: Write tests validating configuration behavior
   - **Green**: Update config files and settings to pass tests
   - **Refactor**: Clean up configuration structure

6. **Documentation Updates**: [When to call `/docs:update`]
7. **Final Verification**: [Validate all tests pass and target state achieved]

## File Operation Details
```
[Specific file structure showing current → target changes with test files]
src/
├── components/
│   ├── ExistingComponent.tsx       # MODIFY (what changes)
│   └── NewComponent.tsx            # CREATE (what it does)
├── utils/
│   └── helpers.ts                  # MODIFY (specific changes)
└── __tests__/                      # Test directory structure
    ├── components/
    │   ├── ExistingComponent.test.tsx  # CREATE/MODIFY (test changes)
    │   └── NewComponent.test.tsx       # CREATE (test coverage)
    └── utils/
        └── helpers.test.ts             # CREATE/MODIFY (utility tests)
```

## Test File Mapping Strategy
- **Unit Tests**: Each source file has corresponding `.test.{ext}` file
- **Integration Tests**: Cross-component interactions in `__tests__/integration/`
- **Test Organization**: Mirror source directory structure in test directories
- **Naming Conventions**: Follow project testing patterns (`.test.`, `.spec.`, etc.)
- **Coverage Goals**: Aim for comprehensive test coverage of new/modified behaviors

## Integration Strategy
- **Test-Driven Commit Points**: Call `/git:commit` only after completing full Red-Green-Refactor cycles with all tests passing
- **Test Execution Checkpoints**: Run test suite at each phase transition (Red→Green, Green→Refactor, before commits)
- **Test Failure Protocols**: Handle failing tests by debugging, not by skipping or removing tests
- **Documentation Triggers**: Call `/docs:update` when implementation changes affect documented behavior or add new testable features
- **Continuous Testing**: Maintain green test suite throughout transformation - never commit broken tests
- **Coverage Validation**: Verify test coverage meets minimum thresholds before marking steps complete

## Success Validation
- **Architecture Validation**: [How to verify architectural transformation] + Test architecture supports maintainable testing
- **Behavior Validation**: [How to test new system behaviors match spec] + All behavior tests pass with comprehensive coverage
- **Test Suite Validation**: Complete test suite passes with no failures, coverage meets minimum thresholds, tests execute efficiently
- **Integration Validation**: [How to verify external connections work] + Integration tests validate external system interactions
- **Performance Validation**: [How to verify performance requirements met] + Performance tests validate response times and throughput
- **Regression Validation**: All existing tests continue to pass, no breaking changes introduced, backward compatibility maintained
- **TDD Compliance**: Each feature implemented through Red-Green-Refactor cycle, tests written before implementation, comprehensive test coverage achieved

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
