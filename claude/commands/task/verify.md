---
description: "Validate final system state against original specification"
argument-hint: "[spec-file] (defaults to SPEC.md)"
model: "claude-opus-4-1-20250805"
---

# Task Verification Command

<role>
Senior QA engineer and system validation specialist. Ultrathink through comprehensive state validation to ensure target system matches specification requirements.
</role>

<task>
Validate that the current system state matches the target state defined in the specification.

**Spec file**: $ARGUMENTS (defaults to `SPEC.md` if empty)
**Output**: Generate comprehensive validation report in `VERIFICATION.md`
</task>

<validation>
- No arguments: Use `SPEC.md` as specification source
- Spec file doesn't exist: "Specification file not found at specified path"
- Spec lacks validation criteria: "Specification must define validation criteria for verification"
- System state unclear: Analyze current system before validation
</validation>

<verification-process>
## Phase 1: Specification Analysis
1. **Parse spec file** → extract target state requirements and validation criteria
2. **Identify validation points** → architecture, behaviors, data, integrations, performance, security
3. **Map verification methods** → determine how each aspect can be tested/validated

## Phase 2: Current State Assessment
1. **System architecture analysis** → examine current structure against target architecture
2. **Behavior verification** → test system behaviors against spec requirements
3. **Data state validation** → verify data models and structures match specification
4. **Integration validation** → test external connections and interfaces
5. **Performance validation** → measure system performance against spec criteria
6. **Security validation** → verify security model implementation

## Phase 3: Comprehensive Testing
**Automated verification** (where possible):
- Unit tests for core functionality
- Integration tests for system behaviors
- Performance benchmarks against spec metrics
- Security scans and vulnerability checks

**Manual verification** (where needed):
- User experience validation
- Visual interface compliance
- Workflow verification
- Edge case handling

## Phase 4: Gap Analysis
- **Compliance gaps** → aspects not matching specification
- **Missing features** → required functionality not implemented
- **Performance gaps** → metrics not meeting specification
- **Security gaps** → security requirements not met
- **Documentation gaps** → undocumented behaviors or changes
</verification-process>

<validation-categories>
**Architecture Validation**:
- Component structure matches spec architecture
- Integration points function as specified
- Data flow follows spec-defined patterns
- Scalability characteristics meet requirements

**Behavior Validation**:
- Core functionality works as specified
- User interactions match specified workflows
- Error handling follows spec requirements
- Business logic implements spec rules

**Data Validation**:
- Data models match specification structure
- Data relationships function correctly
- Data persistence works as specified
- Data migration (if applicable) completed successfully

**Integration Validation**:
- External API connections work as specified
- Third-party service integrations function correctly
- Authentication/authorization matches spec
- Data exchange formats comply with specification

**Performance Validation**:
- Response times meet spec requirements
- Throughput matches specified capacity
- Resource usage within specified limits
- Load handling meets specification

**Security Validation**:
- Authentication system matches spec security model
- Authorization controls function as specified
- Data protection meets spec requirements
- Vulnerability protections in place per spec
</validation-categories>

<output-requirements>
**VERIFICATION.md Format**:

# System Verification Report
**Specification**: [spec-file-path]
**Verification Date**: [timestamp]
**System State**: [current commit hash]

## Executive Summary
- **Overall Status**: [PASS/FAIL/PARTIAL]
- **Compliance Score**: [X/Y requirements met]
- **Critical Issues**: [count of blocking issues]
- **Recommendations**: [key actions needed]

## Detailed Validation Results

### ✅ Architecture Validation
- **Target**: [architecture requirement from spec]
- **Current**: [implemented architecture]
- **Status**: [PASS/FAIL]
- **Evidence**: [how verified]
- **Notes**: [any deviations or issues]

### ✅ Behavior Validation
- **Target**: [behavior requirement from spec]
- **Current**: [implemented behavior]
- **Status**: [PASS/FAIL]
- **Test Method**: [how behavior was verified]
- **Results**: [test outcomes]

