import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowCompactionSummary } from "./compaction.ts";

test("buildWorkflowCompactionSummary preserves mode, todo context, and next action", () => {
  const summary = buildWorkflowCompactionSummary({
    mode: "verify",
    todos: [
      { id: 1, text: "Run typecheck", status: "done" },
      { id: 2, text: "Investigate failing test", status: "in_progress" },
    ],
    nextAction: "Fix the failing workflow-modes test",
  });

  assert.match(summary, /Mode: verify/);
  assert.match(summary, /\[~\] Investigate failing test/);
  assert.match(summary, /Next action: Fix the failing workflow-modes test/);
  assert.doesNotMatch(summary, /Active plan:/);
  assert.doesNotMatch(summary, /Recent outcome:/);
});
