import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGoalStore,
  formatGoalState,
  parsePersistedGoalState,
} from "./state.ts";

test("goal store trims objectives and tracks lifecycle", () => {
  const store = createGoalStore(() => 1000);

  const goal = store.setGoal("  Ship the feature  ", 100);
  assert.equal(goal.objective, "Ship the feature");
  assert.equal(goal.status, "active");
  assert.equal(goal.createdAt, 1000);

  store.pause();
  assert.equal(store.getGoal()?.status, "paused");

  store.resume();
  assert.equal(store.getGoal()?.status, "active");

  store.complete(" tests and docs verify every requirement ", 100);
  assert.equal(store.getGoal()?.status, "complete");
  assert.equal(store.getGoal()?.completionEvidence, "tests and docs verify every requirement");
  assert.equal(store.getGoal()?.completedAt, 1000);
});

test("goal store rejects empty and oversized objectives", () => {
  const store = createGoalStore(() => 1);

  assert.throws(() => store.setGoal("   ", 10), /Objective is required/);
  assert.throws(() => store.setGoal("abcd", 3), /at most 3 characters/);
});

test("persisted goal state parser rejects invalid snapshots", () => {
  assert.equal(parsePersistedGoalState({ goal: { objective: "x" } }), undefined);
  assert.deepEqual(
    parsePersistedGoalState({
      goal: {
        id: "goal-1",
        objective: "Finish docs",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      },
    }),
    {
      goal: {
        id: "goal-1",
        objective: "Finish docs",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      },
    },
  );
});

test("formatGoalState includes completion evidence", () => {
  const store = createGoalStore(() => 1);
  store.setGoal("Fix auth", 100);
  store.complete("unit tests cover expiry", 100);

  assert.match(formatGoalState(store.getState()), /Goal \[complete\] Fix auth/);
  assert.match(formatGoalState(store.getState()), /Evidence: unit tests cover expiry/);
});
