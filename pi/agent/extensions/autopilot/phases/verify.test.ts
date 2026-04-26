import { test } from "node:test";
import assert from "node:assert/strict";
import { runVerify } from "./verify.ts";
import type { Subagent } from "../../workflow-core/lib/subagent.ts";
import type {
  DispatchSpec,
  DispatchResult,
} from "../../workflow-core/lib/types.ts";
import type { TSchema } from "@sinclair/typebox";
import type { Finding } from "../lib/schemas.ts";

const ARCH_NOTES = "arch notes";
const TASK_LIST_SUMMARY = "[completed] do thing";
const DIFF = "diff --git a/a b/a";

const allPassData = {
  test: { status: "pass" as const, command: "bun test", output: "" },
  lint: { status: "pass" as const, command: "bun run lint", output: "" },
  typecheck: { status: "skipped" as const, command: "", output: "" },
};

const typecheckFailData = {
  test: { status: "pass" as const, command: "bun test", output: "" },
  lint: { status: "pass" as const, command: "bun run lint", output: "" },
  typecheck: {
    status: "fail" as const,
    command: "bun run typecheck",
    output: "TS2345: bad arg",
  },
};

const lintFailData = {
  test: { status: "pass" as const, command: "bun test", output: "" },
  lint: {
    status: "fail" as const,
    command: "bun run lint",
    output: "no-unused-vars",
  },
  typecheck: { status: "skipped" as const, command: "", output: "" },
};

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

type ReviewerKey = "plan-completeness" | "integration" | "security";

function classifySpec(
  spec: DispatchSpec<TSchema>,
): "validation" | "reviewer" | "fixer-review" | "fixer-validation" {
  if (spec.prompt.includes("=== Findings to fix ===")) return "fixer-review";
  if (spec.prompt.includes("=== Failures to fix ==="))
    return "fixer-validation";
  if (
    spec.prompt.includes("every task from the task list") ||
    spec.prompt.includes("tasks wire together") ||
    spec.prompt.includes("input validation, auth, secrets, injection")
  ) {
    return "reviewer";
  }
  return "validation";
}

interface DispatchPlan {
  validation: unknown[]; // sequence of data objects for each validation call
  reviewerRounds: Array<{
    "plan-completeness": unknown;
    integration: unknown;
    security: unknown;
  }>;
  fixerReview: unknown[]; // sequence of data objects for each fixer-review call
}

function planSubagent(plan: DispatchPlan) {
  let validationIdx = 0;
  let reviewerRoundIdx = 0;
  let reviewerCallsInRound = 0;
  let fixerReviewIdx = 0;
  const allSpecs: DispatchSpec<TSchema>[] = [];

  function handleOne(spec: DispatchSpec<TSchema>): DispatchResult<TSchema> {
    allSpecs.push(spec);
    const kind = classifySpec(spec);

    if (kind === "validation") {
      const data =
        plan.validation[Math.min(validationIdx, plan.validation.length - 1)];
      validationIdx++;
      return { ok: true, data, raw: JSON.stringify(data) } as any;
    }

    if (kind === "reviewer") {
      if (reviewerRoundIdx >= plan.reviewerRounds.length) {
        const empty = { findings: [] };
        return { ok: true, data: empty, raw: JSON.stringify(empty) } as any;
      }
      const round = plan.reviewerRounds[reviewerRoundIdx];
      let which: ReviewerKey;
      if (spec.prompt.includes("every task from the task list")) {
        which = "plan-completeness";
      } else if (spec.prompt.includes("tasks wire together")) {
        which = "integration";
      } else {
        which = "security";
      }
      reviewerCallsInRound++;
      const data = round[which];
      if (reviewerCallsInRound >= 3) {
        reviewerCallsInRound = 0;
        reviewerRoundIdx++;
      }
      return { ok: true, data, raw: JSON.stringify(data) } as any;
    }

    if (kind === "fixer-review") {
      const data =
        plan.fixerReview[Math.min(fixerReviewIdx, plan.fixerReview.length - 1)];
      fixerReviewIdx++;
      return { ok: true, data, raw: JSON.stringify(data) } as any;
    }

    // fixer-validation: not expected by verify itself, but runValidation
    // may dispatch it. Return a success stub.
    const stub = {
      outcome: "success",
      commit: null,
      fixed: [],
      unresolved: [],
    };
    return { ok: true, data: stub, raw: JSON.stringify(stub) } as any;
  }

  const subagent: Subagent = {
    dispatch: async (spec) => handleOne(spec as DispatchSpec<TSchema>),
    parallel: async (specs) =>
      specs.map((s) => handleOne(s as DispatchSpec<TSchema>)) as any,
  };

  return {
    subagent,
    getAllSpecs: () => allSpecs,
    getValidationCount: () => validationIdx,
    getFixerReviewCount: () => fixerReviewIdx,
  };
}

const getDiff = async () => DIFF;

