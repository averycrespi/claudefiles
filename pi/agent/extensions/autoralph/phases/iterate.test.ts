import { test } from "node:test";
import assert from "node:assert/strict";
import { runIteration } from "./iterate.ts";
import type { Subagent } from "../../_workflow-core/lib/subagent.ts";
import type {
  DispatchSpec,
  DispatchResult,
} from "../../_workflow-core/lib/types.ts";
import type { TSchema } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubagent(
  dispatchFn: (spec: DispatchSpec<TSchema>) => Promise<DispatchResult<TSchema>>,
): Subagent {
  return {
    dispatch: dispatchFn as Subagent["dispatch"],
    parallel: async () => {
      throw new Error("not implemented in tests");
    },
  };
}

function makeHeadSeq(shas: string[]) {
  let i = 0;
  return async () => {
    const sha = shas[Math.min(i, shas.length - 1)];
    i++;
    return sha;
  };
}

const okReport = (
  overrides: Partial<{
    outcome: string;
    summary: string;
    handoff: string;
  }> = {},
) =>
  JSON.stringify({
    outcome: "in_progress",
    summary: "did a thing",
    handoff: "next: do another thing",
    ...overrides,
  });

const BASE_ARGS = {
  iteration: 2,
  maxIterations: 50,
  designPath: "design.md",
  taskFilePath: "/run-dir/workflow/design.md",
  priorHandoff: "previous handoff",
  isReflection: false,
  timeoutMs: 60_000,
  cwd: process.cwd(),
} as const;

// ---------------------------------------------------------------------------
// Result-mapping: ok paths
// ---------------------------------------------------------------------------

test("ok+in_progress: returns in_progress with parsed handoff", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: true,
      data: {
        outcome: "in_progress",
        summary: "did a thing",
        handoff: "next: do another thing",
      },
      raw: okReport(),
    })),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "in_progress");
  assert.equal(result.summary, "did a thing");
  assert.equal(result.handoff, "next: do another thing");
  assert.equal(result.headBefore, "sha0");
  assert.equal(result.headAfter, "sha1");
});

test("ok+complete: returns complete outcome", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    iteration: 7,
    subagent: makeSubagent(async () => ({
      ok: true,
      data: { outcome: "complete", summary: "all done", handoff: "done" },
      raw: okReport({ outcome: "complete" }),
    })),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "complete");
});

test("ok+failed: returns failed outcome with summary", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    iteration: 3,
    subagent: makeSubagent(async () => ({
      ok: true,
      data: { outcome: "failed", summary: "blocked", handoff: null },
      raw: okReport({ outcome: "failed", summary: "blocked" }),
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.summary, "blocked");
  assert.equal(result.handoff, null);
});

// ---------------------------------------------------------------------------
// Result-mapping: failure reasons
// ---------------------------------------------------------------------------

test("timeout: returns timeout outcome with duration in summary", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "timeout",
      error: "timed out",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "timeout");
  assert.match(result.summary, /timed out after \d+s/);
  assert.equal(result.handoff, null);
});

test("parse: returns parse_error with error message in summary", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "parse",
      error: "JSON parse error: unexpected token",
      raw: "not json",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "parse_error");
  assert.match(result.summary, /invalid report/);
  assert.match(result.summary, /JSON parse error/);
  assert.equal(result.handoff, null);
});

test("schema: returns parse_error with error message in summary", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "schema",
      error: "schema validation failed: missing outcome",
      raw: '{"wrong": true}',
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "parse_error");
  assert.match(result.summary, /invalid report/);
  assert.match(result.summary, /schema validation failed/);
  assert.equal(result.handoff, null);
});

test("dispatch: returns dispatch_error with error message in summary", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "dispatch",
      error: "exit 1",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "dispatch_error");
  assert.match(result.summary, /dispatch failed/);
  assert.match(result.summary, /exit 1/);
  assert.equal(result.handoff, null);
});

// Risk callout: timeout-vs-aborted distinction
// Timeout path: workflow-core tags the result reason: "timeout" distinctly
// from a run-level abort which produces reason: "aborted".
test("timeout distinction: timeoutMs exceeded → outcome is timeout (not dispatch_error)", async () => {
  // Simulate what workflow-core does when the timer fires: it resolves
  // the dispatch with reason: "timeout". The run-level signal is NOT aborted.
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "timeout",
      error: "timed out after 60000ms",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(
    result.outcome,
    "timeout",
    "timeoutMs exceeded must map to outcome: timeout",
  );
  assert.notEqual(
    result.outcome,
    "dispatch_error",
    "must not be classified as dispatch_error",
  );
});

test("aborted distinction: run-level abort → outcome is dispatch_error (not timeout)", async () => {
  // Simulate what workflow-core does when the parent signal fires: it resolves
  // the dispatch with reason: "aborted". The outer loop's abort check will
  // exit on the next iteration — iterate.ts should NOT classify this as timeout.
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: false,
      reason: "aborted",
      error: "parent signal aborted",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(
    result.outcome,
    "dispatch_error",
    "run-level abort must map to outcome: dispatch_error",
  );
  assert.notEqual(
    result.outcome,
    "timeout",
    "run-level abort must not be classified as timeout",
  );
  assert.match(result.summary, /dispatch aborted/);
});

