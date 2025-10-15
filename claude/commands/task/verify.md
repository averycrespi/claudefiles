---
description: "Validate final system state against original specification"
argument-hint: "[spec-file] (defaults to SPEC.md)"
---

# Task Verification Command

<role>
Senior QA engineer with system validation expertise. Ultrathink systematically through verification, comparing current state against specification requirements.
</role>

<task>
Validate system state matches specification.
**Input**: $ARGUMENTS (defaults to `SPEC.md`)
**Output**: Write validation report to `VERIFICATION.md`
</task>

<validation>
- No arguments: Use `SPEC.md` as source
- Missing file: "Specification file not found at [path]"
- Invalid spec: "Specification must define validation criteria"
</validation>

<verification-workflow>
**Phase 1: Parse & Analyze** (parallel)
- Parse spec for requirements and validation criteria
- Read EXECUTION.md for recent changes context
- Identify testable components

**Phase 2: Validate** (parallel where possible)
1. **Architecture**: Structure matches spec?
2. **Behavior**: Functions work as specified?
3. **Data**: Models/persistence correct?
4. **Integration**: External connections work?
5. **Performance**: Meets latency/throughput targets?
6. **Security**: Access control implemented?
7. **Tests**: All tests passing, coverage adequate?

**Phase 3: Report**
- Compile results into VERIFICATION.md
- Categorize issues: Critical/Minor/Recommendations
- Calculate compliance score
</verification-workflow>

<parallel-execution>
Run simultaneously:
- Multiple test suites (unit, integration, e2e)
- Performance benchmarks while checking functionality
- Security scans alongside behavior tests
- Documentation review during validation
</parallel-execution>

<report-format>
```markdown
# System Verification Report
**Spec**: [file-path]
**Date**: [timestamp]
**Commit**: [hash]

## Executive Summary
- Overall: [PASS/FAIL/PARTIAL]
- Score: [X/Y requirements met]
- Critical Issues: [count]

## Validation Results
### ✅ [Category]
- Target: [spec requirement]
- Current: [actual state]
- Status: [PASS/FAIL]
- Evidence: [how verified]

## Issues
### 🔴 Critical (Must Fix)
1. [Issue] - [Impact] - [Fix]

### 🟡 Minor (Should Fix)
1. [Issue] - [Impact] - [Fix]

## Compliance
- Architecture: [X/Y met]
- Behavior: [X/Y met]
- Performance: [X/Y met]
- Security: [X/Y met]
Total: [X/Y met]
```
</report-format>

<examples>
<example>
**JWT Auth Verification**:
```
Parallel validation:
- Run auth integration tests
- Benchmark token generation time
- Scan for JWT vulnerabilities
- Test role-based access

Results:
✅ Architecture: Middleware correctly positioned
✅ Behavior: Login/logout/refresh working
⚠️ Performance: Token generation 250ms (spec: <200ms)
✅ Security: Proper expiry and signatures
```
<reasoning>Parallel execution saves time, performance issue found</reasoning>
</example>

<example>
**Database Migration Verification**:
```
Spec: MongoDB → PostgreSQL with zero data loss

Validation approach:
1. Count records in both databases
2. Sample data integrity checks
3. Test all CRUD operations
4. Verify relationships maintained

Critical Issue: 5% of embedded documents lost relationships
Fix: Re-run migration with relationship mapping
```
<reasoning>Data integrity is critical, sampling finds issues faster</reasoning>
</example>

<example>
**API Rate Limiting**:
```
Parallel tests:
- Burst traffic simulation
- Distributed attack simulation
- Per-user limit validation
- Recovery time testing

FAIL: Allows 150 requests in burst (spec: max 100)
Fix: Adjust token bucket algorithm parameters
```
<reasoning>Parallel simulations reveal edge cases</reasoning>
</example>

<example>
**TDD Compliance Check**:
```
Verify test-first development:
- Check test file timestamps vs implementation
- Validate coverage (spec: >80%)
- Review test quality (not just coverage)

Coverage: 85% ✅
Test-first: 12/15 features ⚠️
Quality: Good isolation, missing edge cases
```
<reasoning>TDD compliance ensures maintainability</reasoning>
</example>

<example>
**Performance Regression**:
```
Spec: <100ms response for all endpoints

Parallel benchmarks:
- Load test all endpoints simultaneously
- Monitor resource usage
- Profile slow queries

Results: 3 endpoints >100ms after recent changes
Root cause: Missing database indexes
```
<reasoning>Parallel load testing finds bottlenecks efficiently</reasoning>
</example>
</examples>

<principles>
- **Evidence-based**: Every result needs proof
- **Parallel validation**: Test multiple aspects simultaneously
- **Actionable feedback**: Include specific fixes
- **Severity clarity**: Distinguish critical from minor
- **Continuous**: Can re-run as system evolves
</principles>
