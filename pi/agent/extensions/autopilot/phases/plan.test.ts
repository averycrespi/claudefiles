import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlan } from "./plan.ts";

const okDispatch = async () => ({
  ok: true,
  stdout: JSON.stringify({
    architecture_notes: "short notes",
    tasks: [
      { title: "A", description: "a" },
      { title: "B", description: "b" },
    ],
  }),
});

const badJson = async () => ({ ok: true, stdout: "not json" });
const badSchema = async () => ({
  ok: true,
  stdout: JSON.stringify({ architecture_notes: 1 }),
});

test("runPlan returns the parsed report on success", async () => {
  const r = await runPlan({ designPath: "x.md", dispatch: okDispatch });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.tasks.length, 2);
});

test("runPlan returns ok:false on JSON parse error", async () => {
  const r = await runPlan({ designPath: "x.md", dispatch: badJson });
  assert.equal(r.ok, false);
});

test("runPlan returns ok:false on schema validation error", async () => {
  const r = await runPlan({ designPath: "x.md", dispatch: badSchema });
  assert.equal(r.ok, false);
});

test("runPlan propagates dispatch failure error after exhausting retry", async () => {
  let calls = 0;
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => {
      calls++;
      return { ok: false, stdout: "", error: "boom" };
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "boom");
  assert.equal(calls, 2, "expected exactly one retry on transient failure");
});

test("runPlan falls back to 'dispatch failed' when error is undefined", async () => {
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => ({ ok: false, stdout: "" }),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "dispatch failed");
});

test("runPlan retries transient dispatch failure, then succeeds", async () => {
  let calls = 0;
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => {
      calls++;
      if (calls === 1) return { ok: false, stdout: "", error: "transient" };
      return {
        ok: true,
        stdout: JSON.stringify({
          architecture_notes: "n",
          tasks: [{ title: "A", description: "a" }],
        }),
      };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
});

test("runPlan does not retry when first attempt was aborted", async () => {
  let calls = 0;
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => {
      calls++;
      return { ok: false, stdout: "", error: "aborted", aborted: true };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 1, "aborted dispatch must not be retried");
});

test("runPlan does not retry when run signal is already aborted", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => {
      calls++;
      return { ok: false, stdout: "", error: "boom" };
    },
    signal: controller.signal,
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 1, "must not retry when run signal is already aborted");
});

test("runPlan does not retry parse/schema failures (ok: true response)", async () => {
  let calls = 0;
  const r = await runPlan({
    designPath: "x.md",
    dispatch: async () => {
      calls++;
      return { ok: true, stdout: "not json" };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 1, "parse failures are not transient — no retry");
});