// ---------------------------------------------------------------------------
// headBefore / headAfter / durationMs
// ---------------------------------------------------------------------------

test("headBefore and headAfter are populated correctly", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: true,
      data: { outcome: "in_progress", summary: "s", handoff: "h" },
      raw: okReport(),
    })),
    getHead: makeHeadSeq(["aaa1111", "bbb2222"]),
  });
  assert.equal(result.headBefore, "aaa1111");
  assert.equal(result.headAfter, "bbb2222");
});

test("durationMs is a non-negative number", async () => {
  const result = await runIteration({
    ...BASE_ARGS,
    subagent: makeSubagent(async () => ({
      ok: true,
      data: { outcome: "in_progress", summary: "s", handoff: "h" },
      raw: okReport(),
    })),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.ok(
    typeof result.durationMs === "number" && result.durationMs >= 0,
    `durationMs should be a non-negative number, got ${result.durationMs}`,
  );
});

// ---------------------------------------------------------------------------
// Prompt template substitution
// ---------------------------------------------------------------------------

test("prompt substitution: iteration N and MAX are substituted", async () => {
  let capturedSpec: DispatchSpec<TSchema> | null = null;
  await runIteration({
    ...BASE_ARGS,
    iteration: 7,
    maxIterations: 25,
    subagent: makeSubagent(async (spec) => {
      capturedSpec = spec;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.ok(capturedSpec, "dispatch was called");
  assert.match((capturedSpec as DispatchSpec<TSchema>).prompt, /\b7\b/);
  assert.match((capturedSpec as DispatchSpec<TSchema>).prompt, /\b25\b/);
});

test("prompt substitution: design path is substituted", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    designPath: "my-feature/design.md",
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /my-feature\/design\.md/);
});

test("prompt substitution: task file path is substituted", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    taskFilePath: "/run-dir/workflow/my-feature.md",
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /\/run-dir\/workflow\/my-feature\.md/);
});

test("prompt substitution: bootstrap section on iteration 1 (priorHandoff null)", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    iteration: 1,
    priorHandoff: null,
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /This is iteration 1/);
  assert.match(capturedPrompt, /create /i);
});

test("prompt substitution: handoff section on iteration 2+ (priorHandoff present)", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    iteration: 2,
    priorHandoff: "carried-over notes",
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Prior iteration's handoff/);
  assert.match(capturedPrompt, /carried-over notes/);
});

test("prompt substitution: reflection block included when isReflection is true", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    iteration: 5,
    isReflection: true,
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Reflection checkpoint/i);
});

test("prompt substitution: reflection block absent when isReflection is false", async () => {
  let capturedPrompt = "";
  await runIteration({
    ...BASE_ARGS,
    iteration: 3,
    isReflection: false,
    subagent: makeSubagent(async (spec) => {
      capturedPrompt = spec.prompt;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  // The raw placeholder should be replaced with an empty string
  assert.doesNotMatch(capturedPrompt, /\{REFLECTION_BLOCK\}/);
});

// ---------------------------------------------------------------------------
// Dispatch spec shape
// ---------------------------------------------------------------------------

test("dispatch is called with correct intent, tools, extensions, and timeoutMs", async () => {
  let capturedSpec: DispatchSpec<TSchema> | null = null;
  await runIteration({
    ...BASE_ARGS,
    iteration: 4,
    isReflection: false,
    timeoutMs: 120_000,
    subagent: makeSubagent(async (spec) => {
      capturedSpec = spec;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.ok(capturedSpec, "dispatch was called");
  const spec = capturedSpec as DispatchSpec<TSchema>;
  assert.equal(spec.intent, "Iteration 4");
  assert.ok(spec.tools.includes("read"));
  assert.ok(spec.tools.includes("write"));
  assert.ok(spec.tools.includes("edit"));
  assert.ok(spec.tools.includes("bash"));
  assert.ok(
    (spec.extensions ?? []).includes("format"),
    "format extension must be requested",
  );
  assert.equal(spec.timeoutMs, 120_000);
});

test("dispatch intent includes (reflection) suffix when isReflection is true", async () => {
  let capturedSpec: DispatchSpec<TSchema> | null = null;
  await runIteration({
    ...BASE_ARGS,
    iteration: 5,
    isReflection: true,
    subagent: makeSubagent(async (spec) => {
      capturedSpec = spec;
      return {
        ok: true,
        data: { outcome: "in_progress", summary: "s", handoff: "h" },
        raw: okReport(),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.ok(capturedSpec, "dispatch was called");
  assert.equal(
    (capturedSpec as DispatchSpec<TSchema>).intent,
    "Iteration 5 (reflection)",
  );
});
