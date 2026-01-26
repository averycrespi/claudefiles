# Parallel Reviews Design

Improve the executing-plans skill by running spec and code reviews in parallel, with structured outputs and robust error handling.

## Current State

The executing-plans skill runs reviews sequentially:

```
Implement → Commit → Spec Review (wait) → Code Review (wait) → Next Task
```

Each review is a blocking subagent call. The code reviewer runs only after spec review passes.

### Problems

1. **Slow** - Reviews run sequentially, doubling wall-clock time
2. **Wasted context** - Both reviewers read the diff independently
3. **Fragile parsing** - Plain text outputs with string prefix matching
4. **Limited data** - Reviewers get minimal context, run git commands themselves
5. **No merge strategy** - Can't combine findings from multiple reviewers

## Proposed Design

### Parallel Review Execution

Run both reviews simultaneously using background tasks:

```
Implement → Commit → [Spec Review ║ Code Review] → Merge Results → Next Task
```

**Benefits:**
- ~50% reduction in review wall-clock time
- Both reviews see the same code state
- Issues from both domains collected upfront

**Implementation:**

```javascript
// Launch both reviews in background
const specTask = Task({
  subagent_type: 'general-purpose',
  prompt: specReviewPrompt,
  run_in_background: true
});

const codeTask = Task({
  subagent_type: 'code-reviewer',
  prompt: codeReviewPrompt,
  run_in_background: true
});

// Wait for both to complete
const [specResult, codeResult] = await Promise.all([
  waitForTask(specTask.id),
  waitForTask(codeTask.id)
]);
```

### Pre-Fetched Diff

Include the diff directly in reviewer prompts rather than having reviewers run git commands.

**Threshold-based approach:**
- If diff ≤ 500 lines: include full diff inline
- If diff > 500 lines: include `git diff --stat` only, reviewer fetches as needed

```javascript
function prepareDiffContext(baseSha, headSha) {
  const stat = exec(`git diff --stat ${baseSha}..${headSha}`);
  const fullDiff = exec(`git diff ${baseSha}..${headSha}`);
  const lineCount = fullDiff.split('\n').length;

  if (lineCount <= 500) {
    return { diff: fullDiff, stat, included: true };
  } else {
    return {
      diff: null,
      stat,
      included: false,
      note: `Diff is ${lineCount} lines. Fetch specific files as needed.`
    };
  }
}
```

### Structured XML Output

Reviewers return XML instead of plain text for reliable parsing.

**Spec Review Output:**

```xml
<spec-review>
  <verdict>APPROVED | ISSUES</verdict>
  <confidence>high | medium | low</confidence>

  <issues>
    <issue type="missing_requirement | extra_feature | misunderstanding"
           severity="critical | important">
      <location file="path/to/file.ts" line="45"/>
      <description>What's wrong</description>
      <requirement>Which requirement was violated</requirement>
    </issue>
  </issues>

  <checked>
    <item>Requirement 1</item>
    <item>Requirement 2</item>
  </checked>

  <summary>Brief assessment</summary>
</spec-review>
```

**Code Review Output:**

```xml
<code-review>
  <verdict>APPROVED | APPROVED_WITH_MINOR | ISSUES</verdict>
  <confidence>high | medium | low</confidence>

  <issues>
    <issue type="bug | security | architecture | error_handling | testing"
           severity="critical | important">
      <location file="path/to/file.ts" line="52"/>
      <description>What's wrong and why</description>
      <fix>Concrete fix suggestion</fix>
    </issue>
  </issues>

  <minor>
    <note>
      <location file="path/to/file.ts" line="30"/>
      <description>Non-blocking observation</description>
    </note>
  </minor>

  <checked>
    <item>Error handling</item>
    <item>Type safety</item>
  </checked>

  <summary>Brief assessment</summary>
</code-review>
```

### Merge Algorithm

Combine findings from both reviews into a single actionable result.

**Overall Verdict Logic:**

```
if spec has critical issues → SPEC_CRITICAL
else if code has critical issues → CODE_CRITICAL
else if either has important issues → ISSUES
else if code is APPROVED_WITH_MINOR → APPROVED_WITH_MINOR
else → APPROVED
```

