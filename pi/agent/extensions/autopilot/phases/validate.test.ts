import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidation } from "./validate.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";

const allPassJson = JSON.stringify({
  test: { status: "pass", command: "bun test", output: "" },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: { status: "skipped", command: "", output: "" },
});

const testFailJson = JSON.stringify({
  test: {
    status: "fail",
    command: "bun test",
    output: "FAIL: expected 1 to equal 2",
  },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: { status: "skipped", command: "", output: "" },
});

const fixerSuccessJson = JSON.stringify({
  outcome: "success",
  commit: "fix1234",
  fixed: ["test: expected 1 to equal 2"],
  unresolved: [],
});

const fixerFailureJson = JSON.stringify({
  outcome: "failure",
  commit: null,
  fixed: [],
  unresolved: ["test: expected 1 to equal 2"],
});

/** Dispatch mock that returns results from an ordered sequence. */
function sequenceDispatch(stdouts: string[]) {
  let i = 0;
  const calls: DispatchOptions[] = [];
  const dispatch = async (opts: DispatchOptions): Promise<DispatchResult> => {
    calls.push(opts);
    const stdout = stdouts[Math.min(i, stdouts.length - 1)];
    i++;
    return { ok: true, stdout };
  };
  return { dispatch, calls, getCallCount: () => i };
}

test("runValidation: pass path — first validation all pass", async () => {
  const { dispatch, getCallCount } = sequenceDispatch([allPassJson]);
  const result = await runValidation({
    dispatch,
    cwd: process.cwd(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.rounds, 1);
  assert.deepEqual(result.knownIssues, []);
  assert.ok(result.report);
  assert.equal(result.report?.test.status, "pass");
  assert.equal(getCallCount(), 1, "only validation dispatched, no fixer");
});

test("runValidation: fix + re-pass — fail, fixer success, pass", async () => {
  const { dispatch, calls, getCallCount } = sequenceDispatch([
    testFailJson,
    fixerSuccessJson,
    allPassJson,
  ]);
  const result = await runValidation({
    dispatch,
    cwd: process.cwd(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.rounds, 2);
  assert.deepEqual(result.knownIssues, []);
  assert.ok(result.report);
  assert.equal(result.report?.test.status, "pass");
  assert.equal(getCallCount(), 3, "validation + fixer + validation");
  // Fixer dispatch (call #2) must not have edit/write tools withheld — it needs them.
  const fixerCall = calls[1];
  assert.ok(fixerCall.tools.includes("edit"), "fixer must have edit tool");
  assert.ok(fixerCall.tools.includes("write"), "fixer must have write tool");
  // Validation dispatch must NOT have edit/write.
  const validationCall = calls[0];
  assert.ok(
    !validationCall.tools.includes("edit"),
    "validation must not have edit tool",
  );
  assert.ok(
    !validationCall.tools.includes("write"),
    "validation must not have write tool",
  );
});

test("runValidation: fix cap — both rounds fail, returns knownIssues", async () => {
  // Sequence: validation fail → fixer fail → validation fail → (cap hit, knownIssues)
  const { dispatch } = sequenceDispatch([
    testFailJson,
    fixerFailureJson,
    testFailJson,
  ]);
  const result = await runValidation({
    dispatch,
    cwd: process.cwd(),
    maxFixRounds: 2,
  });
  assert.equal(result.ok, true);
  assert.ok(result.knownIssues.length > 0, "knownIssues must be nonempty");
  assert.ok(
    result.knownIssues.some((s) => /test/i.test(s)),
    `knownIssues should mention test failure, got: ${JSON.stringify(result.knownIssues)}`,
  );
});

test("runValidation: parse failure on validation → knownIssues inconclusive", async () => {
  const { dispatch } = sequenceDispatch(["not json at all"]);
  const result = await runValidation({
    dispatch,
    cwd: process.cwd(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.report, null);
  assert.equal(result.rounds, 1);
  assert.ok(
    result.knownIssues.some((s) => /inconclusive/i.test(s)),
    `knownIssues should mention inconclusive, got: ${JSON.stringify(result.knownIssues)}`,
  );
});
