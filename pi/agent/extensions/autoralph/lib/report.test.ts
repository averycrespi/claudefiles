import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAutoralphReport } from "./report.ts";
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
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress", false, "bootstrap: read design, write task file"),
      rec(2, "in_progress", false, "add rate limiter config + types"),
      rec(3, "in_progress", false, "wire config into middleware"),
    ],
  });
  const text = lines.join("\n");

  assert.equal(lines[0], "━━━ Autoralph Report ━━━");
  assert.ok(text.includes("Autoralph Report"));
  assert.ok(text.includes("Outcome: complete"));
  assert.ok(text.includes("after 3 iterations"));
  assert.ok(text.includes("14:22"));
  assert.ok(text.includes("1. bootstrap"));
  assert.ok(text.includes("(abc2234)"));
  assert.ok(text.includes("Final handoff:"));
  assert.ok(text.includes("All checklist items complete"));
  // header is first line
  const headerIdx = lines.findIndex((l) => l.includes("Autoralph Report"));
  const designIdx = lines.findIndex((l) => l.includes("Design:"));
  const branchIdx = lines.findIndex((l) => l.includes("Branch:"));
  const outcomeIdx = lines.findIndex((l) => l.includes("Outcome:"));
  const iterIdx = lines.findIndex((l) => l.includes("Iterations ("));
  assert.ok(headerIdx < designIdx, "header before design");
  assert.ok(designIdx < branchIdx, "design before branch");
  assert.ok(branchIdx < outcomeIdx, "branch before outcome");
  assert.ok(outcomeIdx < iterIdx, "outcome before iterations");
});

test("report: reflection iteration gets reflection glyph", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress"),
      rec(2, "in_progress", true, "reflection: noted test gap"),
    ],
  });
  const reflectionLine = lines.find((l) => l.includes("2. reflection"));
  assert.ok(reflectionLine, "reflection line found");
  assert.ok(reflectionLine!.includes("🪞"), "reflection glyph present");
});

test("report: max-iterations outcome", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "max-iterations",
    history: [rec(1, "in_progress"), rec(2, "in_progress")],
  });
  assert.ok(
    lines.some((l) => l.includes("Outcome: max-iterations")),
    "max-iterations outcome line",
  );
});

test("report: failed outcome surfaces last summary", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "failed",
    history: [
      rec(1, "in_progress"),
      rec(2, "failed", false, "blocked: missing rate-limiter package"),
    ],
  });
  assert.ok(
    lines.some((l) => l.includes("Outcome: failed")),
    "failed outcome line",
  );
  assert.ok(
    lines.some((l) => l.includes("blocked: missing rate-limiter package")),
    "failure reason from last summary",
  );
});

test("report: stuck outcome", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "stuck",
    history: [
      rec(1, "in_progress"),
      rec(2, "timeout"),
      rec(3, "timeout"),
      rec(4, "timeout"),
    ],
  });
  assert.ok(
    lines.some((l) => l.includes("Outcome: stuck (3 consecutive timeouts)")),
    "stuck outcome line",
  );
});

test("report: cancelled outcome shows cancelled banner", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "cancelled",
    history: [rec(1, "in_progress")],
  });
  // formatCancelledBanner emits "Cancelled by user at MM:SS"
  assert.ok(
    lines.some((l) => l.includes("Cancelled by user at")),
    "cancelled banner present",
  );
  assert.ok(
    lines.some((l) => l.includes("Outcome: cancelled")),
    "outcome line present",
  );
  // cancelled banner appears before the design row (near top)
  const bannerIdx = lines.findIndex((l) => l.includes("Cancelled by user at"));
  const designIdx = lines.findIndex((l) => l.includes("Design:"));
  assert.ok(bannerIdx < designIdx, "cancelled banner before design row");
});

test("report: iteration without commit shows '(no commit)'", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "complete",
    history: [
      {
        ...rec(1, "in_progress", false, "planning iteration"),
        headAfter: "sha0",
      },
    ],
  });
  const planningLine = lines.find((l) => l.includes("1. planning"));
  assert.ok(planningLine, "planning line found");
  assert.ok(planningLine!.includes("(no commit)"), "no commit suffix present");
});

test("report: failed outcome with empty history uses fallback summary", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "failed",
    history: [],
  });
  assert.ok(
    lines.some((l) => l.includes("Outcome: failed")),
    "failed outcome line",
  );
  assert.ok(
    lines.some((l) => l.includes("no summary available")),
    "fallback summary",
  );
});

test("report: zero commits ahead renders correctly", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    commitsAhead: 0,
    outcome: "complete",
    history: [rec(1, "in_progress")],
  });
  assert.ok(
    lines.some((l) => l.includes("0 commits ahead of main")),
    "zero commits ahead",
  );
});

test("report: commit SHA suffix truncated to 7 chars", () => {
  const lines = formatAutoralphReport({
    ...baseInput,
    outcome: "complete",
    history: [rec(2, "in_progress", false, "add rate limiter config + types")],
  });
  // rec(2, "in_progress") sets headAfter = "abc2234" (7 chars already)
  assert.ok(
    lines.some((l) => l.includes("(abc2234)")),
    "sha suffix present",
  );
});