**Issue Priority Order:**

1. Spec Critical - wrong thing built
2. Code Critical - bugs, security holes
3. Spec Important - missing/extra features
4. Code Important - architecture, error handling
5. Minor notes - don't block

**Merged Output Structure:**

```xml
<merged-review>
  <overall-verdict>APPROVED | APPROVED_WITH_MINOR | ISSUES | SPEC_CRITICAL | CODE_CRITICAL</overall-verdict>

  <spec-result verdict="..." confidence="..."/>
  <code-result verdict="..." confidence="..."/>

  <issues>
    <!-- Sorted by priority, each tagged with source -->
    <issue source="spec" priority="1" .../>
    <issue source="code" priority="2" .../>
  </issues>

  <minor>
    <!-- Combined non-blocking notes -->
  </minor>

  <action>FIX_AND_REREVIEW | PROCEED | PROCEED_WITH_NOTES</action>
</merged-review>
```

**Related Issue Detection:**

Issues at similar locations (same file, lines within 5) are grouped:

```xml
<issue-group related="true">
  <issue source="spec">Missing input validation</issue>
  <issue source="code">User input not sanitized</issue>
</issue-group>
```

### Error Handling

| Scenario | Handling |
|----------|----------|
| One review times out | Retry once (3 min timeout), then ask user |
| Invalid XML output | Fallback to old `APPROVED:`/`ISSUES:` format, retry once if fails |
| Both reviews fail | Ask user: retry / skip reviews / stop |
| Partial results | Ask user: retry failed review / proceed with partial |
| Conflicting findings | Present conflict to implementer, don't auto-resolve |
| Review loop (>3 iterations) | Ask user: continue / proceed anyway / stop for manual review |

**Fallback Parsing:**

```javascript
function parseReviewOrFallback(output, type) {
  // Try XML
  const xml = extractXML(output, type);
  if (xml) return parseXML(xml);

  // Fallback to old format
  if (output.startsWith('APPROVED:')) {
    return { verdict: 'APPROVED', issues: [], summary: output.slice(9).trim() };
  }
  if (output.startsWith('ISSUES:')) {
    return { verdict: 'ISSUES', issues: parseOldFormat(output), summary: '' };
  }

  return null; // Unparseable
}
```

### Re-Review Strategy

After fixing issues, re-run both reviews (not just the one that failed).

Rationale:
- Fixes might affect either domain
- Clean slate each time is simpler to reason about
- Parallel execution makes this cheap in wall-clock time

### Presentation to Implementer

After merging, show:

```
Review Results:
  Spec Review: ISSUES (high confidence)
  Code Review: APPROVED_WITH_MINOR (high confidence)

Issues to Fix (2):

  1. [Spec Critical] src/auth.ts:45
     Missing OAuth flow implementation
     Requirement: "Support OAuth 2.0 login"

  2. [Spec Important] src/auth.ts:78
     Extra feature not in spec
     Action: Remove or get approval to add

Minor Notes (1):
  - src/auth.ts:30 - Magic number could be constant

Action: Fix issues and re-run reviews
```

## Implementation Plan

1. **Update reviewer prompts** - Add XML output format instructions
2. **Update spec-reviewer-prompt.md** - Include diff context, require XML
3. **Update code-reviewer-template.md** - Include diff context, require XML
4. **Modify executing-plans skill** - Launch parallel reviews with background tasks
5. **Add merge logic** - Parse XML, combine issues, determine overall verdict
6. **Add error handling** - Timeouts, parse failures, retries
7. **Update presentation** - Show merged results to implementer

## Open Questions

1. **Timeout value** - 3 minutes proposed. Adjust based on experience?
2. **Diff threshold** - 500 lines proposed. Too high? Too low?
3. **Max review iterations** - 3 proposed. Should this be configurable?

## Not In Scope

- Unified single reviewer (keep spec and code review as separate concerns)
- Including test/lint output (already verified before reviews)
- Auto-fixing issues (implementer does fixes)
