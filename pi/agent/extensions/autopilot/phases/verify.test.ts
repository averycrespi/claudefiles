import { test } from "node:test";
import assert from "node:assert/strict";
import { runVerify } from "./verify.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";
import type { Finding } from "../lib/schemas.ts";

const ARCH_NOTES = "arch notes";
const TASK_LIST_SUMMARY = "[completed] do thing";
const DIFF = "diff --git a/a b/a";

const allPassValidation = JSON.stringify({
  test: { status: "pass", command: "bun test", output: "" },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: { status: "skipped", command: "", output: "" },
});

const typecheckFailValidation = JSON.stringify({
  test: { status: "pass", command: "bun test", output: "" },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: {
    status: "fail",
    command: "bun run typecheck",
    output: "TS2345: bad arg",
  },
});

const lintFailValidation = JSON.stringify({
  test: { status: "pass", command: "bun test", output: "" },
  lint: {
    status: "fail",
    command: "bun run lint",
    output: "no-unused-vars",
  },
  typecheck: { status: "skipped", command: "", output: "" },
});

const blockerFinding = (file: string, line: number, desc: string): Finding => ({
  file,
  line,
  severity: "blocker",
  confidence: 95,
  description: desc,
});

const suggestionFinding = (
  file: string,
  line: number,
  desc: string,
): Finding => ({
  file,
  line,
  severity: "suggestion",
  confidence: 95,
  description: desc,
});

function classifyPrompt(
  prompt: string,
): "validation" | "reviewer" | "fixer-review" | "fixer-validation" {
  if (prompt.includes("=== Findings to fix ===")) return "fixer-review";
  if (prompt.includes("=== Failures to fix ===")) return "fixer-validation";
  if (
    prompt.includes("every task from the task list") ||
    prompt.includes("tasks wire together") ||
    prompt.includes("input validation, auth, secrets, injection")
  ) {
    return "reviewer";
  }
  return "validation";
}

interface DispatchPlan {
  validation: string[]; // sequence of stdouts for each validation call
  reviewerRounds: Array<{
    "plan-completeness": string;
    integration: string;
    security: string;
  }>;
  fixerReview: string[]; // sequence of stdouts for each fixer-review call
}

function planDispatch(plan: DispatchPlan) {
  let validationIdx = 0;
  let reviewerRoundIdx = 0;
  // Within a reviewer round, we get 3 calls in parallel (order may
  // vary). We route by prompt content to the right stdout.
  let reviewerCallsInRound = 0;
  let fixerReviewIdx = 0;
  const calls: DispatchOptions[] = [];

  const dispatch = async (opts: DispatchOptions): Promise<DispatchResult> => {
    calls.push(opts);
    const kind = classifyPrompt(opts.prompt);
    if (kind === "validation") {
      const stdout =
        plan.validation[Math.min(validationIdx, plan.validation.length - 1)];
      validationIdx++;
      return { ok: true, stdout };
    }
    if (kind === "reviewer") {
      if (reviewerRoundIdx >= plan.reviewerRounds.length) {
        return {
          ok: true,
          stdout: JSON.stringify({ findings: [] }),
        };
      }
      const round = plan.reviewerRounds[reviewerRoundIdx];
      let which: "plan-completeness" | "integration" | "security";
      if (opts.prompt.includes("every task from the task list")) {
        which = "plan-completeness";
      } else if (opts.prompt.includes("tasks wire together")) {
        which = "integration";
      } else {
        which = "security";
      }
      reviewerCallsInRound++;
      const stdout = round[which];
      if (reviewerCallsInRound >= 3) {
        reviewerCallsInRound = 0;
        reviewerRoundIdx++;
      }
      return { ok: true, stdout };
    }
    if (kind === "fixer-review") {
      const stdout =
        plan.fixerReview[Math.min(fixerReviewIdx, plan.fixerReview.length - 1)];
      fixerReviewIdx++;
      return { ok: true, stdout };
    }
    // fixer-validation: not expected by verify itself, but runValidation
    // may dispatch it. Return a success stub.
    return {
      ok: true,
      stdout: JSON.stringify({
        outcome: "success",
        commit: null,
        fixed: [],
        unresolved: [],
      }),
    };
  };

  return {
    dispatch,
    calls,
    getValidationCount: () => validationIdx,
    getFixerReviewCount: () => fixerReviewIdx,
  };
}

