import { test } from "node:test";
import assert from "node:assert/strict";
import { runIteration } from "./iterate.ts";

const validJson = (
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

function makeHeadSeq(shas: string[]) {
  let i = 0;
  return async () => {
    const sha = shas[Math.min(i, shas.length - 1)];
    i++;
    return sha;
  };
}

test("runIteration returns in_progress with parsed handoff on happy path", async () => {
  const result = await runIteration({
    iteration: 2,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "previous handoff",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: true, stdout: validJson() }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "in_progress");
  assert.equal(result.summary, "did a thing");
  assert.equal(result.handoff, "next: do another thing");
  assert.equal(result.headBefore, "sha0");
  assert.equal(result.headAfter, "sha1");
});

test("runIteration returns complete outcome", async () => {
  const result = await runIteration({
    iteration: 7,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({
      ok: true,
      stdout: validJson({ outcome: "complete" }),
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "complete");
});

test("runIteration returns failed outcome", async () => {
  const result = await runIteration({
    iteration: 3,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({
      ok: true,
      stdout: validJson({ outcome: "failed", summary: "blocked" }),
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.summary, "blocked");
});

test("runIteration returns parse_error on malformed JSON", async () => {
  const result = await runIteration({
    iteration: 4,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: true, stdout: "this is not json" }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "parse_error");
  assert.match(result.summary, /invalid report/i);
  assert.equal(result.handoff, null);
});

test("runIteration returns dispatch_error when dispatch fails", async () => {
  const result = await runIteration({
    iteration: 5,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: false, stdout: "", error: "boom" }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "dispatch_error");
  assert.match(result.summary, /boom/);
});

test("runIteration returns timeout when dispatch reports aborted via timer", async () => {
  const result = await runIteration({
    iteration: 6,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 50,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      await new Promise((r) => setTimeout(r, 100));
      const aborted = opts.signal?.aborted ?? false;
      return {
        ok: false,
        stdout: "",
        error: aborted ? "aborted" : "x",
        aborted,
      };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "timeout");
});

test("runIteration does NOT return timeout when parent signal is aborted mid-dispatch", async () => {
  const parentController = new AbortController();
  const result = await runIteration({
    iteration: 3,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      // Simulate user pressing /autoralph-cancel mid-iteration.
      parentController.abort();
      // The parent-abort listener will have synchronously aborted
      // iterate.ts's internal controller, propagating to opts.signal.
      const aborted = opts.signal?.aborted ?? false;
      return {
        ok: false,
        stdout: "",
        error: aborted ? "aborted" : "x",
        aborted,
      };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    signal: parentController.signal,
  });
  // Parent-cancel must NOT be classified as timeout — that distinction
  // belongs to the orchestrator's own consecutive-timeout tracking.
  assert.notEqual(result.outcome, "timeout");
  assert.equal(result.outcome, "dispatch_error");
});

test("runIteration prompt includes bootstrap section on iteration 1", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 1,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: null,
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /This is iteration 1/);
  assert.match(capturedPrompt, /create .*design\.md/i);
});

test("runIteration prompt includes prior handoff on iteration 2+", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 2,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "carried-over notes",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Prior iteration's handoff/);
  assert.match(capturedPrompt, /carried-over notes/);
});

test("runIteration prompt includes reflection block when isReflection is true", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 5,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: true,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Reflection checkpoint/i);
});
