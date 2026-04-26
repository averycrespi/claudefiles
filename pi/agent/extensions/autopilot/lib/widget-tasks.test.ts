import { test } from "node:test";
import assert from "node:assert/strict";
import type { Task } from "../../task-list/api.ts";
import { taskWindow, renderTaskWindowLines } from "./widget-tasks.ts";

function mkTask(id: number, status: Task["status"], title = `task${id}`): Task {
  return { id, title, description: "", status };
}

// --- taskWindow anchor selection ---

test("taskWindow: anchors on in_progress with 2 before and 2 after", () => {
  const tasks: Task[] = [
    mkTask(1, "completed"),
    mkTask(2, "completed"),
    mkTask(3, "completed"),
    mkTask(4, "completed"),
    mkTask(5, "in_progress"),
    mkTask(6, "pending"),
    mkTask(7, "pending"),
    mkTask(8, "pending"),
    mkTask(9, "pending"),
  ];
  const w = taskWindow(tasks).map((t) => t.id);
  assert.deepEqual(w, [3, 4, 5, 6, 7]);
});

test("taskWindow: anchors on first pending when nothing in progress", () => {
  const tasks: Task[] = [
    mkTask(1, "completed"),
    mkTask(2, "completed"),
    mkTask(3, "pending"),
    mkTask(4, "pending"),
    mkTask(5, "pending"),
  ];
  const w = taskWindow(tasks).map((t) => t.id);
  assert.deepEqual(w, [1, 2, 3, 4, 5]);
});

test("taskWindow: clamps at list edges", () => {
  const tasks: Task[] = [mkTask(1, "in_progress"), mkTask(2, "pending")];
  const w = taskWindow(tasks).map((t) => t.id);
  assert.deepEqual(w, [1, 2]);
});

test("taskWindow: falls back to last task when everything is done", () => {
  const tasks: Task[] = [
    mkTask(1, "completed"),
    mkTask(2, "completed"),
    mkTask(3, "completed"),
    mkTask(4, "completed"),
    mkTask(5, "completed"),
  ];
  const w = taskWindow(tasks).map((t) => t.id);
  assert.deepEqual(w, [3, 4, 5]);
});

test("taskWindow: empty array for empty input", () => {
  assert.deepEqual(taskWindow([]), []);
});

// --- renderTaskWindowLines summary lines ---

test("renderTaskWindowLines: returns empty array for empty task list", () => {
  assert.deepEqual(renderTaskWindowLines([]), []);
});

test("renderTaskWindowLines: includes '… N earlier' when window is not at start", () => {
  // 9 tasks, task 5 in_progress → window is [3,4,5,6,7], tasks 1+2 are hidden
  const tasks = [
    mkTask(1, "completed"),
    mkTask(2, "completed"),
    mkTask(3, "completed"),
    mkTask(4, "completed"),
    mkTask(5, "in_progress"),
    mkTask(6, "pending"),
    mkTask(7, "pending"),
    mkTask(8, "pending"),
    mkTask(9, "pending"),
  ];
  const lines = renderTaskWindowLines(tasks);
  assert.ok(
    lines.some((l) => l.includes("… 2 earlier")),
    `expected "… 2 earlier" line, got: ${JSON.stringify(lines)}`,
  );
});

test("renderTaskWindowLines: includes '… N more' when window is not at end", () => {
  const tasks = [
    mkTask(1, "completed"),
    mkTask(2, "completed"),
    mkTask(3, "completed"),
    mkTask(4, "completed"),
    mkTask(5, "in_progress"),
    mkTask(6, "pending"),
    mkTask(7, "pending"),
    mkTask(8, "pending"),
    mkTask(9, "pending"),
  ];
  const lines = renderTaskWindowLines(tasks);
  // window ends at 7, tasks 8+9 hidden → "… 2 more"
  assert.ok(
    lines.some((l) => l.includes("… 2 more")),
    `expected "… 2 more" line, got: ${JSON.stringify(lines)}`,
  );
});

test("renderTaskWindowLines: no ellipsis lines when all tasks fit in window", () => {
  const tasks = [mkTask(1, "in_progress"), mkTask(2, "pending")];
  const lines = renderTaskWindowLines(tasks);
  assert.ok(!lines.some((l) => l.includes("earlier")), "no earlier line");
  assert.ok(!lines.some((l) => l.includes("more")), "no more line");
});
