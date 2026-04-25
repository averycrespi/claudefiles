import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReport } from "./report.ts";
import type { IterationRecord } from "./history.ts";

const rec = (
  n: number,
  outcome: IterationRecord["outcome"],
  reflection = false,
  summary = `iter ${n}`,
): IterationRecord => ({
  iteration: n,
  outcome,
  summary,
  headBefore: "sha0",
  headAfter:
    outcome === "in_progress" || outcome === "complete" ? `abc${n}234` : "sha0",
  durationMs: 1000,
  reflection,
});

const baseInput = {
  designPath: ".designs/2026-04-20-rate-limiter.md",
  branchName: "workflow",
  commitsAhead: 4,
  taskFilePath: ".autoralph/2026-04-20-rate-limiter.md",
  finalHandoff: "All checklist items complete; tests passing locally.",
  totalElapsedMs: 14 * 60_000 + 22_000,
};

test("report: complete outcome lists all iterations + commits + handoff", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress", false, "bootstrap: read design, write task file"),
      rec(2, "in_progress", false, "add rate limiter config + types"),
      rec(3, "in_progress", false, "wire config into middleware"),
    ],
  });
  assert.match(text, /Autoralph Report/);
  assert.match(text, /Outcome: complete/);
  assert.match(text, /after 3 iterations/);
  assert.match(text, /14:22/);
  assert.match(text, /1\. bootstrap/);
  assert.match(text, /\(abc2234\)/);
  assert.match(text, /Final handoff:/);
  assert.match(text, /All checklist items complete/);
});

test("report: reflection iteration gets reflection glyph", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress"),
      rec(2, "in_progress", true, "reflection: noted test gap"),
    ],
  });
  const reflectionLine = text
    .split("\n")
    .find((l) => l.includes("2. reflection"));
  assert.ok(reflectionLine);
  assert.match(reflectionLine!, /🪞/);
});

test("report: max-iterations outcome", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "max-iterations",
    history: [rec(1, "in_progress"), rec(2, "in_progress")],
  });
  assert.match(text, /Outcome: max-iterations/);
});

test("report: failed outcome surfaces last summary", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "failed",
    history: [
      rec(1, "in_progress"),
      rec(2, "failed", false, "blocked: missing rate-limiter package"),
    ],
  });
  assert.match(text, /Outcome: failed/);
  assert.match(text, /blocked: missing rate-limiter package/);
});

test("report: stuck outcome", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "stuck",
    history: [
      rec(1, "in_progress"),
      rec(2, "timeout"),
      rec(3, "timeout"),
      rec(4, "timeout"),
    ],
  });
  assert.match(text, /Outcome: stuck \(3 consecutive timeouts\)/);
});

test("report: cancelled outcome shows elapsed", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "cancelled",
    history: [rec(1, "in_progress")],
  });
  assert.match(text, /Outcome: cancelled/);
});

test("report: iteration without commit shows '(no commit)'", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [
      {
        ...rec(1, "in_progress", false, "planning iteration"),
        headAfter: "sha0",
      },
    ],
  });
  const planningLine = text.split("\n").find((l) => l.includes("1. planning"));
  assert.ok(planningLine);
  assert.match(planningLine!, /\(no commit\)/);
});

test("report: failed outcome with empty history uses fallback summary", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "failed",
    history: [],
  });
  assert.match(text, /Outcome: failed/);
  assert.match(text, /no summary available/);
});

test("report: zero commits ahead renders correctly", () => {
  const text = formatReport({
    ...baseInput,
    commitsAhead: 0,
    outcome: "complete",
    history: [rec(1, "in_progress")],
  });
  assert.match(text, /\(0 commits ahead of main\)/);
});
