import { test } from "node:test";
import assert from "node:assert/strict";
import { createStatusWidget, type StatusWidgetUi } from "./status-widget.ts";
import type { IterationRecord } from "./history.ts";

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
  return { advance: (ms: number) => (t += ms), now: () => t };
}

const rec = (
  n: number,
  outcome: IterationRecord["outcome"],
  reflection = false,
): IterationRecord => ({
  iteration: n,
  outcome,
  summary: `iter ${n} summary`,
  headBefore: "sha0",
  headAfter:
    outcome === "in_progress" || outcome === "complete" ? `sha${n}` : "sha0",
  durationMs: 1000,
  reflection,
});

test("status-widget: header shows autoralph · iter N/MAX · MM:SS", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    w.setIteration(7, 50);
    clock.advance(12_000);
    const lines = w.renderLines();
    assert.match(lines[0], /^autoralph · iter 7\/50 · 00:12$/);
  } finally {
    w.dispose();
  }
});

test("status-widget: header before setIteration shows iter 0/0", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.match(lines[0], /^autoralph · iter 0\/0 · \d\d:\d\d$/);
  } finally {
    w.dispose();
  }
});

test("status-widget: subagent intent appears with elapsed", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    w.setIteration(3, 50);
    const handle = w.subagent("Iteration 3");
    clock.advance(102_000);
    const lines = w.renderLines();
    handle.finish();
    const subRow = lines.find((l) => l.includes("Iteration 3"));
    assert.ok(subRow, "subagent row should be present");
    assert.match(subRow!, /\(01:42\)/);
  } finally {
    w.dispose();
  }
});

test("status-widget: history window shows last 2 done + counts", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([
      rec(1, "in_progress"),
      rec(2, "in_progress"),
      rec(3, "in_progress"),
      rec(4, "in_progress"),
      rec(5, "in_progress"),
    ]);
    w.setIteration(6, 50);
    const lines = w.renderLines();
    const historyHeader = lines.find((l) => l.includes("history:"));
    assert.ok(historyHeader, "history header should be present");
    assert.match(historyHeader!, /5 done/);
    assert.ok(lines.some((l) => l.includes("4. iter 4")));
    assert.ok(lines.some((l) => l.includes("5. iter 5")));
    assert.ok(!lines.some((l) => l.includes("1. iter 1")));
  } finally {
    w.dispose();
  }
});

test("status-widget: reflection iteration gets reflection glyph", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([rec(5, "in_progress", true)]);
    w.setIteration(6, 50);
    const lines = w.renderLines();
    const reflectionRow = lines.find((l) => l.includes("5. iter 5"));
    assert.ok(reflectionRow);
    assert.match(reflectionRow!, /🪞/);
  } finally {
    w.dispose();
  }
});

test("status-widget: counts include timeouts", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([rec(1, "in_progress"), rec(2, "timeout"), rec(3, "timeout")]);
    w.setIteration(4, 50);
    const lines = w.renderLines();
    const historyHeader = lines.find((l) => l.includes("history:"));
    assert.match(historyHeader!, /2 timeouts/);
  } finally {
    w.dispose();
  }
});

test("status-widget: footer shows cancel hint", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.ok(lines[lines.length - 1].includes("/autoralph-cancel"));
  } finally {
    w.dispose();
  }
});
