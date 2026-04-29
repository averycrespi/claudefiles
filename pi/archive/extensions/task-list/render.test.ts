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

test("summarizeCounts formats '<n> tasks (<done> done, <failed> failed, <active> in progress, <pending> pending)'", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "completed" },
    { status: "failed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "pending" },
  ] as any);
  assert.equal(counts, "6 tasks (2 done, 1 failed, 1 in progress, 2 pending)");
});

test("truncateWithPriority keeps recently-completed (< 30s) above older completed", () => {
  const now = Date.now();
  const tasks = [
    { id: 1, status: "completed", completedAt: now - 60_000 },
    { id: 2, status: "completed", completedAt: now - 1_000 },
    { id: 3, status: "in_progress" },
    { id: 4, status: "pending" },
  ] as any;
  const kept = truncateWithPriority(tasks, 3, now);
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
  assert.deepEqual(
    kept.map((t: any) => t.id),
    [3, 2, 1],
  );
});

test("summarizeCounts handles empty lists", () => {
  assert.equal(
    summarizeCounts([]),
    "0 tasks (0 done, 0 failed, 0 in progress, 0 pending)",
  );
});

test("summarizeCounts includes failed tasks explicitly in second position", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "failed" },
    { status: "failed" },
  ] as any);
  assert.equal(counts, "5 tasks (1 done, 2 failed, 1 in progress, 1 pending)");
});

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

test("renderWidgetLines: header counts use done, failed, in progress, pending order", () => {
  const state = makeState([
    { title: "Done", status: "completed", completedAt: Date.now() - 1_000 },
    { title: "Failed", status: "failed", completedAt: Date.now() - 500 },
    { title: "Active", status: "in_progress" },
    { title: "Queued", status: "pending" },
  ]);
  const lines = renderWidgetLines(state);
  assert.equal(
    lines[0],
    "4 tasks (1 done, 1 failed, 1 in progress, 1 pending)",
  );
});

test("renderWidgetLines: always uses sectioned rendering, even when all tasks fit", () => {
  const state = makeState([
    { title: "Done", status: "completed", completedAt: Date.now() - 1_000 },
    { title: "Active", status: "in_progress", activity: "compiling..." },
    { title: "Queued", status: "pending" },
  ]);
  const lines = renderWidgetLines(state);
  const prefixWidth = "in progress: ".length;
  assert.equal(lines.length, 4);
  assert.equal(lines[1], `${"done: ".padEnd(prefixWidth)}✔ Done`);
  assert.equal(
    lines[2],
    `${"in progress: ".padEnd(prefixWidth)}◼ Active · compiling...`,
  );
  assert.equal(lines[3], `${"pending: ".padEnd(prefixWidth)}◻ Queued`);
});

test("renderWidgetLines: balanced 4-section layout gives one row per terminal section and extra rows to active/upcoming work", () => {
  const now = Date.now();
  const state: TaskListState = {
    tasks: [
      {
        id: 1,
        title: "Done recent",
        status: "completed",
        completedAt: now - 500,
      },
      {
        id: 2,
        title: "Done old",
        status: "completed",
        completedAt: now - 60_000,
      },
      {
        id: 3,
        title: "Failed recent",
        status: "failed",
        failureReason: "boom",
        completedAt: now - 250,
      },
      {
        id: 4,
        title: "Failed old",
        status: "failed",
        failureReason: "stale",
        completedAt: now - 90_000,
      },
      { id: 5, title: "IP1", status: "in_progress", activity: "watching logs" },
      { id: 6, title: "IP2", status: "in_progress", activity: "writing tests" },
      { id: 7, title: "IP3", status: "in_progress" },
      { id: 8, title: "PD1", status: "pending" },
      { id: 9, title: "PD2", status: "pending" },
      { id: 10, title: "PD3", status: "pending" },
    ],
    createdAt: now,
  };

  const lines = renderWidgetLines(state);
  const prefixWidth = "in progress (+1 more): ".length;
  assert.equal(lines.length, 7);
  assert.equal(
    lines[0],
    "10 tasks (2 done, 2 failed, 3 in progress, 3 pending)",
  );
  assert.equal(
    lines[1],
    `${"done (+1 more): ".padEnd(prefixWidth)}✔ Done recent`,
  );
  assert.equal(
    lines[2],
    `${"failed (+1 more): ".padEnd(prefixWidth)}✗ Failed recent · boom`,
  );
  assert.equal(
    lines[3],
    `${"in progress (+1 more): ".padEnd(prefixWidth)}◼ IP1 · watching logs`,
  );
  assert.equal(lines[4], `${" ".repeat(prefixWidth)}◼ IP2 · writing tests`);
  assert.equal(lines[5], `${"pending (+1 more): ".padEnd(prefixWidth)}◻ PD1`);
  assert.equal(lines[6], `${" ".repeat(prefixWidth)}◻ PD2`);
});

