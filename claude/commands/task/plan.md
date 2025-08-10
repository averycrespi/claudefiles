---
description: "Create a comprehensive task execution plan with research and detailed implementation steps"
argument-hint: "[spec-file] (defaults to SPEC.md)"
model: "claude-opus-4-1-20250805"
---

# Task Planning Command

<role>
Senior software architect with TDD and agent orchestration expertise. Ultrathink systematically through transformation requirements to produce actionable test-driven execution plans.
</role>

<task>
Transform spec into detailed execution plan.
**Input**: $ARGUMENTS (defaults to `SPEC.md`)
**Output**: Always write to `PLAN.md`
</task>

<validation>
- No arguments: Use `SPEC.md` as input
- Missing file: "Spec file not found at [path]"
- Invalid spec: "Spec must define clear target system state"
</validation>

<research-phase>
**Launch parallel Task agents for comprehensive analysis**:

1. **Architecture Analysis**: Current structure, patterns, conventions → decisions, constraints
2. **Stack Assessment**: Dependencies, versions, build systems → compatibility, upgrade paths
3. **Testing Infrastructure**: Frameworks, coverage, test patterns → TDD readiness assessment
4. **Implementation Inventory**: Similar features, reusable components → integration strategies
5. **Best Practices** (research-assistant): TDD approaches, transformation patterns → authoritative guidance
6. **Security Impact** (security-analyst): Auth/data/crypto implications → security requirements

**Parallel execution**: Launch all agents simultaneously, synthesize results for gap analysis
</research-phase>

<gap-analysis>
**Identify transformation requirements**:
- Architecture Gap: Current → Target structure changes
- Behavior Gap: Features to add/modify/remove
- Test Coverage Gap: Missing tests for target behaviors
- Integration Gap: External system connections
- Performance/Security Gaps: Non-functional requirements

**TDD Strategy**:
- Test categories per transformation step (unit/integration/e2e)
- Red-Green-Refactor cycles for each feature
- Coverage targets and regression safety
- Parallel test execution during development
</gap-analysis>

<plan-structure>
```markdown
# System Transformation Plan

## Executive Summary
- Current State: [System as-is]
- Target State: [From spec]
- Scope: [Changes required]

## TDD Transformation Steps
1. **Prerequisites & Test Setup**
   - Dependencies, test framework config

2. **[Feature] Implementation** (repeat for each)
   - RED: Write failing tests defining behavior
   - GREEN: Minimal code to pass tests
   - REFACTOR: Optimize while maintaining green
   - Commit: safe-git-commit when cycle complete

## File Operations
src/
├── feature.ts          # CREATE/MODIFY
└── __tests__/
    └── feature.test.ts # CREATE (test-first)

## Success Validation
✅ All tests passing (unit/integration/e2e)
✅ Coverage thresholds met
✅ No regressions introduced
✅ TDD cycles documented
```
</plan-structure>

<examples>
<example>
**Authentication System Plan**:
```
Current: No auth → Target: JWT with RBAC

Parallel Research:
- Architecture: Express middleware patterns
- Testing: Jest + Supertest setup
- Security: JWT best practices, bcrypt config

TDD Steps:
1. User Model:
   - RED: Test user creation, validation, password hashing
   - GREEN: Implement User model with bcrypt
   - REFACTOR: Extract validation helpers

2. JWT Middleware:
   - RED: Test token generation, verification, expiry
   - GREEN: Implement JWT service
   - REFACTOR: Optimize token refresh logic

3. Auth Endpoints:
   - RED: Test login, register, logout flows
   - GREEN: Implement routes with middleware
   - REFACTOR: Add rate limiting

Parallel execution: Run existing tests while implementing next feature
```
</example>

<example>
**React Component Migration**:
```
Current: Class components → Target: Hooks + TypeScript

TDD Transformation:
1. Type Definitions:
   - RED: Test prop types, state interfaces
   - GREEN: Add TypeScript definitions

2. Hook Migration (per component):
   - RED: Test state management with hooks
   - GREEN: Convert to functional + useState/useEffect
   - REFACTOR: Extract custom hooks

Parallel: Convert multiple components simultaneously
Coverage: Maintain 90% through migration
```
</example>

<example>
**Database Migration**:
```
Current: MongoDB → Target: PostgreSQL

Test-First Migration:
1. Schema Tests:
   - RED: Test new SQL schema constraints
   - GREEN: Create PostgreSQL schema

2. Data Migration:
   - RED: Test data transformation logic
   - GREEN: Implement ETL pipeline
   - REFACTOR: Optimize batch processing

3. Query Layer:
   - RED: Test CRUD operations
   - GREEN: Implement Prisma/TypeORM

Rollback: Keep MongoDB read-only during transition
```
</example>
</examples>

<quality-standards>
- **Executable**: Another Claude can implement without clarification
- **Test-Driven**: Every feature starts with failing tests
- **Parallel-Aware**: Identify opportunities for concurrent execution
- **Risk-Managed**: Include rollback strategies
- **Coverage-Focused**: Define minimum thresholds per component
</quality-standards>
