import { describe, test, mock } from "node:test";
import { strict as assert } from "node:assert";
import { createWidget } from "./widget.ts";

function fakeUi() {
  const calls: Array<{ key: string; lines?: string[] }> = [];
  return {
    calls,
    setWidget(key: string, lines: string[] | undefined) {
      calls.push({ key, lines });
    },
  };
}

describe("Widget — setters", () => {
  test("setTitle/Body/Footer with strings renders synchronously", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0 });
    w.setTitle("hi");
    w.setBody(["a", "b"]);
    w.setFooter("/cancel");
    const last = ui.calls[ui.calls.length - 1].lines!;
    assert.deepEqual(last, ["hi", "a", "b", "/cancel"]);
    w.dispose();
  });

  test("function-form is re-evaluated on tick", async () => {
    const ui = fakeUi();
    let counter = 0;
    const w = createWidget({ key: "test", ui, now: () => 0, tickMs: 5 });
    w.setBody(() => [`n=${counter}`]);
    counter = 1;
    await new Promise((r) => setTimeout(r, 12));
    const lines = ui.calls.flatMap((c) => c.lines ?? []);
    assert.ok(lines.some((l) => l === "n=1"));
    w.dispose();
  });
});
