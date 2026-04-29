import { test } from "node:test";
import assert from "node:assert/strict";
import {
  glyphFor,
  renderStyledWidgetLines,
  renderWidgetLines,
  styleFor,
  summarizeCounts,
  truncateWithPriority,
} from "./render.ts";
import type { TaskListState } from "./state.ts";

test("glyphFor maps each status to the right symbol", () => {
  assert.equal(glyphFor("pending"), "◻");
  assert.equal(glyphFor("in_progress"), "◼");
  assert.equal(glyphFor("completed"), "✔");
  assert.equal(glyphFor("failed"), "✗");
});

test("summarizeCounts formats '<n> tasks (<done> done, <active> in progress, <open> open)'", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "completed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "pending" },
  ] as any);
  assert.equal(counts, "5 tasks (2 done, 1 in progress, 2 open)");
});

test("truncateWithPriority keeps recently-completed (< 30s) above older completed", () => {
  const now = Date.now();
  const tasks = [
    { id: 1, status: "completed", completedAt: now - 60_000 }, // old
    { id: 2, status: "completed", completedAt: now - 1_000 }, // recent
    { id: 3, status: "in_progress" },
    { id: 4, status: "pending" },
  ] as any;
  const kept = truncateWithPriority(tasks, 3, now);
  // Priority: recently-completed → in_progress → pending → older-completed
  assert.deepEqual(
    kept.map((t: any) => t.id),
    [2, 3, 4],
  );
});

test("styleFor returns sensible defaults for each status", () => {
  const pending = styleFor("pending");
  assert.equal(pending.color, "muted");
  assert.equal(pending.bold, false);
  assert.equal(pending.strikethrough, false);

  const inProgress = styleFor("in_progress");
  assert.equal(inProgress.color, "accent");
  assert.equal(inProgress.bold, true);
  assert.equal(inProgress.strikethrough, false);

  const completed = styleFor("completed");
  assert.equal(completed.color, "success");
  assert.equal(completed.strikethrough, true);

  const failed = styleFor("failed");
  assert.equal(failed.color, "error");
  assert.equal(failed.bold, true);
});

test("truncateWithPriority returns all tasks when budget exceeds task count", () => {
  const now = Date.now();
  const tasks = [
    { id: 1, status: "pending" },
    { id: 2, status: "in_progress" },
    { id: 3, status: "completed", completedAt: now - 500 },
  ] as any;
  const kept = truncateWithPriority(tasks, 10, now);
  assert.equal(kept.length, 3);
  // Priority ordering: recently-completed (3), in_progress (2), pending (1).
  assert.deepEqual(
    kept.map((t: any) => t.id),
    [3, 2, 1],
  );
});

test("summarizeCounts handles empty lists", () => {
  assert.equal(summarizeCounts([]), "0 tasks (0 done, 0 in progress, 0 open)");
});

test("summarizeCounts excludes failed tasks from done/open/in-progress buckets", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "failed" },
    { status: "failed" },
  ] as any);
  assert.equal(counts, "5 tasks (1 done, 1 in progress, 1 open)");
});

// ── renderWidgetLines ─────────────────────────────────────────────────────────

function makeState(
  tasks: Partial<TaskListState["tasks"][number]>[],
): TaskListState {
  return {
    tasks: tasks.map((t, i) => ({
      id: i + 1,
      title: `Task ${i + 1}`,
      status: "pending",
      ...t,
    })) as TaskListState["tasks"],
    createdAt: Date.now(),
  };
}

test("renderWidgetLines: empty list returns []", () => {
  const lines = renderWidgetLines({ tasks: [], createdAt: Date.now() });
  assert.deepEqual(lines, []);
});

test("renderWidgetLines: header counts appear on line 0", () => {
  const state = makeState([
    { status: "completed", completedAt: Date.now() - 1000 },
    { status: "in_progress" },
    { status: "pending" },
  ]);
  const lines = renderWidgetLines(state);
  assert.ok(lines.length >= 1);
  assert.ok(
    lines[0].includes("3 tasks"),
    `header should include task count: ${lines[0]}`,
  );
  assert.ok(
    lines[0].includes("1 done"),
    `header should include done count: ${lines[0]}`,
  );
  assert.ok(
    lines[0].includes("1 in progress"),
    `header should include in_progress count: ${lines[0]}`,
  );
  assert.ok(
    lines[0].includes("1 open"),
    `header should include open count: ${lines[0]}`,
  );
});

test("renderWidgetLines: one line per task (3 tasks → 4 lines total)", () => {
  const state = makeState([
    { status: "pending" },
    { status: "in_progress" },
    { status: "completed", completedAt: Date.now() - 1000 },
  ]);
  const lines = renderWidgetLines(state);
  // header + 3 task rows
  assert.equal(lines.length, 4);
});

test("renderWidgetLines: each task row begins with a tab and the correct glyph", () => {
  const state = makeState([
    { title: "P task", status: "pending" },
    { title: "IP task", status: "in_progress" },
    { title: "C task", status: "completed", completedAt: Date.now() - 1000 },
    { title: "F task", status: "failed" },
  ]);
  const lines = renderWidgetLines(state);
  // lines[0] is the header; tasks are reordered by priority
  const taskLines = lines.slice(1);
  // After priority sort: recently-completed → in_progress → pending → failed
  assert.ok(
    taskLines[0].startsWith("\t✔"),
    `expected completed first: ${taskLines[0]}`,
  );
  assert.ok(
    taskLines[1].startsWith("\t◼"),
    `expected in_progress second: ${taskLines[1]}`,
  );
  assert.ok(
    taskLines[2].startsWith("\t◻"),
    `expected pending third: ${taskLines[2]}`,
  );
  assert.ok(
    taskLines[3].startsWith("\t✗"),
    `expected failed fourth: ${taskLines[3]}`,
  );
});

