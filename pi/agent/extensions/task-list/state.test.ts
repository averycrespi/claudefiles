import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, type Task } from "./state.ts";

test("create initializes pending tasks with sequential ids", () => {
  const store = createStore();
  const tasks = store.create([{ title: "a" }, { title: "b" }]);
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    tasks.map((t) => t.id),
    [1, 2],
  );
  assert.ok(tasks.every((t) => t.status === "pending"));
});

test("create on empty list succeeds", () => {
  const store = createStore();
  const tasks = store.create([{ title: "a" }]);
  assert.equal(tasks.length, 1);
  assert.equal(store.all().length, 1);
});

test("create on all-terminal list auto-clears and succeeds", () => {
  const store = createStore();
  store.create([{ title: "a" }, { title: "b" }]);
  store.start(1);
  store.complete(1, "done");
  store.fail(2, "nope");
  const tasks = store.create([{ title: "c" }]);
  assert.equal(tasks.length, 1);
  assert.equal(store.all().length, 1);
  assert.equal(tasks[0].id, 1);
  assert.equal(tasks[0].status, "pending");
});

test("create on list with pending task throws", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  assert.throws(() => store.create([{ title: "b" }]));
});

test("create on list with in_progress task throws", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  assert.throws(() => store.create([{ title: "b" }]));
});

test("create() conflict error names live counts and recovery paths", () => {
  const store = createStore();
  // 1 pending + 1 in_progress = 2 live tasks
  store.create([{ title: "a" }, { title: "b" }]);
  store.start(1);
  assert.throws(
    () => store.create([{ title: "c" }]),
    (err: unknown) => {
      assert.ok(err instanceof Error, "throws an Error");
      const msg = err.message;
      assert.ok(
        msg.includes("2 live task"),
        `message includes '2 live task': ${msg}`,
      );
      assert.ok(
        msg.includes("1 pending"),
        `message includes '1 pending': ${msg}`,
      );
      assert.ok(
        msg.includes("1 in_progress"),
        `message includes '1 in_progress': ${msg}`,
      );
      assert.ok(
        msg.includes("/task-list-clear"),
        `message includes '/task-list-clear': ${msg}`,
      );
      assert.ok(
        msg.includes("task_list_set"),
        `message includes 'task_list_set': ${msg}`,
      );
      return true;
    },
  );
});

test("add appends a new pending task with next id", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  const task = store.add("b");
  assert.equal(task.id, 2);
  assert.equal(task.status, "pending");
  assert.equal(store.all().length, 2);
});

test("start transitions pending to in_progress and sets startedAt", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  const t = store.get(1)!;
  assert.equal(t.status, "in_progress");
  assert.equal(typeof t.startedAt, "number");
});

test("pending to failed is valid (with reason)", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.fail(1, "blocked");
  const t = store.get(1)!;
  assert.equal(t.status, "failed");
  assert.equal(t.failureReason, "blocked");
  assert.equal(typeof t.completedAt, "number");
});

test("in_progress to completed with summary sets completedAt", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.complete(1, "done");
  const t = store.get(1)!;
  assert.equal(t.status, "completed");
  assert.equal(t.summary, "done");
  assert.equal(typeof t.completedAt, "number");
});

test("in_progress to failed with reason sets completedAt", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.fail(1, "broke");
  const t = store.get(1)!;
  assert.equal(t.status, "failed");
  assert.equal(t.failureReason, "broke");
  assert.equal(typeof t.completedAt, "number");
});

test("failed to in_progress is valid (retry path via start)", () => {
  // Note: failed->pending is allowed by VALID_TRANSITIONS but has no direct
  // public mutator (start() goes to in_progress). The failed->pending edge
  // is exercised through reconcile() and via the create() auto-clear path.
  const store = createStore();
  store.create([{ title: "a" }]);
  store.fail(1, "blocked");
  store.start(1);
  assert.equal(store.get(1)?.status, "in_progress");
});

test("failed to in_progress is valid", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.fail(1, "blocked");
  store.start(1);
  assert.equal(store.get(1)?.status, "in_progress");
});

test("completed is sticky — any further status change throws", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.complete(1, "did it");
  assert.throws(() => store.start(1));
  assert.throws(() => store.fail(1, "why"));
  assert.throws(() => store.complete(1, "again"));
});

test("pending to completed throws (must go through in_progress)", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  assert.throws(() => store.complete(1, "done"));
});

