import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowCompactionSummary } from "./compaction.ts";

test("buildWorkflowCompactionSummary preserves mode, plan path, todo context, and next action", () => {
  const summary = buildWorkflowCompactionSummary({
    mode: "verify",
    activePlanPath: ".plans/2026-04-30-auth.md",
    planGoal: "Refactor auth middleware",
    todos: [
      { id: 1, text: "Run typecheck", status: "done" },
      { id: 2, text: "Investigate failing test", status: "in_progress" },
    ],
    recentOutcome: "make test: 1 failure in workflow-modes/index.test.ts",
    nextAction: "Fix the failing workflow-modes test",
  });

  assert.match(summary, /Mode: verify/);
  assert.match(summary, /Active plan: \.plans\/2026-04-30-auth\.md/);
  assert.match(summary, /Goal: Refactor auth middleware/);
  assert.match(summary, /\[~\] Investigate failing test/);
  assert.match(summary, /Recent outcome: make test: 1 failure/);
  assert.match(summary, /Next action: Fix the failing workflow-modes test/);
});
