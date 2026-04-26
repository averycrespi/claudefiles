import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidation } from "./validate.ts";
import type { Subagent } from "../../_workflow-core/lib/subagent.ts";
import type {
  DispatchSpec,
  DispatchResult,
} from "../../_workflow-core/lib/types.ts";
import type { TSchema } from "@sinclair/typebox";

const allPassData = {
  test: { status: "pass" as const, command: "bun test", output: "" },
  lint: { status: "pass" as const, command: "bun run lint", output: "" },
  typecheck: { status: "skipped" as const, command: "", output: "" },
};

const testFailData = {
  test: {
    status: "fail" as const,
    command: "bun test",
    output: "FAIL: expected 1 to equal 2",
  },
  lint: { status: "pass" as const, command: "bun run lint", output: "" },
  typecheck: { status: "skipped" as const, command: "", output: "" },
};

const fixerSuccessData = {
  outcome: "success" as const,
  commit: "fix1234",
  fixed: ["test: expected 1 to equal 2"],
  unresolved: [],
};

const fixerFailureData = {
  outcome: "failure" as const,
  commit: null,
  fixed: [],
  unresolved: ["test: expected 1 to equal 2"],
};

/** Builds a Subagent that returns results from an ordered sequence of data objects. */
function sequenceSubagent(results: DispatchResult<TSchema>[]) {
  let i = 0;
  const calls: DispatchSpec<TSchema>[] = [];
  const subagent: Subagent = {
    dispatch: async (spec) => {
      calls.push(spec as DispatchSpec<TSchema>);
      const result = results[Math.min(i, results.length - 1)];
      i++;
      return result as any;
    },
    parallel: async (specs) =>
      Promise.all(specs.map((s) => subagent.dispatch(s))) as any,
  };
  return { subagent, calls, getCallCount: () => i };
}

test("runValidation: pass path — first validation all pass", async () => {
  const { subagent, getCallCount } = sequenceSubagent([
    { ok: true, data: allPassData, raw: JSON.stringify(allPassData) },
  ]);
  const result = await runValidation({ subagent });
  assert.equal(result.ok, true);
  assert.equal(result.rounds, 1);
  assert.deepEqual(result.knownIssues, []);
  assert.ok(result.report);
  assert.equal(result.report?.test.status, "pass");
  assert.equal(getCallCount(), 1, "only validation dispatched, no fixer");
});

test("runValidation: fix + re-pass — fail, fixer success, pass", async () => {
  const { subagent, calls, getCallCount } = sequenceSubagent([
    { ok: true, data: testFailData, raw: JSON.stringify(testFailData) },
    { ok: true, data: fixerSuccessData, raw: JSON.stringify(fixerSuccessData) },
    { ok: true, data: allPassData, raw: JSON.stringify(allPassData) },
  ]);
  const result = await runValidation({ subagent });
  assert.equal(result.ok, true);
  assert.equal(result.rounds, 2);
  assert.deepEqual(result.knownIssues, []);
  assert.ok(result.report);
  assert.equal(result.report?.test.status, "pass");
  assert.equal(getCallCount(), 3, "validation + fixer + validation");
  // Fixer dispatch (call #2) must have edit/write tools.
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
  const { subagent } = sequenceSubagent([
    { ok: true, data: testFailData, raw: JSON.stringify(testFailData) },
    { ok: true, data: fixerFailureData, raw: JSON.stringify(fixerFailureData) },
    { ok: true, data: testFailData, raw: JSON.stringify(testFailData) },
  ]);
  const result = await runValidation({ subagent, maxFixRounds: 2 });
  assert.equal(result.ok, true);
  assert.ok(result.knownIssues.length > 0, "knownIssues must be nonempty");
  assert.ok(
    result.knownIssues.some((s) => /test/i.test(s)),
    `knownIssues should mention test failure, got: ${JSON.stringify(result.knownIssues)}`,
  );
});

test("runValidation: validation dispatch failure → knownIssues inconclusive", async () => {
  const { subagent } = sequenceSubagent([
    {
      ok: false,
      reason: "dispatch" as const,
      error: "boom",
    },
  ]);
  const result = await runValidation({ subagent });
  assert.equal(result.ok, true);
  assert.equal(result.report, null);
  assert.ok(
    result.knownIssues.some((s) => /validation inconclusive/i.test(s)),
    `knownIssues should mention validation inconclusive, got: ${JSON.stringify(result.knownIssues)}`,
  );
});

test("runValidation: fixer dispatch failure → knownIssues mentions fixer, loop terminates", async () => {
  let callIdx = 0;
  const subagent: Subagent = {
    dispatch: async () => {
      callIdx++;
      if (callIdx === 1) {
        return {
          ok: true,
          data: testFailData,
          raw: JSON.stringify(testFailData),
        } as any;
      }
      return {
        ok: false,
        reason: "dispatch" as const,
        error: "fixer blew up",
      } as any;
    },
    parallel: async (specs) =>
      Promise.all(specs.map((s) => subagent.dispatch(s))) as any,
  };
  const result = await runValidation({ subagent });
  assert.equal(result.ok, true);
  assert.ok(
    result.knownIssues.some((s) => /fixer dispatch failed/i.test(s)),
    `knownIssues should mention fixer dispatch failed, got: ${JSON.stringify(result.knownIssues)}`,
  );
  assert.equal(callIdx, 2, "loop terminates after fixer dispatch failure");
});

test("runValidation: parse failure on validation → knownIssues inconclusive", async () => {
  const { subagent } = sequenceSubagent([
    {
      ok: false,
      reason: "parse" as const,
      error: "JSON parse error: unexpected token",
      raw: "not json at all",
    },
  ]);
  const result = await runValidation({ subagent });
  assert.equal(result.ok, true);
  assert.equal(result.report, null);
  assert.equal(result.rounds, 1);
  assert.ok(
    result.knownIssues.some((s) => /inconclusive/i.test(s)),
    `knownIssues should mention inconclusive, got: ${JSON.stringify(result.knownIssues)}`,
  );
  // Must embed the parse error directly (not "dispatch failed") so
  // transport failures and unparseable-output failures are distinguishable.
  assert.ok(
    result.knownIssues.some((s) =>
      s.includes("JSON parse error: unexpected token"),
    ),
    `knownIssues should embed parse error text, got: ${JSON.stringify(result.knownIssues)}`,
  );
  assert.ok(
    !result.knownIssues.some((s) => /dispatch failed/i.test(s)),
    `knownIssues must not say "dispatch failed" for a parse error, got: ${JSON.stringify(result.knownIssues)}`,
  );
});

test("runValidation: all dispatches use retry: none", async () => {
  const { subagent, calls } = sequenceSubagent([
    { ok: true, data: testFailData, raw: JSON.stringify(testFailData) },
    { ok: true, data: fixerSuccessData, raw: JSON.stringify(fixerSuccessData) },
    { ok: true, data: allPassData, raw: JSON.stringify(allPassData) },
  ]);
  await runValidation({ subagent });
  for (const call of calls) {
    assert.equal(
      call.retry,
      "none",
      `expected retry: none on call with intent "${call.intent}"`,
    );
  }
});
