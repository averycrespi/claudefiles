import { test } from "node:test";
import assert from "node:assert/strict";
import { glyphForStatus, renderWidgetLines } from "./render.ts";
import type { TodoItem } from "./state.ts";

test("glyphForStatus maps each todo status to the expected glyph", () => {
  assert.equal(glyphForStatus("todo"), "[ ]");
  assert.equal(glyphForStatus("in_progress"), "[~]");
  assert.equal(glyphForStatus("done"), "[✓]");
  assert.equal(glyphForStatus("blocked"), "[!]");
});

test("renderWidgetLines returns an empty list when there are no todos", () => {
  assert.deepEqual(renderWidgetLines([]), []);
});

test("renderWidgetLines preserves item order and appends notes inline", () => {
  const items: TodoItem[] = [
    { id: 2, text: "Second", status: "done" },
    { id: 1, text: "First", status: "todo", notes: "needs design" },
    { id: 3, text: "Third", status: "blocked", notes: "waiting on API" },
  ];

  assert.deepEqual(renderWidgetLines(items), [
    "[✓] Second",
    "[ ] First · needs design",
    "[!] Third · waiting on API",
  ]);
});