test("renderWidgetLines: 6 tasks fit without +N more (cap = 6 task rows)", () => {
  const state = makeState(
    Array.from({ length: 6 }, () => ({ status: "pending" as const })),
  );
  const lines = renderWidgetLines(state);
  // 1 header + 6 rows = 7 total, no "+N more"
  assert.equal(lines.length, 7);
  assert.ok(
    !lines[lines.length - 1].includes("more"),
    "should not have +N more line",
  );
});

test("renderWidgetLines: 10 tasks → 5 rows + tabbed '+5 more' (total 7 lines)", () => {
  const state = makeState(
    Array.from({ length: 10 }, () => ({ status: "pending" as const })),
  );
  const lines = renderWidgetLines(state);
  // 1 header + 5 rows + "+5 more" = 7 total
  assert.equal(lines.length, 7);
  assert.equal(lines[lines.length - 1], "\t+5 more");
});

test("renderWidgetLines: 15 tasks → 5 rows + tabbed '+10 more' (total 7 lines)", () => {
  const state = makeState(
    Array.from({ length: 15 }, () => ({ status: "pending" as const })),
  );
  const lines = renderWidgetLines(state);
  assert.equal(lines.length, 7);
  assert.equal(lines[lines.length - 1], "\t+10 more");
});

test("renderWidgetLines: truncation priority under 6-row budget (recently-completed → in_progress → pending → older-completed → failed)", () => {
  const now = Date.now();
  // Build 11 tasks across buckets — only 5 should be kept (need +N more)
  const state: TaskListState = {
    tasks: [
      // recently-completed (2)
      { id: 1, title: "RC1", status: "completed", completedAt: now - 1_000 },
      { id: 2, title: "RC2", status: "completed", completedAt: now - 5_000 },
      // in_progress (2)
      { id: 3, title: "IP1", status: "in_progress" },
      { id: 4, title: "IP2", status: "in_progress" },
      // pending (3)
      { id: 5, title: "PD1", status: "pending" },
      { id: 6, title: "PD2", status: "pending" },
      { id: 7, title: "PD3", status: "pending" },
      // older-completed (2)
      { id: 8, title: "OC1", status: "completed", completedAt: now - 60_000 },
      { id: 9, title: "OC2", status: "completed", completedAt: now - 90_000 },
      // failed (2)
      { id: 10, title: "FA1", status: "failed" },
      { id: 11, title: "FA2", status: "failed" },
    ],
    createdAt: now,
  };

  const lines = renderWidgetLines(state);
  // 11 tasks > 6 rows → 5 rows + "+6 more"
  assert.equal(lines.length, 7);
  assert.equal(lines[lines.length - 1], "\t+6 more");

  // The 5 kept tasks follow priority order: RC1, RC2, IP1, IP2, PD1
  const taskLines = lines.slice(1, -1); // remove header and "+N more"
  assert.equal(taskLines.length, 5);
  assert.ok(taskLines[0].includes("RC1"), `[0] should be RC1: ${taskLines[0]}`);
  assert.ok(taskLines[1].includes("RC2"), `[1] should be RC2: ${taskLines[1]}`);
  assert.ok(taskLines[2].includes("IP1"), `[2] should be IP1: ${taskLines[2]}`);
  assert.ok(taskLines[3].includes("IP2"), `[3] should be IP2: ${taskLines[3]}`);
  assert.ok(taskLines[4].includes("PD1"), `[4] should be PD1: ${taskLines[4]}`);
});

test("renderWidgetLines: in_progress task includes activity detail", () => {
  const state = makeState([
    { title: "Build", status: "in_progress", activity: "compiling..." },
  ]);
  const lines = renderWidgetLines(state);
  assert.ok(
    lines[1].includes("compiling..."),
    `task row should include activity: ${lines[1]}`,
  );
});

test("renderWidgetLines: failed task includes failureReason", () => {
  const state = makeState([
    { title: "Deploy", status: "failed", failureReason: "timeout" },
  ]);
  const lines = renderWidgetLines(state);
  assert.ok(
    lines[1].includes("timeout"),
    `task row should include failureReason: ${lines[1]}`,
  );
});

test("renderStyledWidgetLines: completed task uses muted strikethrough text and tab indentation", () => {
  const state = makeState([
    { title: "Ship it", status: "completed", completedAt: Date.now() - 1000 },
  ]);
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };

  const lines = renderStyledWidgetLines(state, theme);
  assert.equal(
    lines[1],
    "\t<success>✔ </success><muted><s>Ship it</s></muted>",
  );
});

test("renderStyledWidgetLines: failed task is styled with the error theme and tab indentation", () => {
  const state = makeState([
    { title: "Deploy", status: "failed", failureReason: "timeout" },
  ]);
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };

  const lines = renderStyledWidgetLines(state, theme);
  assert.equal(lines[1], "\t<error><b>✗ Deploy · timeout</b></error>");
});
