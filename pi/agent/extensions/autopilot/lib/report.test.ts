import { test } from "node:test";
import assert from "node:assert/strict";
import type { Task } from "../../task-list/state.ts";
import type { Finding, ValidationReport } from "./schemas.ts";
import { formatReport, type RunVerifyResult } from "./report.ts";

function mkTask(
  id: number,
  title: string,
  status: Task["status"],
  extra: Partial<Task> = {},
): Task {
  return {
    id,
    title,
    description: `desc ${id}`,
    status,
    ...extra,
  };
}

const passingValidation: ValidationReport = {
  test: { status: "pass", command: "bun test", output: "" },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: { status: "pass", command: "bun run typecheck", output: "" },
};

function mkVerify(overrides: Partial<RunVerifyResult> = {}): RunVerifyResult {
  return {
    validationReport: passingValidation,
    reviewerReports: {
      "plan-completeness": { findings: [] },
      integration: { findings: [] },
      security: { findings: [] },
    },
    fixed: [],
    knownIssues: [],
    skippedReviewers: [],
    ...overrides,
  };
}

test("full success report matches design layout", () => {
  const tasks: Task[] = [
    mkTask(1, "Add rate limiter config", "completed", {
      summary: "added config",
    }),
    mkTask(2, "Wire config into middleware", "completed", {
      summary: "wired middleware",
    }),
  ];
  const verify = mkVerify({
    fixed: ["blocker fixed", "important fixed"],
    skippedReviewers: [],
  });
  const text = formatReport({
    designPath: ".designs/2026-04-12-rate-limiter.md",
    branchName: "workflow",
    commitsAhead: 2,
    tasks,
    verify,
    commitShas: { 1: "abc1234aaaa", 2: "def5678bbbb" },
  });

  const lines = text.split("\n");
  assert.equal(lines[0], "━━━ Autopilot Report ━━━");
  assert.ok(text.includes("Design:  .designs/2026-04-12-rate-limiter.md"));
  assert.ok(text.includes("Branch:  workflow  (2 commits ahead of main)"));
  assert.ok(text.includes("Tasks (2/2):"));
  assert.ok(
    text.includes("✔ 1. Add rate limiter config"),
    "task 1 line present",
  );
  assert.ok(text.includes("(abc1234)"), "task 1 commit sha truncated");
  assert.ok(text.includes("(def5678)"), "task 2 commit sha truncated");
  assert.ok(
    text.includes("Automated checks:  ✔ tests  ✔ lint  ✔ typecheck"),
    "automated checks line",
  );
  assert.ok(text.includes("Known issues:      none"), "known issues none");
  assert.ok(
    !text.includes("Next:") && !text.includes("Review the branch"),
    "no trailing next footer",
  );
});

test("implement failure marks N/T and uses pending glyph for remaining", () => {
  const tasks: Task[] = [
    mkTask(1, "First task", "completed", { summary: "done" }),
    mkTask(2, "Failing task", "failed", {
      failureReason: "subagent reported failure: could not modify file",
    }),
    mkTask(3, "Third task", "pending"),
    mkTask(4, "Fourth task", "pending"),
  ];
  const text = formatReport({
    designPath: "foo.md",
    branchName: "br",
    commitsAhead: 1,
    tasks,
    verify: null,
    commitShas: { 1: "aaaaaaabbbb" },
  });

  assert.ok(text.includes("Tasks (1/4):"), "completed/total count");
  assert.ok(text.includes("✔ 1. First task"));
  assert.ok(text.includes("✗ 2. Failing task"), "failed glyph");
  assert.ok(text.includes("could not modify file"), "failure reason shown");
  assert.ok(text.includes("◻ 3. Third task"), "pending glyph");
  assert.ok(text.includes("◻ 4. Fourth task"));
  assert.ok(
    text.includes("Verify:\n  skipped (implement failed)"),
    "verify skipped section",
  );
});

test("verify partial lists findings as known issues", () => {
  const tasks: Task[] = [
    mkTask(1, "Only task", "completed", { summary: "done" }),
  ];
  const finding: Finding = {
    file: "src/middleware.ts",
    line: 42,
    severity: "suggestion",
    confidence: 90,
    description: "rate limit could be extracted to a helper",
  };
  const verify = mkVerify({
    fixed: ["one blocker"],
    knownIssues: [finding],
    skippedReviewers: ["security"],
  });
  const text = formatReport({
    designPath: "d.md",
    branchName: "workflow",
    commitsAhead: 1,
    tasks,
    verify,
    commitShas: { 1: "abcdefg1234" },
  });

  assert.ok(text.includes("Known issues:      1 suggestion"), "count line");
  assert.ok(
    text.includes(
      "└ src/middleware.ts:42 | suggestion | rate limit could be extracted to a helper",
    ),
    "finding detail line",
  );
  assert.ok(text.includes("Reviewers:"), "reviewers line");
  assert.ok(text.includes("security (skipped)"), "skipped reviewer annotated");
});

test("cancelled run shows cancelled banner and replaces verify with cancelled reason", () => {
  const tasks: Task[] = [
    mkTask(1, "Task one", "completed", { summary: "done" }),
    mkTask(2, "Task two", "in_progress"),
    mkTask(3, "Task three", "pending"),
  ];
  const text = formatReport({
    designPath: "design.md",
    branchName: "feat/foo",
    commitsAhead: 1,
    tasks,
    verify: null,
    commitShas: { 1: "abc1234" },
    cancelled: { elapsedMs: 6 * 60_000 + 18_000 },
  });
  assert.ok(
    text.includes("Cancelled by user at 06:18"),
    "cancelled banner with elapsed time",
  );
  assert.ok(
    text.includes("skipped (cancelled by user)"),
    "verify section says cancelled",
  );
});

test("validation still failing is flagged as known issue", () => {
  const tasks: Task[] = [
    mkTask(1, "Only task", "completed", { summary: "ok" }),
  ];
  const failingValidation: ValidationReport = {
    test: { status: "fail", command: "bun test", output: "boom" },
    lint: { status: "pass", command: "bun run lint", output: "" },
    typecheck: { status: "skipped", command: "bun run typecheck", output: "" },
  };
  const verify = mkVerify({
    validationReport: failingValidation,
    knownIssues: ["test failed (bun test): boom line one"],
  });
  const text = formatReport({
    designPath: "d.md",
    branchName: "b",
    commitsAhead: 1,
    tasks,
    verify,
    commitShas: { 1: "12345678" },
  });

  assert.ok(
    text.includes("Automated checks:  ✗ tests  ✔ lint  ⊘ typecheck"),
    "failing checks glyphs",
  );
  assert.ok(
    text.includes("test failed (bun test): boom line one"),
    "validation known-issue string surfaced",
  );
});