### ✅ Data Validation
- **Target**: [data model from spec]
- **Current**: [implemented data model]
- **Status**: [PASS/FAIL]
- **Verification**: [how data structure was validated]

### ✅ Integration Validation
- **Target**: [integration requirement from spec]
- **Current**: [implemented integration]
- **Status**: [PASS/FAIL]
- **Testing**: [how integration was verified]

### ✅ Performance Validation
- **Target**: [performance criteria from spec]
- **Current**: [measured performance]
- **Status**: [PASS/FAIL]
- **Metrics**: [actual performance numbers]

### ✅ Security Validation
- **Target**: [security requirement from spec]
- **Current**: [implemented security]
- **Status**: [PASS/FAIL]
- **Verification**: [security validation method]

## Issues and Recommendations

### 🔴 Critical Issues (Must Fix)
1. [Issue description] - [Impact] - [Recommended fix]

### 🟡 Minor Issues (Should Fix)
1. [Issue description] - [Impact] - [Recommended fix]

### 📋 Recommendations
1. [Improvement suggestion] - [Rationale]

## Compliance Summary
- **Architecture**: [PASS/FAIL] - [X/Y criteria met]
- **Behavior**: [PASS/FAIL] - [X/Y criteria met]
- **Data**: [PASS/FAIL] - [X/Y criteria met]
- **Integration**: [PASS/FAIL] - [X/Y criteria met]
- **Performance**: [PASS/FAIL] - [X/Y criteria met]
- **Security**: [PASS/FAIL] - [X/Y criteria met]

**Overall System Compliance**: [PASS/FAIL] - [Total X/Y criteria met]

## Next Steps
- [Recommended actions based on validation results]
- [Priority order for addressing issues]
- [Follow-up validation needed]
</output-requirements>

<examples>
<example>
**Authentication System Verification**:
- **Architecture**: JWT middleware properly integrated ✅
- **Behavior**: Login/logout workflows function correctly ✅
- **Data**: User model matches spec requirements ✅
- **Integration**: Token validation with external services ⚠️ (minor timing issue)
- **Performance**: Auth response times under 200ms ✅
- **Security**: Password hashing and token expiration correct ✅
</example>

<example>
**API Rate Limiting Verification**:
- **Architecture**: Middleware properly positioned in request pipeline ✅
- **Behavior**: Rate limits enforced correctly ❌ (allows burst over limit)
- **Data**: Rate limit counters persistent across restarts ✅
- **Integration**: Redis connection stable ✅
- **Performance**: Minimal latency overhead ✅
- **Security**: Rate limit bypass protection ⚠️ (IP spoofing possible)
</example>

<example>
**Missing Spec File**:
Input: `/task:verify`
Response: "Specification file not found at SPEC.md. Please run `/task:spec` first or specify a different spec file path."

Input: `/task:verify custom-spec.md`
Response: "Specification file not found at custom-spec.md. Please verify the path or create the specification first."
</example>
</examples>

<integration>
**Tool Integration**:
- **Reference EXECUTION.md** to understand recent changes and their validation status
- **Complement `/task:exec`** by providing final validation of transformation success
- **Support planning** by identifying gaps that need addressing in future transformations

**Workflow Integration**:
```
/task:spec → SPEC.md (target state definition)
/task:plan → PLAN.md (transformation roadmap)
/task:exec → EXECUTION.md (implementation log)
/task:verify → VERIFICATION.md (final validation)
```
</integration>

<principles>
**Verification Principles**:
🎯 **Comprehensive coverage**: Validate all aspects defined in specification
🔍 **Evidence-based**: Provide concrete evidence for each validation result
⚖️ **Objective assessment**: Use measurable criteria where possible
🚨 **Clear severity**: Distinguish critical issues from minor concerns
📊 **Actionable results**: Provide specific recommendations for addressing issues
🔄 **Repeatable process**: Verification can be re-run as system evolves
📝 **Traceability**: Link validation results back to specific spec requirements
</principles>