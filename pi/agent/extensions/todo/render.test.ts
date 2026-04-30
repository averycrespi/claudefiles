import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@mariozechner/pi-tui";
import { glyphForStatus, renderWidgetLines } from "./render.ts";
import type { TodoItem } from "./state.ts";

test("glyphForStatus maps each todo status to the expected glyph", () => {
  assert.equal(glyphForStatus("todo"), "[ ]");
  assert.equal(glyphForStatus("in_progress"), "[~]");
  assert.equal(glyphForStatus("done"), "[✓]");
  assert.equal(glyphForStatus("blocked"), "[!]");
});

test("renderWidgetLines returns an empty list when there are no todos", () => {
  assert.deepEqual(renderWidgetLines([], 24), []);
});

test("renderWidgetLines scales the separator to the available width", () => {
  const items: TodoItem[] = [{ id: 1, text: "First", status: "todo" }];

  assert.deepEqual(renderWidgetLines(items, 10), ["─".repeat(10), "[ ] First"]);
  assert.deepEqual(renderWidgetLines(items, 16), ["─".repeat(16), "[ ] First"]);
});

test("renderWidgetLines preserves item order, appends notes inline, and respects width", () => {
  const items: TodoItem[] = [
    { id: 2, text: "Second", status: "done" },
    { id: 1, text: "First", status: "todo", notes: "needs design" },
    { id: 3, text: "Third", status: "blocked", notes: "waiting on API" },
  ];

  assert.deepEqual(renderWidgetLines(items, 32), [
    "─".repeat(32),
    "[✓] Second",
    "[ ] First · needs design",
    "[!] Third · waiting on API",
  ]);

  for (const line of renderWidgetLines(items, 12)) {
    assert.ok(visibleWidth(line) <= 12, `line should fit width: ${line}`);
  }
});
