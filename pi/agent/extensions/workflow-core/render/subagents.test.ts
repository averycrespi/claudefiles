import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderSubagents } from "./subagents.ts";
import type { SubagentSlot } from "../lib/types.ts";

const fixedNow = 1000000;

function slot(p: Partial<SubagentSlot>): SubagentSlot {
  return {
    id: 1,
    intent: "Plan",
    startedAt: fixedNow - 65000,
    recentEvents: [],
    status: "running",
    ...p,
  };
}

describe("renderSubagents", () => {
  test("empty slots returns empty array", () => {
    assert.deepEqual(renderSubagents([], { now: () => fixedNow }), []);
  });

  test("single running slot renders intent + clock", () => {
    const lines = renderSubagents([slot({})], { now: () => fixedNow });
    assert.equal(lines[0], "↳ Plan (01:05)");
  });

  test("finished slots are not rendered", () => {
    assert.deepEqual(
      renderSubagents([slot({ status: "finished" })], { now: () => fixedNow }),
      [],
    );
  });

  test("multiple running slots each get a line", () => {
    const lines = renderSubagents(
      [slot({ id: 1, intent: "A" }), slot({ id: 2, intent: "B" })],
      { now: () => fixedNow },
    );
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^↳ A /);
    assert.match(lines[1], /^↳ B /);
  });
});