const getDiff = async () => DIFF;

test("runVerify: no auto-fixable findings → returns immediately with synthesize knownIssues", async () => {
  const { dispatch, calls, getFixerReviewCount } = planDispatch({
    validation: [allPassValidation],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({
          findings: [suggestionFinding("a.ts", 10, "nit style")],
        }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [],
  });

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
  });

  assert.equal(getFixerReviewCount(), 0, "no fixer invoked");
  assert.equal(result.fixed.length, 0);
  // Only the suggestion-level known issue should be in knownIssues.
  assert.equal(result.knownIssues.length, 1);
  const only = result.knownIssues[0];
  assert.ok(typeof only !== "string");
  assert.equal((only as Finding).severity, "suggestion");
  assert.ok(result.validationReport);
  assert.equal(result.skippedReviewers.length, 0);
  // No fixer-review in dispatch calls.
  for (const c of calls) {
    assert.ok(!c.prompt.includes("=== Findings to fix ==="));
  }
});

test("runVerify: one round resolves everything → fixed populated, no finding knownIssues", async () => {
  const auto = blockerFinding("x.ts", 42, "null deref");
  const { dispatch, getFixerReviewCount } = planDispatch({
    // Initial validation passes, and the post-fix validation also passes.
    validation: [allPassValidation, allPassValidation],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
      // After fix, no findings.
      {
        "plan-completeness": JSON.stringify({ findings: [] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [
      JSON.stringify({
        outcome: "success",
        commit: "abc1234",
        fixed: ["null deref at x.ts:42"],
        unresolved: [],
      }),
    ],
  });

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
  });

  assert.equal(getFixerReviewCount(), 1, "one fixer round");
  assert.deepEqual(result.fixed, ["null deref at x.ts:42"]);
  // No finding-based knownIssues remain.
  const findingIssues = result.knownIssues.filter((k) => typeof k !== "string");
  assert.equal(findingIssues.length, 0);
});

test("runVerify: fix cap hit → leftover blocker becomes known issue", async () => {
  const auto = blockerFinding("x.ts", 42, "persistent blocker");
  const { dispatch, getFixerReviewCount } = planDispatch({
    // Validation passes throughout (we use maxFixRounds=2 default).
    validation: [
      allPassValidation,
      allPassValidation,
      allPassValidation,
      allPassValidation,
    ],
    reviewerRounds: [
      // Initial reviewers → auto has blocker.
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
      // Post-round-1 reviewers → blocker still present.
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
      // Post-round-2 reviewers → blocker STILL present.
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [
      JSON.stringify({
        outcome: "failure",
        commit: null,
        fixed: [],
        unresolved: ["persistent blocker"],
      }),
      JSON.stringify({
        outcome: "failure",
        commit: null,
        fixed: [],
        unresolved: ["persistent blocker"],
      }),
    ],
  });

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
    maxFixRounds: 2,
  });

  assert.equal(getFixerReviewCount(), 2, "two fixer rounds");
  // Leftover blocker is recorded as a known issue (Finding type).
  const leftover = result.knownIssues.filter(
    (k) => typeof k !== "string" && (k as Finding).severity === "blocker",
  );
  assert.equal(leftover.length, 1, "persistent blocker in knownIssues");
  assert.equal((leftover[0] as Finding).description, "persistent blocker");
});

