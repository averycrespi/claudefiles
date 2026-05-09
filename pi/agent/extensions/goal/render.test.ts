import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGoalWidgetLines } from "./render.ts";
import type { Goal } from "./state.ts";

const baseGoal: Goal = {
  id: "goal-1",
  objective: "Fix auth token expiry handling across middleware and tests",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
};

test("renders compact active goal widget within width", () => {
  const lines = renderGoalWidgetLines(baseGoal, 32);

  assert.equal(lines.length, 2);
  assert.equal(lines[0], "─".repeat(32));
  assert.ok(lines[1].includes("Goal [active]"));
  assert.ok(lines[1].length <= 32);
});

test("renders one evidence line for complete goals", () => {
  const lines = renderGoalWidgetLines(
    {
      ...baseGoal,
      status: "complete",
      completedAt: 2,
      completionEvidence: "tests pass and README documents behavior in detail",
    },
    40,
  );

  assert.equal(lines.length, 3);
  assert.match(lines[2], /^Evidence: /);
  assert.ok(lines[2].length <= 40);
});
