import { test } from "node:test";
import assert from "node:assert/strict";
import { runReviewers, synthesizeFindings } from "./review.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";
import type { Finding } from "../lib/schemas.ts";

test("synthesizeFindings: drops findings below confidence 80", () => {
  const merged = synthesizeFindings({
    "plan-completeness": {
      findings: [
        {
          file: "a.ts",
          line: 1,
          severity: "blocker",
          confidence: 50,
          description: "low",
        },
        {
          file: "a.ts",
          line: 50,
          severity: "important",
          confidence: 79,
          description: "also low",
        },
      ],
    },
    integration: { findings: [] },
    security: { findings: [] },
  });
  assert.equal(merged.auto.length, 0);
  assert.equal(merged.knownIssues.length, 0);
});

test("synthesizeFindings: dedupes on same file within 3 lines, keeps highest severity", () => {
  const merged = synthesizeFindings({
    "plan-completeness": {
      findings: [
        {
          file: "a.ts",
          line: 10,
          severity: "suggestion",
          confidence: 90,
          description: "x",
        },
      ],
    },
    integration: {
      findings: [
        {
          file: "a.ts",
          line: 12,
          severity: "blocker",
          confidence: 90,
          description: "y",
        },
      ],
    },
    security: { findings: [] },
  });
  // One merged finding, severity blocker, so it goes to auto.
  assert.equal(merged.auto.length, 1);
  assert.equal(merged.knownIssues.length, 0);
  assert.equal(merged.auto[0].severity, "blocker");
  // Description from the highest-severity member is retained.
  assert.equal(merged.auto[0].description, "y");
  assert.equal(merged.auto[0].line, 12);
});

test("synthesizeFindings: routes suggestion → knownIssues, blocker/important → auto", () => {
  const merged = synthesizeFindings({
    "plan-completeness": {
      findings: [
        {
          file: "a.ts",
          line: 1,
          severity: "blocker",
          confidence: 90,
          description: "b",
        },
      ],
    },
    integration: {
      findings: [
        {
          file: "b.ts",
          line: 1,
          severity: "important",
          confidence: 90,
          description: "i",
        },
      ],
    },
    security: {
      findings: [
        {
          file: "c.ts",
          line: 1,
          severity: "suggestion",
          confidence: 90,
          description: "s",
        },
      ],
    },
  });
  assert.equal(merged.auto.length, 2);
  assert.equal(merged.knownIssues.length, 1);
  assert.ok(merged.auto.some((f) => f.severity === "blocker"));
  assert.ok(merged.auto.some((f) => f.severity === "important"));
  assert.equal(merged.knownIssues[0].severity, "suggestion");
});

test("synthesizeFindings: dedupe keeps highest across 3 reviewers; far-apart findings remain separate", () => {
  const merged = synthesizeFindings({
    "plan-completeness": {
      findings: [
        {
          file: "a.ts",
          line: 10,
          severity: "suggestion",
          confidence: 95,
          description: "s",
        },
      ],
    },
    integration: {
      findings: [
        {
          file: "a.ts",
          line: 11,
          severity: "important",
          confidence: 95,
          description: "i",
        },
      ],
    },
    security: {
      findings: [
        {
          file: "a.ts",
          line: 13,
          severity: "blocker",
          confidence: 95,
          description: "b",
        },
        // >3 lines away from line 10/11/13 cluster — stays separate.
        {
          file: "a.ts",
          line: 100,
          severity: "important",
          confidence: 95,
          description: "far",
        },
      ],
    },
  });
  // Expect one merged (blocker, keeping line/desc from blocker) + one separate (important at line 100).
  assert.equal(merged.auto.length, 2);
  assert.equal(merged.knownIssues.length, 0);
  const blocker = merged.auto.find((f) => f.severity === "blocker");
  assert.ok(blocker, "blocker should be in auto");
  assert.equal(blocker?.line, 13);
  assert.equal(blocker?.description, "b");
  const far = merged.auto.find((f) => f.line === 100);
  assert.ok(far, "far finding should remain separate");
  assert.equal(far?.severity, "important");
});

/** Dispatch mock that returns stdouts keyed by prompt-substring match. */
function scopedDispatch(
  byScope: Record<
    "plan-completeness" | "integration" | "security",
    DispatchResult
  >,
) {
  const calls: DispatchOptions[] = [];
  const dispatch = async (opts: DispatchOptions): Promise<DispatchResult> => {
    calls.push(opts);
    if (opts.prompt.includes("every task from the task list")) {
      return byScope["plan-completeness"];
    }
    if (opts.prompt.includes("tasks wire together")) {
      return byScope.integration;
    }
    if (opts.prompt.includes("input validation, auth, secrets, injection")) {
      return byScope.security;
    }
    throw new Error("unexpected prompt");
  };
  return { dispatch, calls };
}

test("runReviewers: dispatches 3 reviewers in parallel and records parse failures as skipped", async () => {
  const goodIntegration = JSON.stringify({
    findings: [
      {
        file: "a.ts",
        line: 1,
        severity: "important",
        confidence: 90,
        description: "contract mismatch",
      },
    ],
  });
  const goodSecurity = JSON.stringify({ findings: [] });
  const { dispatch, calls } = scopedDispatch({
    "plan-completeness": { ok: true, stdout: "not-json" },
    integration: { ok: true, stdout: goodIntegration },
    security: { ok: true, stdout: goodSecurity },
  });

  const result = await runReviewers({
    dispatch,
    diff: "diff --git a/a b/a",
    archNotes: "notes",
    taskListSummary: "1. do thing",
    cwd: "/tmp",
  });

  assert.equal(calls.length, 3, "three dispatches");
  assert.deepEqual(result.skippedReviewers, ["plan-completeness"]);
  assert.deepEqual(result.reports["plan-completeness"], { findings: [] });
  assert.equal(result.reports.integration.findings.length, 1);
  assert.equal(result.reports.security.findings.length, 0);

  // Placeholder substitution sanity: diff/archNotes/taskListSummary interpolated.
  for (const c of calls) {
    assert.ok(c.prompt.includes("diff --git a/a b/a"));
    assert.ok(c.prompt.includes("notes"));
    assert.ok(c.prompt.includes("1. do thing"));
    assert.ok(!c.prompt.includes("{DIFF}"));
    assert.ok(!c.prompt.includes("{ARCHITECTURE_NOTES}"));
    assert.ok(!c.prompt.includes("{TASK_LIST}"));
    // Reviewers must NOT have write/edit/bash tools.
    assert.ok(!c.tools.includes("write" as any));
    assert.ok(!c.tools.includes("edit" as any));
    assert.ok(!c.tools.includes("bash" as any));
  }
});

test("runReviewers: dispatch failure also marks that reviewer as skipped", async () => {
  const { dispatch } = scopedDispatch({
    "plan-completeness": { ok: false, stdout: "", error: "boom" },
    integration: { ok: true, stdout: JSON.stringify({ findings: [] }) },
    security: { ok: true, stdout: JSON.stringify({ findings: [] }) },
  });
  const result = await runReviewers({
    dispatch,
    diff: "",
    archNotes: "",
    taskListSummary: "",
    cwd: "/tmp",
  });
  assert.ok(result.skippedReviewers.includes("plan-completeness"));
  assert.deepEqual(result.reports["plan-completeness"], { findings: [] });
});

// Keep import used so Finding is wired into the test file's type graph.
const _unused: Finding | null = null;
void _unused;