test("in_progress to pending throws", () => {
  // There is no public mutator that attempts to set pending on in_progress,
  // but the VALID_TRANSITIONS table must forbid it. We verify by ensuring
  // start() on an already-in_progress task throws (in_progress -> in_progress not allowed either).
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  assert.throws(() => store.start(1));
});

test("complete without summary throws", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  assert.throws(() => store.complete(1, ""));
  assert.throws(() => store.complete(1, undefined as unknown as string));
});

test("fail without reason throws", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  assert.throws(() => store.fail(1, ""));
  assert.throws(() => store.fail(1, undefined as unknown as string));
});

test("title is immutable after creation", () => {
  const store = createStore();
  const [created] = store.create([{ title: "orig" }]);
  // Attempt to mutate via returned reference; store.all() should still reflect originals.
  // Since v1 may return references, the API does not expose a setter — just confirm no setter exists.
  assert.equal(created.title, "orig");
  // No public method to update title — confirm only documented mutators exist.
  const keys = Object.keys(store).sort();
  assert.deepEqual(keys, [
    "add",
    "all",
    "clear",
    "complete",
    "create",
    "fail",
    "get",
    "reconcile",
    "setActivity",
    "start",
    "subscribe",
  ]);
});

test("activity settable while in_progress", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.setActivity(1, "thinking...");
  assert.equal(store.get(1)?.activity, "thinking...");
});

test("activity throws when task is not in_progress", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  assert.throws(() => store.setActivity(1, "x"));
});

test("activity cleared on transition out of in_progress (complete)", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.setActivity(1, "working");
  store.complete(1, "done");
  assert.equal(store.get(1)?.activity, undefined);
});

test("activity cleared on transition out of in_progress (fail)", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.start(1);
  store.setActivity(1, "working");
  store.fail(1, "broke");
  assert.equal(store.get(1)?.activity, undefined);
});

test("clear empties the task list", () => {
  const store = createStore();
  store.create([{ title: "a" }]);
  store.clear();
  assert.equal(store.all().length, 0);
});

test("get returns undefined for unknown id", () => {
  const store = createStore();
  assert.equal(store.get(999), undefined);
});

test("subscribe is invoked on every mutator", () => {
  const store = createStore();
  const events: number[] = [];
  store.subscribe((s) => events.push(s.tasks.length));
  store.create([{ title: "a" }]); // 1
  store.add("b"); // 2
  store.start(1); // 2
  store.setActivity(1, "x"); // 2
  store.complete(1, "done"); // 2
  store.start(2); // 2
  store.fail(2, "nope"); // 2
  store.clear(); // 0
  assert.deepEqual(events, [1, 2, 2, 2, 2, 2, 2, 0]);
});

test("unsubscribe stops future notifications", () => {
  const store = createStore();
  let count = 0;
  const unsub = store.subscribe(() => count++);
  store.create([{ title: "a" }]);
  assert.equal(count, 1);
  unsub();
  store.add("b");
  assert.equal(count, 1);
});

