import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchWithOneRetry,
  type DispatchOptions,
  type DispatchResult,
} from "./dispatch.ts";

function mkOpts(overrides: Partial<DispatchOptions> = {}): DispatchOptions {
  return {
    prompt: "hello",
    tools: [],
    cwd: process.cwd(),
    intent: "Test",
    ...overrides,
  };
}

test("dispatchWithOneRetry: returns success on first attempt without retry", async () => {
  let calls = 0;
  const result = await dispatchWithOneRetry(async () => {
    calls++;
    return { ok: true, stdout: "done" };
  }, mkOpts());
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

test("dispatchWithOneRetry: retries once on transient failure, then succeeds", async () => {
  let calls = 0;
  const intents: Array<string | undefined> = [];
  const result = await dispatchWithOneRetry(
    async (o) => {
      calls++;
      intents.push(o.intent);
      if (calls === 1)
        return {
          ok: false,
          stdout: "",
          error: "boom",
        } satisfies DispatchResult;
      return { ok: true, stdout: "ok" };
    },
    mkOpts({ intent: "Plan" }),
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(intents, ["Plan", "Plan (retry)"]);
  assert.equal(
    result.firstError,
    "boom",
    "first error should surface on successful retry",
  );
});

test("dispatchWithOneRetry: both attempts fail → returns second failure", async () => {
  let calls = 0;
  const result = await dispatchWithOneRetry(async () => {
    calls++;
    return { ok: false, stdout: "", error: `err${calls}` };
  }, mkOpts());
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
  assert.equal(result.error, "err2");
});

test("dispatchWithOneRetry: does not retry when first attempt was aborted", async () => {
  let calls = 0;
  const result = await dispatchWithOneRetry(async () => {
    calls++;
    return {
      ok: false,
      stdout: "",
      error: "aborted",
      aborted: true,
    } satisfies DispatchResult;
  }, mkOpts());
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test("dispatchWithOneRetry: does not retry when run signal is already aborted", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const result = await dispatchWithOneRetry(
    async () => {
      calls++;
      return { ok: false, stdout: "", error: "boom" };
    },
    mkOpts(),
    controller.signal,
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test("dispatchWithOneRetry: untagged intent falls back to undefined on retry", async () => {
  let calls = 0;
  const intents: Array<string | undefined> = [];
  await dispatchWithOneRetry(
    async (o) => {
      calls++;
      intents.push(o.intent);
      return { ok: false, stdout: "", error: "x" };
    },
    mkOpts({ intent: undefined }),
  );
  assert.equal(calls, 2);
  assert.deepEqual(intents, [undefined, undefined]);
});