test("runVerify: no auto-fixable findings → returns immediately with synthesize knownIssues", async () => {
  const { subagent, getAllSpecs, getFixerReviewCount } = planSubagent({
    validation: [allPassData],
    reviewerRounds: [
      {
        "plan-completeness": {
          findings: [suggestionFinding("a.ts", 10, "nit style")],
        },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [],
  });

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
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
  for (const s of getAllSpecs()) {
    assert.ok(!s.prompt.includes("=== Findings to fix ==="));
  }
});

test("runVerify: one round resolves everything → fixed populated, no finding knownIssues", async () => {
  const auto = blockerFinding("x.ts", 42, "null deref");
  const { subagent, getFixerReviewCount } = planSubagent({
    validation: [allPassData, allPassData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
      {
        "plan-completeness": { findings: [] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [
      {
        outcome: "success",
        commit: "abc1234",
        fixed: ["null deref at x.ts:42"],
        unresolved: [],
      },
    ],
  });

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
  });

  assert.equal(getFixerReviewCount(), 1, "one fixer round");
  assert.deepEqual(result.fixed, ["null deref at x.ts:42"]);
  const findingIssues = result.knownIssues.filter((k) => typeof k !== "string");
  assert.equal(findingIssues.length, 0);
});

test("runVerify: fix cap hit → leftover blocker becomes known issue", async () => {
  const auto = blockerFinding("x.ts", 42, "persistent blocker");
  const { subagent, getFixerReviewCount } = planSubagent({
    validation: [allPassData, allPassData, allPassData, allPassData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [
      {
        outcome: "failure",
        commit: null,
        fixed: [],
        unresolved: ["persistent blocker"],
      },
      {
        outcome: "failure",
        commit: null,
        fixed: [],
        unresolved: ["persistent blocker"],
      },
    ],
  });

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    maxFixRounds: 2,
  });

  assert.equal(getFixerReviewCount(), 2, "two fixer rounds");
  const leftover = result.knownIssues.filter(
    (k) => typeof k !== "string" && (k as Finding).severity === "blocker",
  );
  assert.equal(leftover.length, 1, "persistent blocker in knownIssues");
  assert.equal((leftover[0] as Finding).description, "persistent blocker");
});

test("runVerify: fix round introduces new validation failure → logged as known issue, no further loop", async () => {
  const auto = blockerFinding("x.ts", 42, "fix this");
  const { subagent, getFixerReviewCount, getValidationCount } = planSubagent({
    validation: [allPassData, lintFailData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
      {
        "plan-completeness": { findings: [] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [
      {
        outcome: "success",
        commit: "abc1234",
        fixed: ["fix this"],
        unresolved: [],
      },
      {
        outcome: "success",
        commit: "def5678",
        fixed: [],
        unresolved: [],
      },
    ],
  });

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    maxFixRounds: 2,
  });

  assert.equal(getFixerReviewCount(), 1, "exactly one fixer round");
  assert.equal(getValidationCount(), 2, "initial + post-fix validation only");
  assert.deepEqual(result.fixed, ["fix this"]);
  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  assert.ok(
    stringIssues.some((s) => /lint/i.test(s as string)),
    `expected a lint-related string knownIssue, got: ${JSON.stringify(stringIssues)}`,
  );
});

test("runVerify: fixer-review dispatch failure → knownIssues records it, loop breaks", async () => {
  const auto = blockerFinding("x.ts", 42, "null deref");
  let fixerCalls = 0;
  const base = planSubagent({
    validation: [allPassData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [],
  });

  const subagent: Subagent = {
    dispatch: async (spec) => {
      if (
        (spec as DispatchSpec<TSchema>).prompt.includes(
          "=== Findings to fix ===",
        )
      ) {
        fixerCalls++;
        return {
          ok: false,
          reason: "dispatch" as const,
          error: "fixer dispatch boom",
        } as any;
      }
      return base.subagent.dispatch(spec);
    },
    parallel: async (specs) => base.subagent.parallel(specs),
  };

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
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
  const base = planSubagent({
    validation: [allPassData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [],
  });

  const subagent: Subagent = {
    dispatch: async (spec) => {
      if (
        (spec as DispatchSpec<TSchema>).prompt.includes(
          "=== Findings to fix ===",
        )
      ) {
        fixerCalls++;
        return {
          ok: false,
          reason: "parse" as const,
          error: "JSON parse error: unexpected token",
          raw: "not json at all",
        } as any;
      }
      return base.subagent.dispatch(spec);
    },
    parallel: async (specs) => base.subagent.parallel(specs),
  };

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
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
  const auto = blockerFinding("x.ts", 42, "fix review finding");
  const { subagent } = planSubagent({
    validation: [typecheckFailData, typecheckFailData, typecheckFailData],
    reviewerRounds: [
      {
        "plan-completeness": { findings: [auto] },
        integration: { findings: [] },
        security: { findings: [] },
      },
      {
        "plan-completeness": { findings: [] },
        integration: { findings: [] },
        security: { findings: [] },
      },
    ],
    fixerReview: [
      {
        outcome: "success",
        commit: "abc",
        fixed: ["fix review finding"],
        unresolved: [],
      },
    ],
  });

  const result = await runVerify({
    subagent,
    getDiff,
    archNotes: ARCH_NOTES,
    taskListSummary: TASK_LIST_SUMMARY,
    maxFixRounds: 2,
  });

  const stringIssues = result.knownIssues.filter((k) => typeof k === "string");
  const typecheckIssues = stringIssues.filter((s) => /typecheck/i.test(s));
  assert.equal(
    typecheckIssues.length,
    1,
    `expected exactly one typecheck knownIssue, got: ${JSON.stringify(typecheckIssues)}`,
  );
});
