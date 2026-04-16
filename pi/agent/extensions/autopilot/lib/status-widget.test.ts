import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "../../task-list/api.ts";
import { createStatusWidget, type StatusWidgetUi } from "./status-widget.ts";

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
      lines.some((l) => l.includes("◼ one")),
      "expected in-progress task row",
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

test("status-widget: when a theme is supplied, lines are styled", () => {
  const theme = {
    fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
    bold: (text: string) => `<b>${text}</b>`,
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
      lines.some((l) => l.includes("<fg:accent>") && l.includes("◼ one")),
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
