import { test } from "node:test";
import assert from "node:assert/strict";
import { createTodoStore, formatTodoList } from "./state.ts";

test("add assigns sequential ids and defaults status to todo", () => {
  const store = createTodoStore();

  const first = store.add("Plan feature");
  const second = store.add(
    "Implement feature",
    "in_progress",
    "editing index.ts",
  );

  assert.deepEqual(first, { id: 1, text: "Plan feature", status: "todo" });
  assert.deepEqual(second, {
    id: 2,
    text: "Implement feature",
    status: "in_progress",
    notes: "editing index.ts",
  });
  assert.deepEqual(store.list(), [first, second]);
});

test("set replaces the list and resets ids", () => {
  const store = createTodoStore();

  store.add("Old item");
  const replaced = store.set([
    { text: "New first" },
    { text: "New second", status: "blocked", notes: "waiting on review" },
  ]);
  const addedAfterSet = store.add("Third");

  assert.deepEqual(replaced, [
    { id: 1, text: "New first", status: "todo" },
    {
      id: 2,
      text: "New second",
      status: "blocked",
      notes: "waiting on review",
    },
  ]);
  assert.deepEqual(addedAfterSet, { id: 3, text: "Third", status: "todo" });
});

test("update patches text status and notes and can clear notes with an empty string", () => {
  const store = createTodoStore();

  store.add("Write tests", "in_progress", "drafting");
  const updated = store.update(1, {
    text: "Write more tests",
    status: "done",
    notes: "",
  });

  assert.deepEqual(updated, {
    id: 1,
    text: "Write more tests",
    status: "done",
  });
  assert.deepEqual(store.list(), [updated!]);
});

test("remove returns whether an item was deleted", () => {
  const store = createTodoStore();

  store.add("Keep me");
  store.add("Delete me");

  assert.equal(store.remove(99), false);
  assert.equal(store.remove(2), true);
  assert.deepEqual(store.list(), [{ id: 1, text: "Keep me", status: "todo" }]);
});

test("clear empties the list and resets next ids", () => {
  const store = createTodoStore();

  store.add("Temp");
  store.clear();
  const next = store.add("Fresh");

  assert.deepEqual(store.list(), [{ id: 1, text: "Fresh", status: "todo" }]);
  assert.deepEqual(next, { id: 1, text: "Fresh", status: "todo" });
});

test("replaceState restores ids and the nextTodoId from a persisted snapshot", () => {
  const store = createTodoStore();

  store.replaceState({
    items: [{ id: 4, text: "Restored", status: "blocked", notes: "waiting" }],
    nextTodoId: 7,
  });
  const next = store.add("Next");

  assert.deepEqual(store.getState(), {
    items: [
      { id: 4, text: "Restored", status: "blocked", notes: "waiting" },
      { id: 7, text: "Next", status: "todo" },
    ],
    nextTodoId: 8,
  });
  assert.deepEqual(next, { id: 7, text: "Next", status: "todo" });
});

test("subscribe receives snapshots for each mutation and unsubscribe stops updates", () => {
  const store = createTodoStore();
  const snapshots: string[] = [];

  const unsubscribe = store.subscribe((state) => {
    snapshots.push(formatTodoList(state.items));
  });

  store.add("One");
  store.add("Two", "blocked", "missing dependency");
  unsubscribe();
  store.clear();

  assert.deepEqual(snapshots, [
    "Current TODO list:\n1. [ ] One",
    "Current TODO list:\n1. [ ] One\n2. [!] Two · missing dependency",
  ]);
});

test("formatTodoList returns a friendly empty-state message", () => {
  assert.equal(formatTodoList([]), "Current TODO list:\n(no TODO items)");
});
