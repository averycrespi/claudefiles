import { test } from "node:test";
import assert from "node:assert/strict";
import type { Widget, WidgetTheme } from "../../_workflow-core/lib/widget.ts";
import type { SubagentSlot } from "../../_workflow-core/lib/types.ts";
import { setupAutoralphWidget } from "./widget-body.ts";
import type { IterationRecord } from "./state.ts";

// --- Fake Widget ---

interface FakeWidgetState {
  titleFn: (() => string) | string;
  bodyFn: (() => string[]) | string[];
  footerFn: (() => string) | string;
  invalidateCount: number;
}

function makeWidget(opts: {
  subagents?: SubagentSlot[];
  elapsedMs?: number;
  theme?: WidgetTheme;
}): Widget & { state: FakeWidgetState } {
  const state: FakeWidgetState = {
    titleFn: "",
    bodyFn: [],
    footerFn: "",
    invalidateCount: 0,
  };
  return {
    state,
    setTitle(c) {
      state.titleFn = c;
    },
    setBody(c) {
      state.bodyFn = c;
    },
    setFooter(c) {
      state.footerFn = c;
    },
    invalidate() {
      state.invalidateCount++;
    },
    get subagents(): ReadonlyArray<SubagentSlot> {
      return opts.subagents ?? [];
    },
    elapsedMs() {
      return opts.elapsedMs ?? 0;
    },
    theme: opts.theme,
    dispose() {},
    _emitSubagentLifecycle() {},
  };
}

function evalTitle(w: Widget & { state: FakeWidgetState }): string {
  const fn = w.state.titleFn;
  return typeof fn === "function" ? fn() : fn;
}

function evalBody(w: Widget & { state: FakeWidgetState }): string[] {
  const fn = w.state.bodyFn;
  return typeof fn === "function" ? fn() : fn;
}

function evalFooter(w: Widget & { state: FakeWidgetState }): string {
  const fn = w.state.footerFn;
  return typeof fn === "function" ? fn() : fn;
}

// --- Helpers ---

function rec(
  n: number,
  outcome: IterationRecord["outcome"],
  opts: { reflection?: boolean; headAfter?: string } = {},
): IterationRecord {
  return {
    iteration: n,
    outcome,
    summary: `iter ${n} summary`,
    headBefore: "aaa0000",
    headAfter: opts.headAfter ?? "aaa0000",
    durationMs: 1000,
    reflection: opts.reflection ?? false,
  };
}

// --- Tests ---

test("widget-body: title includes iter 0/0 initially", () => {
  const w = makeWidget({});
  setupAutoralphWidget(w);
  assert.match(evalTitle(w), /iter 0\/0/);
});

test("widget-body: title updates to iter 7/50 after setIteration(7, 50)", () => {
  const w = makeWidget({ elapsedMs: 12_000 });
  const handle = setupAutoralphWidget(w);
  handle.setIteration(7, 50);
  const title = evalTitle(w);
  assert.match(title, /iter 7\/50/);
  assert.match(title, /00:12/);
});

test("widget-body: title includes 'autoralph' label", () => {
  const w = makeWidget({});
  setupAutoralphWidget(w);
  assert.match(evalTitle(w), /autoralph/);
});

test("widget-body: title uses theme.bold when theme present", () => {
  const theme: WidgetTheme = {
    bold: (s) => `**${s}**`,
    fg: (_, s) => s,
  };
  const w = makeWidget({ theme });
  setupAutoralphWidget(w);
  assert.match(evalTitle(w), /\*\*autoralph\*\*/);
});

test("widget-body: footer is the cancel hint", () => {
  const w = makeWidget({});
  setupAutoralphWidget(w);
  assert.equal(evalFooter(w), "type /autoralph-cancel to stop");
});

test("widget-body: body history block renders counter line after setHistory", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  handle.setHistory([
    rec(1, "complete", { headAfter: "abc1234" }),
    rec(2, "complete", { headAfter: "def5678" }),
    rec(3, "timeout"),
  ]);
  const body = evalBody(w);
  const counterLine = body.find((l) => l.includes("history:"));
  assert.ok(counterLine, "counter line should be present");
  assert.match(counterLine!, /2 done/);
  assert.match(counterLine!, /2 commits/);
  assert.match(counterLine!, /1 timeouts/);
});

test("widget-body: last-2 iteration rows render in order", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  handle.setHistory([
    rec(1, "complete"),
    rec(2, "complete"),
    rec(3, "complete"),
    rec(4, "complete"),
    rec(5, "complete"),
  ]);
  const body = evalBody(w);
  // Only rows 4 and 5 should appear (last 2)
  assert.ok(
    body.some((l) => l.includes("4. iter 4")),
    "row 4 should appear",
  );
  assert.ok(
    body.some((l) => l.includes("5. iter 5")),
    "row 5 should appear",
  );
  assert.ok(
    !body.some((l) => l.includes("3. iter 3")),
    "row 3 should not appear",
  );
  // Row 4 should come before row 5
  const idx4 = body.findIndex((l) => l.includes("4. iter 4"));
  const idx5 = body.findIndex((l) => l.includes("5. iter 5"));
  assert.ok(idx4 < idx5, "row 4 should come before row 5");
});

test("widget-body: reflection record renders 🪞 glyph (wins over outcome glyph)", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  handle.setHistory([rec(5, "complete", { reflection: true })]);
  const body = evalBody(w);
  const row = body.find((l) => l.includes("5. iter 5"));
  assert.ok(row, "row should be present");
  assert.match(row!, /🪞/);
  assert.ok(!row!.includes("✔"), "should not show ✔ when reflection");
});

test("widget-body: commit SHA suffix appears when headAfter !== headBefore", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  handle.setHistory([rec(1, "complete", { headAfter: "abc1234def" })]);
  const body = evalBody(w);
  const row = body.find((l) => l.includes("1. iter 1"));
  assert.ok(row, "row should be present");
  assert.match(row!, /\(abc1234\)/);
});

test("widget-body: no parenthetical when headAfter === headBefore", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  // rec() defaults headBefore and headAfter to same value "aaa0000"
  handle.setHistory([rec(1, "timeout")]);
  const body = evalBody(w);
  const row = body.find((l) => l.includes("1. iter 1"));
  assert.ok(row, "row should be present");
  assert.ok(
    !row!.includes("("),
    "no parenthetical should appear when no commit",
  );
});

test("widget-body: history block absent when history is empty", () => {
  const w = makeWidget({});
  setupAutoralphWidget(w);
  const body = evalBody(w);
  assert.ok(
    !body.some((l) => l.includes("history:")),
    "no history line when empty",
  );
});

test("widget-body: setIteration calls widget.invalidate()", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  const before = w.state.invalidateCount;
  handle.setIteration(1, 10);
  assert.equal(w.state.invalidateCount, before + 1);
});

test("widget-body: setHistory calls widget.invalidate()", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  const before = w.state.invalidateCount;
  handle.setHistory([]);
  assert.equal(w.state.invalidateCount, before + 1);
});

test("widget-body: dispose returns without error", () => {
  const w = makeWidget({});
  const handle = setupAutoralphWidget(w);
  assert.doesNotThrow(() => handle.dispose());
});