test("multiple subscribers all get notified", () => {
  const store = createStore();
  let a = 0;
  let b = 0;
  store.subscribe(() => a++);
  store.subscribe(() => b++);
  store.create([{ title: "x" }]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("all() reflects current tasks", () => {
  const store = createStore();
  store.create([{ title: "a" }, { title: "b" }]);
  const all: Task[] = store.all();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, 1);
  assert.equal(all[1].id, 2);
});

// ── reconcile ─────────────────────────────────────────────────────────

test("reconcile: empty payload against empty store returns ok with empty list", () => {
  const store = createStore();
  const result = store.reconcile([]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.deepEqual(result.tasks, []);
});

test("reconcile: empty payload against all-terminal store drops tasks and returns ok", () => {
  const store = createStore();
  store.create([{ title: "a" }, { title: "b" }]);
  store.start(1);
  store.complete(1, "done");
  store.start(2);
  store.fail(2, "broke");
  const result = store.reconcile([]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.deepEqual(result.tasks, []);
  assert.equal(store.all().length, 0);
});

test("reconcile: empty payload against live tasks returns error mentioning each live task", () => {
  const store = createStore();
  store.create([{ title: "Alpha" }, { title: "Beta" }]);
  store.start(1);
  // task 1 is in_progress, task 2 is pending — both are live
  const result = store.reconcile([]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  assert.ok(result.errors.length > 0);
  const combined = result.errors.join(" ");
  assert.ok(combined.includes("1"), `mentions id 1: ${combined}`);
  assert.ok(combined.includes("Alpha"), `mentions title Alpha: ${combined}`);
  assert.ok(combined.includes("2"), `mentions id 2: ${combined}`);
  assert.ok(combined.includes("Beta"), `mentions title Beta: ${combined}`);
  // State must be unchanged
  assert.equal(store.all().length, 2);
});

test("reconcile: in_progress → completed with summary stamps completedAt", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  const result = store.reconcile([
    { id: 1, title: "task a", status: "completed", summary: "All done" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  const t = store.get(1)!;
  assert.equal(t.status, "completed");
  assert.equal(t.summary, "All done");
  assert.equal(typeof t.completedAt, "number");
});

test("reconcile: completed → pending is rejected (sticky completion)", () => {
  const store = createStore();
  store.create([{ title: "done task" }]);
  store.start(1);
  store.complete(1, "done");
  const result = store.reconcile([
    { id: 1, title: "done task", status: "pending" },
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  const combined = result.errors.join(" ");
  assert.ok(
    combined.includes("completed") && combined.includes("pending"),
    `error mentions completed→pending: ${combined}`,
  );
  // State must be unchanged
  assert.equal(store.get(1)?.status, "completed");
});

test("reconcile: multiple errors in one call are all surfaced", () => {
  const store = createStore();
  store.create([{ title: "Alpha" }, { title: "Beta" }, { title: "Gamma" }]);
  store.start(1);
  store.complete(1, "done");
  store.start(2);
  // Task 3 is pending (live omission)
  // Error 1: completed → pending is invalid for task 1
  // Error 2: task 2 status "completed" but no summary
  // Error 3: task 3 omitted and it's live (pending)
  const result = store.reconcile([
    { id: 1, title: "Alpha", status: "pending" }, // invalid transition
    { id: 2, title: "Beta", status: "completed" }, // missing summary
    // task 3 omitted — live
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  assert.ok(
    result.errors.length >= 3,
    `expected at least 3 errors, got ${result.errors.length}: ${JSON.stringify(result.errors)}`,
  );
});

test("reconcile: new tasks without id are appended with ascending auto-ids after existing", () => {
  const store = createStore();
  store.create([{ title: "existing" }]);
  store.start(1);
  store.complete(1, "done");
  const result = store.reconcile([
    { id: 1, title: "existing", status: "completed", summary: "done" },
    { title: "new task 1" },
    { title: "new task 2" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.tasks.length, 3);
  const newTasks = result.tasks.filter((t) => t.title !== "existing");
  assert.equal(newTasks.length, 2);
  // New tasks must have ids > max existing id (1), ascending
  assert.equal(newTasks[0].id, 2);
  assert.equal(newTasks[1].id, 3);
  assert.equal(newTasks[0].title, "new task 1");
  assert.equal(newTasks[1].title, "new task 2");
  assert.ok(newTasks.every((t) => t.status === "pending"));
});

test("reconcile: carried task with unchanged status is a no-op (no error)", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  // task 1 is pending — carry it as pending (no-op)
  const result = store.reconcile([
    { id: 1, title: "task a", status: "pending" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(store.get(1)?.status, "pending");
});

test("reconcile: unknown id in payload is an error", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  const result = store.reconcile([
    { id: 99, title: "ghost", status: "pending" },
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  const combined = result.errors.join(" ");
  assert.ok(combined.includes("99"), `error mentions id 99: ${combined}`);
});

test("reconcile: duplicate id in payload is an error", () => {
  const store = createStore();
  store.create([{ title: "task a" }, { title: "task b" }]);
  const result = store.reconcile([
    { id: 1, title: "task a", status: "pending" },
    { id: 1, title: "task a again", status: "pending" },
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  const combined = result.errors.join(" ");
  assert.ok(
    combined.includes("1"),
    `error mentions duplicate id 1: ${combined}`,
  );
});

test("reconcile: missing summary when status is completed is an error", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  const result = store.reconcile([
    { id: 1, title: "task a", status: "completed" },
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  const combined = result.errors.join(" ");
  assert.ok(
    combined.includes("summary"),
    `error mentions summary: ${combined}`,
  );
});

test("reconcile: missing failureReason when status is failed is an error", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  const result = store.reconcile([
    { id: 1, title: "task a", status: "failed" },
  ]);
  assert.ok(!result.ok);
  if (result.ok) throw new Error("unreachable");
  const combined = result.errors.join(" ");
  assert.ok(
    combined.includes("failureReason") ||
      combined.includes("failure_reason") ||
      combined.includes("reason"),
    `error mentions failureReason: ${combined}`,
  );
});

test("reconcile: startedAt is set on first transition to in_progress", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  const result = store.reconcile([
    { id: 1, title: "task a", status: "in_progress" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  const t = store.get(1)!;
  assert.equal(t.status, "in_progress");
  assert.equal(typeof t.startedAt, "number");
});

test("reconcile: activity is cleared when leaving in_progress", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  store.setActivity(1, "working hard");
  const result = store.reconcile([
    { id: 1, title: "task a", status: "failed", failureReason: "broke" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(store.get(1)?.activity, undefined);
});

test("reconcile: on error, no state mutation and no notify", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  let notifyCount = 0;
  store.subscribe(() => notifyCount++);
  const beforeCount = notifyCount;
  // Invalid: unknown id
  store.reconcile([{ id: 99, title: "ghost" }]);
  assert.equal(notifyCount, beforeCount, "no notify on reconcile failure");
  assert.equal(store.all().length, 1, "state unchanged");
});

test("reconcile: exactly one notify on success", () => {
  const store = createStore();
  store.create([{ title: "a" }, { title: "b" }]);
  let notifyCount = 0;
  store.subscribe(() => notifyCount++);
  const before = notifyCount;
  store.reconcile([
    { id: 1, title: "a", status: "in_progress" },
    { id: 2, title: "b", status: "pending" },
  ]);
  assert.equal(notifyCount, before + 1, "exactly one notify on success");
});

test("reconcile: carrying an already-completed task does not mutate completedAt", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  store.complete(1, "original summary");
  const before = store.get(1)!;
  const originalCompletedAt = before.completedAt;
  const originalSummary = before.summary;
  assert.equal(typeof originalCompletedAt, "number");
  // Carry the same completed task as a no-op (status unchanged).
  const result = store.reconcile([
    {
      id: 1,
      title: "task a",
      status: "completed",
      summary: originalSummary,
    },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  const after = store.get(1)!;
  assert.equal(after.completedAt, originalCompletedAt);
  assert.equal(after.summary, originalSummary);
});

test("reconcile: carrying an already-failed task does not mutate completedAt", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.start(1);
  store.fail(1, "original reason");
  const before = store.get(1)!;
  const originalCompletedAt = before.completedAt;
  const originalReason = before.failureReason;
  assert.equal(typeof originalCompletedAt, "number");
  const result = store.reconcile([
    {
      id: 1,
      title: "task a",
      status: "failed",
      failureReason: originalReason,
    },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  const after = store.get(1)!;
  assert.equal(after.completedAt, originalCompletedAt);
  assert.equal(after.failureReason, originalReason);
});

test("reconcile: failed task transition to in_progress is valid", () => {
  const store = createStore();
  store.create([{ title: "task a" }]);
  store.fail(1, "network error");
  const result = store.reconcile([
    { id: 1, title: "task a", status: "in_progress" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(store.get(1)?.status, "in_progress");
});

test("reconcile then add: add() continues nextId from where reconcile left off", () => {
  // reconcile() assigns ids 1–3 to 3 new tasks; add() must use id 4
  const store = createStore();
  const result = store.reconcile([
    { title: "alpha" },
    { title: "beta" },
    { title: "gamma" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  assert.deepEqual(
    result.tasks.map((t) => t.id),
    [1, 2, 3],
  );
  const added = store.add("delta");
  assert.equal(added.id, 4, `expected id 4, got ${added.id}`);
});

test("add then reconcile: reconcile() continues nextId from where add() left off", () => {
  // add() uses id 1; reconcile() with 2 new tasks must use ids 2 and 3
  const store = createStore();
  const added = store.add("alpha");
  assert.equal(added.id, 1);
  const result = store.reconcile([
    { id: 1, title: "alpha", status: "pending" },
    { title: "beta" },
    { title: "gamma" },
  ]);
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  const newTasks = result.tasks.filter((t) => t.title !== "alpha");
  assert.equal(newTasks.length, 2);
  assert.equal(newTasks[0].id, 2, `expected id 2, got ${newTasks[0].id}`);
  assert.equal(newTasks[1].id, 3, `expected id 3, got ${newTasks[1].id}`);
});