test("renderWidgetLines: done section keeps recent items before older ones", () => {
  const now = Date.now();
  const state: TaskListState = {
    tasks: [
      { id: 1, title: "RD1", status: "completed", completedAt: now - 500 },
      { id: 2, title: "RD2", status: "completed", completedAt: now - 1_000 },
      { id: 3, title: "RD3", status: "completed", completedAt: now - 2_000 },
      { id: 4, title: "OD1", status: "completed", completedAt: now - 60_000 },
      { id: 5, title: "OD2", status: "completed", completedAt: now - 90_000 },
      { id: 6, title: "OD3", status: "completed", completedAt: now - 120_000 },
      { id: 7, title: "OD4", status: "completed", completedAt: now - 150_000 },
      { id: 8, title: "OD5", status: "completed", completedAt: now - 180_000 },
    ],
    createdAt: now,
  };

  const lines = renderWidgetLines(state);
  const prefixWidth = "done (+2 more): ".length;
  assert.equal(lines.length, 7);
  assert.equal(lines[1], "done (+2 more): ✔ RD1");
  assert.equal(lines[2], `${" ".repeat(prefixWidth)}✔ RD2`);
  assert.equal(lines[3], `${" ".repeat(prefixWidth)}✔ RD3`);
  assert.equal(lines[4], `${" ".repeat(prefixWidth)}✔ OD1`);
  assert.equal(lines[5], `${" ".repeat(prefixWidth)}✔ OD2`);
  assert.equal(lines[6], `${" ".repeat(prefixWidth)}✔ OD3`);
});

test("renderWidgetLines: failed section keeps recent items before older ones", () => {
  const now = Date.now();
  const state: TaskListState = {
    tasks: [
      { id: 1, title: "RF1", status: "failed", completedAt: now - 500 },
      { id: 2, title: "RF2", status: "failed", completedAt: now - 1_000 },
      { id: 3, title: "RF3", status: "failed", completedAt: now - 2_000 },
      { id: 4, title: "OF1", status: "failed", completedAt: now - 60_000 },
      { id: 5, title: "OF2", status: "failed", completedAt: now - 90_000 },
      { id: 6, title: "OF3", status: "failed", completedAt: now - 120_000 },
      { id: 7, title: "OF4", status: "failed", completedAt: now - 150_000 },
      { id: 8, title: "OF5", status: "failed", completedAt: now - 180_000 },
    ],
    createdAt: now,
  };

  const lines = renderWidgetLines(state);
  const prefixWidth = "failed (+2 more): ".length;
  assert.equal(lines.length, 7);
  assert.equal(lines[1], "failed (+2 more): ✗ RF1");
  assert.equal(lines[2], `${" ".repeat(prefixWidth)}✗ RF2`);
  assert.equal(lines[3], `${" ".repeat(prefixWidth)}✗ RF3`);
  assert.equal(lines[4], `${" ".repeat(prefixWidth)}✗ OF1`);
  assert.equal(lines[5], `${" ".repeat(prefixWidth)}✗ OF2`);
  assert.equal(lines[6], `${" ".repeat(prefixWidth)}✗ OF3`);
});

test("renderStyledWidgetLines: completed task uses muted strikethrough text with no left indent", () => {
  const state = makeState([
    { title: "Ship it", status: "completed", completedAt: Date.now() - 1_000 },
  ]);
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };

  const lines = renderStyledWidgetLines(state, theme);
  assert.equal(
    lines[1],
    "done: <success>✔ </success><muted><s>Ship it</s></muted>",
  );
});

test("renderStyledWidgetLines: balanced 4-section layout keeps aligned section prefixes and status styling", () => {
  const now = Date.now();
  const state: TaskListState = {
    tasks: [
      { id: 1, title: "Done", status: "completed", completedAt: now - 500 },
      {
        id: 2,
        title: "Failed",
        status: "failed",
        failureReason: "timeout",
        completedAt: now - 250,
      },
      {
        id: 3,
        title: "Build",
        status: "in_progress",
        activity: "compiling...",
      },
      { id: 4, title: "Review", status: "in_progress" },
      { id: 5, title: "Queue 1", status: "pending" },
      { id: 6, title: "Queue 2", status: "pending" },
      { id: 7, title: "Queue 3", status: "pending" },
    ],
    createdAt: now,
  };
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };

  const lines = renderStyledWidgetLines(state, theme);
  const prefixWidth = "pending (+1 more): ".length;
  assert.equal(lines.length, 7);
  assert.equal(
    lines[1],
    `${"done: ".padEnd(prefixWidth)}<success>✔ </success><muted><s>Done</s></muted>`,
  );
  assert.equal(
    lines[2],
    `${"failed: ".padEnd(prefixWidth)}<error><b>✗ Failed · timeout</b></error>`,
  );
  assert.equal(
    lines[3],
    `${"in progress: ".padEnd(prefixWidth)}<accent>◼ </accent><accent><b>Build</b></accent><muted> · compiling...</muted>`,
  );
  assert.equal(
    lines[4],
    `${" ".repeat(prefixWidth)}<accent>◼ </accent><accent><b>Review</b></accent>`,
  );
  assert.equal(
    lines[5],
    `${"pending (+1 more): ".padEnd(prefixWidth)}<muted>◻ </muted><dim>Queue 1</dim>`,
  );
  assert.equal(
    lines[6],
    `${" ".repeat(prefixWidth)}<muted>◻ </muted><dim>Queue 2</dim>`,
  );
});

test("renderStyledWidgetLines: failed task is styled with the error theme and no left indent", () => {
  const state = makeState([
    { title: "Deploy", status: "failed", failureReason: "timeout" },
  ]);
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };

  const lines = renderStyledWidgetLines(state, theme);
  assert.equal(lines[1], "failed: <error><b>✗ Deploy · timeout</b></error>");
});
