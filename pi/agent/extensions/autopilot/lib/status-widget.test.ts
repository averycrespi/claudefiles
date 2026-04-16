import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "../../task-list/api.ts";
import type { Task } from "../../task-list/api.ts";
import {
  createStatusWidget,
  taskWindow,
  type StatusWidgetUi,
} from "./status-widget.ts";

function mkUi(): StatusWidgetUi & {
  calls: Array<[string, string[] | undefined]>;
} {
  const calls: Array<[string, string[] | undefined]> = [];
  return {
    calls,
    setWidget(key, content) {
      calls.push([key, content]);
    },
  };
}

function mkClock(start: number) {
  let t = start;
  return {
    advance(ms: number) {
      t += ms;
    },
    now: () => t,
  };
}

test("status-widget: renders phase + elapsed in header", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    w.setPhase("Planning");
    clock.advance(12_000);
    const lines = w.renderLines();
    assert.match(lines[0], /^autopilot · Planning · 00:12$/);
  } finally {
    w.dispose();
  }
});

test("status-widget: subagent handle appends a row with recent events", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  taskList.clear();
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    const h = w.subagent("Implement: widget");
    h.onEvent({
      type: "tool_execution_start",
      toolName: "edit",
      args: { path: "src/foo.ts" },
    });
    h.onEvent({
      type: "tool_execution_end",
      toolName: "edit",
      result: "ok",
      isError: false,
    });
    const lines = w.renderLines();
    const row = lines.find((l) => l.includes("Implement: widget"));
    assert.ok(row, "expected subagent row");
    const eventLines = lines.filter((l) => l.trim().startsWith("- "));
    assert.ok(
      eventLines.some((l) => l.includes("edit")),
      `expected an edit event row, got: ${JSON.stringify(lines)}`,
    );
    h.finish();
    const afterFinish = w.renderLines();
    assert.ok(
      !afterFinish.some((l) => l.includes("Implement: widget")),
      "expected subagent row to disappear after finish",
    );
  } finally {
    w.dispose();
  }
});

test("status-widget: shows task-list summary when tasks exist", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  taskList.clear();
  taskList.create([
    { title: "one", description: "a" },
    { title: "two", description: "b" },
  ]);
  taskList.start(1);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.ok(
      lines.some((l) => l.includes("2 tasks")),
      "expected task count summary line",
    );
    assert.ok(
      lines.some((l) => l.includes("◼ 1. one")),
      "expected in-progress task row with id prefix",
    );
  } finally {
    w.dispose();
    taskList.clear();
  }
});

test("status-widget: dispose clears the widget via ui.setWidget(key, undefined)", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  w.setPhase("Planning");
  const callsBefore = ui.calls.length;
  assert.ok(callsBefore >= 1, "expected at least one setWidget call");
  w.dispose();
  const last = ui.calls[ui.calls.length - 1];
  assert.equal(last[1], undefined, "expected final setWidget to clear content");
});

test("status-widget: cancel hint line is always present", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.ok(
      lines.some((l) => l.includes("/autopilot-cancel")),
      "expected cancel hint",
    );
  } finally {
    w.dispose();
  }
});

function mkTask(id: number, status: Task["status"], title = `t${id}`): Task {
  return { id, title, description: "", status };
}

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

test("status-widget: renders window with earlier/more ellipses", () => {
  taskList.clear();
  taskList.create(
    Array.from({ length: 9 }, (_, i) => ({
      title: `task ${i + 1}`,
      description: "",
    })),
  );
  for (let i = 1; i <= 4; i++) {
    taskList.start(i);
    taskList.complete(i, "done");
  }
  taskList.start(5);
  const w = createStatusWidget({ tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    const taskLines = lines.filter(
      (l) => /\d+\.\s/.test(l) || l.includes("earlier") || l.includes("more"),
    );
    assert.ok(
      taskLines.some((l) => l.includes("earlier")),
      `expected "earlier" truncation line, got: ${JSON.stringify(taskLines)}`,
    );
    assert.ok(
      taskLines.some((l) => l.includes("more")),
      `expected "more" truncation line, got: ${JSON.stringify(taskLines)}`,
    );
    assert.ok(
      taskLines.some((l) => l.includes("◼ 5.")),
      "expected in-progress task row",
    );
    assert.ok(
      taskLines.some((l) => l.includes("✔ 3.")),
      "expected preceding completed task row",
    );
    assert.ok(
      !taskLines.some((l) => l.includes(" 1.") || l.includes(" 2.")),
      "earliest tasks should be hidden under the 'earlier' line",
    );
  } finally {
    w.dispose();
    taskList.clear();
  }
});

test("status-widget: collapses to 1 event per subagent when 2+ are live", () => {
  taskList.clear();
  const w = createStatusWidget({ tickMs: 60_000 });
  try {
    const first = w.subagent("Review: a");
    const second = w.subagent("Review: b");
    for (const h of [first, second]) {
      h.onEvent({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "/a" },
      });
      h.onEvent({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "/b" },
      });
      h.onEvent({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "/c" },
      });
    }
    const eventLines = w.renderLines().filter((l) => l.trim().startsWith("- "));
    assert.equal(
      eventLines.length,
      2,
      `expected one event per subagent (2 total), got: ${JSON.stringify(eventLines)}`,
    );
  } finally {
    w.dispose();
  }
});

test("status-widget: when a theme is supplied, lines are styled", () => {
  const theme = {
    fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
    bold: (text: string) => `<b>${text}</b>`,
    strikethrough: (text: string) => `<s>${text}</s>`,
  };
  taskList.clear();
  taskList.create([{ title: "one", description: "a" }]);
  taskList.start(1);
  const w = createStatusWidget({ theme, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.ok(
      lines[0].includes("<fg:accent>autopilot</fg>"),
      `header should style the word "autopilot" with accent, got: ${lines[0]}`,
    );
    assert.ok(lines[0].includes("<fg:muted>"), "header tail should be muted");
    assert.ok(
      lines.some((l) => l.includes("<fg:accent>") && l.includes("◼ 1. one")),
      "in-progress task line should use accent",
    );
    assert.ok(
      lines[lines.length - 1].includes("<fg:dim>") &&
        lines[lines.length - 1].includes("/autopilot-cancel"),
      "cancel hint should be dim",
    );
  } finally {
    w.dispose();
    taskList.clear();
  }
});
