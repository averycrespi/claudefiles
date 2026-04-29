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

describe("Widget — subagent slot lifecycle", () => {
  test("start adds a running slot with intent and startedAt", () => {
    const ui = fakeUi();
    let nowVal = 1000;
    const w = createWidget({ key: "test", ui, now: () => nowVal });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "Plan" });
    const s = w.subagents[0];
    assert.equal(s.id, 1);
    assert.equal(s.intent, "Plan");
    assert.equal(s.status, "running");
    assert.equal(s.startedAt, 1000);
    w.dispose();
  });

  test("event appends to recentEvents (trims to max K)", () => {
    const ui = fakeUi();
    const w = createWidget({
      key: "test",
      ui,
      now: () => 0,
      maxRecentEventsPerSlot: 2,
    });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "x" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "a" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "b" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "c" });
    assert.deepEqual(w.subagents[0].recentEvents, ["b", "c"]);
    w.dispose();
  });

  test("end transitions slot to finished", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0 });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "x" });
    w._emitSubagentLifecycle({ kind: "end", id: 1 });
    assert.equal(w.subagents[0].status, "finished");
    w.dispose();
  });
});

describe("Widget — invalidate", () => {
  test("invalidate re-evaluates function-form setBody exactly once outside the tick", () => {
    const ui = fakeUi();
    let evalCount = 0;
    const w = createWidget({ key: "test", ui, now: () => 0, tickMs: 10_000 });
    w.setBody(() => {
      evalCount++;
      return [`eval=${evalCount}`];
    });
    // setBody itself calls render once (evalCount === 1); reset baseline
    const countAfterSet = evalCount;
    const callsAfterSet = ui.calls.length;

    w.invalidate();

    assert.equal(
      evalCount,
      countAfterSet + 1,
      "body function evaluated exactly once more",
    );
    assert.equal(
      ui.calls.length,
      callsAfterSet + 1,
      "exactly one additional render",
    );
    assert.deepEqual(ui.calls[ui.calls.length - 1].lines, [
      `eval=${evalCount}`,
    ]);
    w.dispose();
  });
});

describe("Widget — dispose", () => {
  test("dispose stops the tick and clears the widget", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0, tickMs: 10 });
    w.setTitle("hi");
    const before = ui.calls.length;
    w.dispose();
    const after = ui.calls.length;
    // dispose triggers a final setWidget(undefined)
    assert.ok(after > before);
    assert.equal(ui.calls[ui.calls.length - 1].lines, undefined);
  });
});
