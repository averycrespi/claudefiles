import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@mariozechner/pi-tui";
import { renderWorkflowWidgetLines } from "./render.ts";

const fakeTheme = {
  fg(color: string, text: string) {
    const codes: Record<string, number> = {
      borderMuted: 90,
      text: 37,
    };
    const code = codes[color] ?? 37;
    return `\u001b[${code}m${text}\u001b[0m`;
  },
  bold(text: string) {
    return text;
  },
};

test("renderWorkflowWidgetLines returns an empty list in normal mode", () => {
  assert.deepEqual(
    renderWorkflowWidgetLines({ mode: "normal" }, 24, fakeTheme as any),
    [],
  );
});

test("renderWorkflowWidgetLines adds a full-width separator above the workflow line", () => {
  const lines = renderWorkflowWidgetLines(
    {
      mode: "execute",
      nextAction: "wire auth middleware",
    },
    16,
    fakeTheme as any,
  );

  assert.equal(lines[0], fakeTheme.fg("borderMuted", "─".repeat(16)));
  assert.equal(lines.length, 2);
  assert.ok(visibleWidth(lines[1]!) <= 16);
});

test("renderWorkflowWidgetLines respects width and includes the mode and next action", () => {
  const lines = renderWorkflowWidgetLines(
    {
      mode: "verify",
      nextAction: "tests passing, typecheck failing",
    },
    80,
    fakeTheme as any,
  );

  assert.equal(lines.length, 2);
  assert.match(lines[1]!, /workflow · verify/);
  assert.match(lines[1]!, /tests passing, typecheck failing/);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 80, `line should fit width: ${line}`);
  }
});
