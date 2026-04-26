import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlan } from "./plan.ts";
import type { Subagent } from "../../workflow-core/lib/subagent.ts";
import type {
  DispatchSpec,
  DispatchResult,
} from "../../workflow-core/lib/types.ts";
import type { TSchema } from "@sinclair/typebox";

function makeSubagent(
  dispatchFn: (spec: DispatchSpec<TSchema>) => Promise<DispatchResult<TSchema>>,
): Subagent {
  return {
    dispatch: dispatchFn as Subagent["dispatch"],
    parallel: async (specs) =>
      Promise.all(specs.map((s) => dispatchFn(s))) as any,
  };
}

const okData = {
  architecture_notes: "short notes",
  tasks: [
    { title: "A", description: "a" },
    { title: "B", description: "b" },
  ],
};

const okSubagent = makeSubagent(async () => ({
  ok: true,
  data: okData,
  raw: JSON.stringify(okData),
}));

test("runPlan returns the parsed report on success", async () => {
  const r = await runPlan({ designPath: "x.md", subagent: okSubagent });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.tasks.length, 2);
});

test("runPlan returns ok:false on schema dispatch failure (parse error)", async () => {
  const subagent = makeSubagent(async () => ({
    ok: false as const,
    reason: "parse" as const,
    error: "JSON parse error: unexpected token",
    raw: "not json",
  }));
  const r = await runPlan({ designPath: "x.md", subagent });
  assert.equal(r.ok, false);
});

test("runPlan returns ok:false on schema validation failure", async () => {
  const subagent = makeSubagent(async () => ({
    ok: false as const,
    reason: "schema" as const,
    error: "Schema validation failed: /architecture_notes: expected string",
    raw: JSON.stringify({ architecture_notes: 1 }),
  }));
  const r = await runPlan({ designPath: "x.md", subagent });
  assert.equal(r.ok, false);
});

test("runPlan propagates dispatch failure error", async () => {
  const subagent = makeSubagent(async () => ({
    ok: false as const,
    reason: "dispatch" as const,
    error: "boom",
  }));
  const r = await runPlan({ designPath: "x.md", subagent });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "boom");
});

test("runPlan returns ok:false on timeout", async () => {
  const subagent = makeSubagent(async () => ({
    ok: false as const,
    reason: "timeout" as const,
    error: "timed out",
  }));
  const r = await runPlan({ designPath: "x.md", subagent });
  assert.equal(r.ok, false);
});

test("runPlan returns ok:false on aborted", async () => {
  const subagent = makeSubagent(async () => ({
    ok: false as const,
    reason: "aborted" as const,
    error: "aborted",
  }));
  const r = await runPlan({ designPath: "x.md", subagent });
  assert.equal(r.ok, false);
});

test("runPlan passes correct tools and intent to subagent.dispatch", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedSpec: any = null;
  const subagent = makeSubagent(async (spec) => {
    capturedSpec = spec;
    return { ok: true, data: okData, raw: JSON.stringify(okData) };
  });
  await runPlan({ designPath: "design.md", subagent });
  assert.ok(capturedSpec);
  assert.equal(capturedSpec.intent, "Plan");
  assert.deepEqual(capturedSpec.tools, ["read", "ls", "find", "grep"]);
  assert.ok(capturedSpec.prompt.includes("design.md"));
});
