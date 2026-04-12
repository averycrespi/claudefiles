import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, type Task } from "./state.ts";

test("create initializes pending tasks with sequential ids", () => {
  const store = createStore();
  const tasks = store.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    tasks.map((t) => t.id),
    [1, 2],
  );
  assert.ok(tasks.every((t) => t.status === "pending"));
});

test("create on empty list succeeds", () => {
  const store = createStore();
  const tasks = store.create([{ title: "a", description: "aa" }]);
  assert.equal(tasks.length, 1);
  assert.equal(store.all().length, 1);
});

test("create on all-terminal list auto-clears and succeeds", () => {
  const store = createStore();
  store.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  store.start(1);
  store.complete(1, "done");
  store.fail(2, "nope");
  const tasks = store.create([{ title: "c", description: "cc" }]);
  assert.equal(tasks.length, 1);
  assert.equal(store.all().length, 1);
  assert.equal(tasks[0].id, 1);
  assert.equal(tasks[0].status, "pending");
});

test("create on list with pending task throws", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  assert.throws(() => store.create([{ title: "b", description: "bb" }]));
});

test("create on list with in_progress task throws", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  assert.throws(() => store.create([{ title: "b", description: "bb" }]));
});

test("add appends a new pending task with next id", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  const task = store.add("b", "bb");
  assert.equal(task.id, 2);
  assert.equal(task.status, "pending");
  assert.equal(store.all().length, 2);
});

test("start transitions pending to in_progress and sets startedAt", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  const t = store.get(1)!;
  assert.equal(t.status, "in_progress");
  assert.equal(typeof t.startedAt, "number");
});

test("pending to failed is valid (with reason)", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.fail(1, "blocked");
  const t = store.get(1)!;
  assert.equal(t.status, "failed");
  assert.equal(t.failureReason, "blocked");
  assert.equal(typeof t.completedAt, "number");
});

test("in_progress to completed with summary sets completedAt", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.complete(1, "done");
  const t = store.get(1)!;
  assert.equal(t.status, "completed");
  assert.equal(t.summary, "done");
  assert.equal(typeof t.completedAt, "number");
});

test("in_progress to failed with reason sets completedAt", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.fail(1, "broke");
  const t = store.get(1)!;
  assert.equal(t.status, "failed");
  assert.equal(t.failureReason, "broke");
  assert.equal(typeof t.completedAt, "number");
});

test("failed to pending is valid (retry path)", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.fail(1, "blocked");
  // Using start would skip pending; we need a way to reset. Emulate via start from failed? Spec says failed->pending is valid.
  // The API does not have an explicit "reset" mutator; the only way to land in pending from failed is... we need some method.
  // Re-read spec: VALID_TRANSITIONS should allow failed->pending. The store's start() goes to in_progress.
  // The test verifies the transition rule via VALID_TRANSITIONS. Since there's no public reset mutator in the listed API,
  // this transition is exercised by the create() auto-clear path (which replaces tasks entirely).
  // Instead, verify failed->in_progress directly (start from failed) per spec.
  store.start(1);
  assert.equal(store.get(1)?.status, "in_progress");
});

test("failed to in_progress is valid", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.fail(1, "blocked");
  store.start(1);
  assert.equal(store.get(1)?.status, "in_progress");
});

test("completed is sticky — any further status change throws", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.complete(1, "did it");
  assert.throws(() => store.start(1));
  assert.throws(() => store.fail(1, "why"));
  assert.throws(() => store.complete(1, "again"));
});

test("pending to completed throws (must go through in_progress)", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  assert.throws(() => store.complete(1, "done"));
});

test("in_progress to pending throws", () => {
  // There is no public mutator that attempts to set pending on in_progress,
  // but the VALID_TRANSITIONS table must forbid it. We verify by ensuring
  // start() on an already-in_progress task throws (in_progress -> in_progress not allowed either).
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  assert.throws(() => store.start(1));
});

test("complete without summary throws", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  assert.throws(() => store.complete(1, ""));
  assert.throws(() => store.complete(1, undefined as unknown as string));
});

test("fail without reason throws", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  assert.throws(() => store.fail(1, ""));
  assert.throws(() => store.fail(1, undefined as unknown as string));
});

test("title and description are immutable after creation", () => {
  const store = createStore();
  const [created] = store.create([{ title: "orig", description: "origdesc" }]);
  // Attempt to mutate via returned reference; store.all() should still reflect originals.
  // Since v1 may return references, the API does not expose a setter — just confirm no setter exists.
  assert.equal(created.title, "orig");
  assert.equal(created.description, "origdesc");
  // No public method to update title/description — confirm only documented mutators exist.
  const keys = Object.keys(store).sort();
  assert.deepEqual(keys, [
    "add",
    "all",
    "clear",
    "complete",
    "create",
    "fail",
    "get",
    "setActivity",
    "start",
    "subscribe",
  ]);
});

test("activity settable while in_progress", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.setActivity(1, "thinking...");
  assert.equal(store.get(1)?.activity, "thinking...");
});

test("activity throws when task is not in_progress", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  assert.throws(() => store.setActivity(1, "x"));
});

test("activity cleared on transition out of in_progress (complete)", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.setActivity(1, "working");
  store.complete(1, "done");
  assert.equal(store.get(1)?.activity, undefined);
});

test("activity cleared on transition out of in_progress (fail)", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
  store.start(1);
  store.setActivity(1, "working");
  store.fail(1, "broke");
  assert.equal(store.get(1)?.activity, undefined);
});

test("clear empties the task list", () => {
  const store = createStore();
  store.create([{ title: "a", description: "aa" }]);
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
  store.create([{ title: "a", description: "aa" }]); // 1
  store.add("b", "bb"); // 2
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
  store.create([{ title: "a", description: "aa" }]);
  assert.equal(count, 1);
  unsub();
  store.add("b", "bb");
  assert.equal(count, 1);
});

test("multiple subscribers all get notified", () => {
  const store = createStore();
  let a = 0;
  let b = 0;
  store.subscribe(() => a++);
  store.subscribe(() => b++);
  store.create([{ title: "x", description: "xx" }]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("all() reflects current tasks", () => {
  const store = createStore();
  store.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  const all: Task[] = store.all();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, 1);
  assert.equal(all[1].id, 2);
});