test("runVerify: fix round introduces new validation failure → logged as known issue, no further loop", async () => {
  const auto = blockerFinding("x.ts", 42, "fix this");
  const { dispatch, getFixerReviewCount, getValidationCount } = planDispatch({
    // Initial validation passes. Post-fix validation has a NEW failure
    // (lint). The loop must stop — no second fixer round.
    validation: [allPassValidation, lintFailValidation],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
      // If the loop wrongly continued, this round would report no
      // findings. The test asserts fixerReview is called exactly once.
      {
        "plan-completeness": JSON.stringify({ findings: [] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [
      JSON.stringify({
        outcome: "success",
        commit: "abc1234",
        fixed: ["fix this"],
        unresolved: [],
      }),
      // Extra just in case; should not be consumed.
      JSON.stringify({
        outcome: "success",
        commit: "def5678",
        fixed: [],
        unresolved: [],
      }),
    ],
  });

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
    maxFixRounds: 2,
  });

  assert.equal(getFixerReviewCount(), 1, "exactly one fixer round");
  assert.equal(getValidationCount(), 2, "initial + post-fix validation only");
  assert.deepEqual(result.fixed, ["fix this"]);
  // New validation failure must be recorded in knownIssues as a string.
  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  assert.ok(
    stringIssues.some((s) => /lint/i.test(s as string)),
    `expected a lint-related string knownIssue, got: ${JSON.stringify(stringIssues)}`,
  );
});

test("runVerify: fixer-review dispatch failure → knownIssues records it, loop breaks", async () => {
  const auto = blockerFinding("x.ts", 42, "null deref");
  let fixerCalls = 0;
  // Base dispatcher handles validation and reviewers via planDispatch.
  const base = planDispatch({
    validation: [allPassValidation],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [],
  });

  const dispatch = async (opts: DispatchOptions): Promise<DispatchResult> => {
    if (opts.prompt.includes("=== Findings to fix ===")) {
      fixerCalls++;
      return { ok: false, stdout: "", error: "fixer dispatch boom" };
    }
    return base.dispatch(opts);
  };

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
    maxFixRounds: 2,
  });

  assert.equal(fixerCalls, 1, "fixer called exactly once before loop breaks");
  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  assert.ok(
    stringIssues.some((s) => /verify fixer dispatch failed/i.test(s as string)),
    `expected verify fixer dispatch failed knownIssue, got: ${JSON.stringify(stringIssues)}`,
  );
});

test("runVerify: fixer-review parse failure → knownIssues marks unproductive, loop breaks", async () => {
  const auto = blockerFinding("x.ts", 42, "null deref");
  let fixerCalls = 0;
  const base = planDispatch({
    validation: [allPassValidation],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [],
  });

  const dispatch = async (opts: DispatchOptions): Promise<DispatchResult> => {
    if (opts.prompt.includes("=== Findings to fix ===")) {
      fixerCalls++;
      return { ok: true, stdout: "not json at all" };
    }
    return base.dispatch(opts);
  };

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
    maxFixRounds: 2,
  });

  assert.equal(fixerCalls, 1, "fixer called exactly once before loop breaks");
  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  assert.ok(
    stringIssues.some((s) => /unproductive/i.test(s as string)),
    `expected unproductive knownIssue, got: ${JSON.stringify(stringIssues)}`,
  );
});

test("runVerify: initial validation failure → its knownIssues flow through; post-fix regressions detected by signature", async () => {
  // Initial validation fails (typecheck). runValidation will itself
  // attempt a fix. We stub a simple "typecheck fails again after fix"
  // so runValidation surfaces it as a knownIssue. The resulting
  // signature is part of the "initial" baseline; a post-fix-review
  // validation that ALSO fails typecheck must NOT be recorded as new.
  const auto = blockerFinding("x.ts", 42, "fix review finding");
  const { dispatch } = planDispatch({
    // runValidation call 1 (initial fail), fixer-validation stub, call 2 still fails.
    // Then post-fix-review validation: same typecheck fail (not new).
    validation: [
      typecheckFailValidation,
      typecheckFailValidation,
      typecheckFailValidation,
    ],
    reviewerRounds: [
      {
        "plan-completeness": JSON.stringify({ findings: [auto] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
      {
        "plan-completeness": JSON.stringify({ findings: [] }),
        integration: JSON.stringify({ findings: [] }),
        security: JSON.stringify({ findings: [] }),
      },
    ],
    fixerReview: [
      JSON.stringify({
        outcome: "success",
        commit: "abc",
        fixed: ["fix review finding"],
        unresolved: [],
      }),
    ],
  });

  const result = await runVerify({
    dispatch,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    cwd: "/tmp",
    maxFixRounds: 2,
  });

  // Initial typecheck failure should appear as a string knownIssue
  // (from runValidation). It should NOT appear twice — the post-fix
  // validation re-surfacing the same failure must be de-duplicated.
  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  const typecheckIssues = stringIssues.filter((s) => /typecheck/i.test(s));
  assert.equal(
    typecheckIssues.length,
    1,
    `expected exactly one typecheck knownIssue, got: ${JSON.stringify(typecheckIssues)}`,
  );
});
