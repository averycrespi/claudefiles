# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify implementation matches specification (nothing more, nothing less).

**When to dispatch:** After implementation is complete and committed.

```
Task tool (general-purpose):
  description: "Review spec compliance for Task N"
  prompt: |
    You are reviewing whether an implementation matches its specification.

    ## Diff Context

    {DIFF_CONTEXT}

    ## What Was Requested

    [FULL TEXT of task requirements from plan]

    ## What Implementer Claims They Built

    [Summary of what was implemented]

    ## CRITICAL: Do Not Trust the Report

    The implementer finished quickly. Their report may be incomplete,
    inaccurate, or optimistic. Verify everything independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote
    - Compare actual implementation to requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation code and verify:

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Are there requirements they skipped or missed?
    - Did they claim something works but didn't actually implement it?

    **Extra/unneeded work:**
    - Did they build things that weren't requested?
    - Did they over-engineer or add unnecessary features?
    - Did they add "nice to haves" that weren't in spec?

    **Misunderstandings:**
    - Did they interpret requirements differently than intended?
    - Did they solve the wrong problem?
    - Did they implement the right feature but wrong way?

    **Verify by reading code, not by trusting report.**

    ## Output Format (REQUIRED XML)

    You MUST output your review in this exact XML format:

    ```xml
    <spec-review>
      <verdict>APPROVED | ISSUES</verdict>
      <confidence>high | medium | low</confidence>

      <issues>
        <!-- Only include if verdict is ISSUES -->
        <issue type="missing_requirement | extra_feature | misunderstanding"
               severity="critical | important">
          <location file="path/to/file.ts" line="45"/>
          <description>What's wrong</description>
          <requirement>Which requirement was violated</requirement>
        </issue>
      </issues>

      <checked>
        <item>Requirement 1 that was verified</item>
        <item>Requirement 2 that was verified</item>
      </checked>

      <summary>Brief assessment of the implementation</summary>
    </spec-review>
    ```

    **Severity Guide:**
    - critical: Wrong thing built, fundamental misunderstanding
    - important: Missing feature, extra unneeded work

    **FALLBACK:** If you cannot produce XML, use legacy format:
    - If compliant: "APPROVED: [brief confirmation]"
    - If issues: "ISSUES:\n- [issue 1 with file:line]\n- [issue 2]"
```
