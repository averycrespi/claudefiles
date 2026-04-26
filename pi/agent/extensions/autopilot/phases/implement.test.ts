import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runImplement } from "./implement.ts";
import { taskList } from "../../task-list/api.ts";
import type { Subagent } from "../../workflow-core/lib/subagent.ts";
import type {
  DispatchSpec,
  DispatchResult,
} from "../../workflow-core/lib/types.ts";
import type { TSchema } from "@sinclair/typebox";

beforeEach(() => {
  taskList.clear();
});

afterEach(() => {
  taskList.clear();
});

const successData = {
  outcome: "success" as const,
  commit: "abc1234",
  summary: "did it",
};

const failureData = {
  outcome: "failure" as const,
  commit: null,
  summary: "blocked: missing dep",
};

function makeSubagent(
  dispatchFn: (spec: DispatchSpec<TSchema>) => Promise<DispatchResult<TSchema>>,
): Subagent {
  return {
    dispatch: dispatchFn as Subagent["dispatch"],
    parallel: async (specs) =>
      Promise.all(specs.map((s) => dispatchFn(s))) as any,
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

test("runImplement marks task completed on success + real commit", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => ({
      ok: true,
      data: successData,
      raw: JSON.stringify(successData),
    })),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.ok, true);
  const t = taskList.get(1);
  assert.equal(t?.status, "completed");
  assert.equal(t?.summary, "did it");
});

test("runImplement marks task failed and breaks on failure report", async () => {
  taskList.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => {
      dispatchCount++;
      return { ok: true, data: failureData, raw: JSON.stringify(failureData) };
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  assert.equal(dispatchCount, 1, "loop should break after first failure");
  const t1 = taskList.get(1);
  assert.equal(t1?.status, "failed");
  const t2 = taskList.get(2);
  assert.equal(t2?.status, "pending", "later tasks remain pending");
});

test("runImplement treats phantom success (HEAD unchanged) as failure", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => ({
      ok: true,
      data: successData,
      raw: JSON.stringify(successData),
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  const t = taskList.get(1);
  assert.equal(t?.status, "failed");
  assert.match(t?.failureReason ?? "", /no new commit/i);
});

test("runImplement treats schema/parse dispatch failure as failure", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => ({
      ok: false as const,
      reason: "parse" as const,
      error: "JSON parse error: unexpected token",
      raw: "not json at all",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  const t = taskList.get(1);
  assert.equal(t?.status, "failed");
});

test("runImplement marks task failed and breaks after dispatch failure", async () => {
  taskList.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => {
      dispatchCount++;
      return {
        ok: false as const,
        reason: "dispatch" as const,
        error: "dispatch failed",
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  assert.equal(dispatchCount, 1);
  const t1 = taskList.get(1);
  assert.equal(t1?.status, "failed");
  assert.match(t1?.failureReason ?? "", /dispatch/i);
  const t2 = taskList.get(2);
  assert.equal(t2?.status, "pending", "later tasks remain pending");
});

test("runImplement handles aborted dispatch result as failure", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => ({
      ok: false as const,
      reason: "aborted" as const,
      error: "aborted",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
});

test("runImplement handles timeout dispatch result as failure", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => ({
      ok: false as const,
      reason: "timeout" as const,
      error: "timed out",
    })),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
});

test("runImplement does not retry on outcome: failure (semantic, not transient)", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => {
      dispatchCount++;
      return {
        ok: true,
        data: failureData,
        raw: JSON.stringify(failureData),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(dispatchCount, 1, "semantic failure is not retried");
});

test("runImplement does not retry phantom success (HEAD unchanged)", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => {
      dispatchCount++;
      return {
        ok: true,
        data: successData,
        raw: JSON.stringify(successData),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.ok, false);
  assert.equal(
    dispatchCount,
    1,
    "phantom success signals a real bug — retrying would mask it",
  );
});

test("runImplement skips non-pending tasks", async () => {
  taskList.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  // Pre-complete task 1.
  taskList.start(1);
  taskList.complete(1, "already done");

  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    subagent: makeSubagent(async () => {
      dispatchCount++;
      return {
        ok: true,
        data: successData,
        raw: JSON.stringify(successData),
      };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.ok, true);
  assert.equal(dispatchCount, 1, "only pending task dispatched");
  assert.equal(taskList.get(1)?.status, "completed");
  assert.equal(taskList.get(1)?.summary, "already done");
  assert.equal(taskList.get(2)?.status, "completed");
});

test("runImplement passes correct tools and intent to subagent.dispatch", async () => {
  taskList.create([{ title: "my-task", description: "do the thing" }]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedSpec: any = null;
  const result = await runImplement({
    archNotes: "arch",
    subagent: makeSubagent(async (spec) => {
      capturedSpec = spec;
      return { ok: true, data: successData, raw: JSON.stringify(successData) };
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.ok, true);
  assert.ok(capturedSpec);
  assert.equal(capturedSpec.intent, "Implement: my-task");
  assert.ok(capturedSpec.tools.includes("read"));
  assert.ok(capturedSpec.tools.includes("edit"));
  assert.ok(capturedSpec.tools.includes("write"));
  assert.ok(capturedSpec.tools.includes("bash"));
  assert.ok(
    (capturedSpec.extensions ?? []).includes("autoformat"),
    "autoformat extension must be requested",
  );
});
