import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runImplement } from "./implement.ts";
import { taskList } from "../../task-list/api.ts";

beforeEach(() => {
  taskList.clear();
});

afterEach(() => {
  taskList.clear();
});

const successJson = JSON.stringify({
  outcome: "success",
  commit: "abc1234",
  summary: "did it",
});

const failureJson = JSON.stringify({
  outcome: "failure",
  commit: null,
  summary: "blocked: missing dep",
});

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
    dispatch: async () => ({ ok: true, stdout: successJson }),
    // Before dispatch: sha0, after dispatch: sha1 → HEAD moved → commit made.
    getHead: makeHeadSeq(["sha0", "sha1"]),
    cwd: process.cwd(),
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
    dispatch: async () => {
      dispatchCount++;
      return { ok: true, stdout: failureJson };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
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
    dispatch: async () => ({ ok: true, stdout: successJson }),
    // HEAD never moves → phantom success.
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  const t = taskList.get(1);
  assert.equal(t?.status, "failed");
  assert.match(t?.failureReason ?? "", /no new commit/i);
});

test("runImplement treats unparseable subagent output as failure", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => ({ ok: true, stdout: "not json at all" }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  const t = taskList.get(1);
  assert.equal(t?.status, "failed");
});

test("runImplement marks task failed and breaks after dispatch retry exhausted", async () => {
  taskList.create([
    { title: "a", description: "aa" },
    { title: "b", description: "bb" },
  ]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      return { ok: false, stdout: "", error: "dispatch failed" };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.haltedAtTaskId, 1);
  assert.equal(
    dispatchCount,
    2,
    "task should be retried exactly once before failing",
  );
  const t1 = taskList.get(1);
  assert.equal(t1?.status, "failed");
  assert.match(t1?.failureReason ?? "", /dispatch/i);
  const t2 = taskList.get(2);
  assert.equal(t2?.status, "pending", "later tasks remain pending");
});

test("runImplement retries transient dispatch failure and recovers", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      if (dispatchCount === 1) {
        return { ok: false, stdout: "", error: "transient" };
      }
      return { ok: true, stdout: successJson };
    },
    // First dispatch "crashes" so HEAD is still sha0; retry succeeds → sha1.
    getHead: makeHeadSeq(["sha0", "sha1"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, true);
  assert.equal(dispatchCount, 2);
  assert.equal(taskList.get(1)?.status, "completed");
});

test("runImplement does not retry a dispatch that reported aborted", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      return { ok: false, stdout: "", error: "aborted", aborted: true };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(
    dispatchCount,
    1,
    "aborted dispatch must not be retried — user cancelled",
  );
});

test("runImplement does not retry when run signal is already aborted", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const controller = new AbortController();
  controller.abort();
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      return { ok: false, stdout: "", error: "boom" };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
    signal: controller.signal,
  });
  assert.equal(result.ok, false);
  assert.equal(dispatchCount, 1);
});

test("runImplement does not retry on outcome: failure (semantic, not transient)", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      return { ok: true, stdout: failureJson };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, false);
  assert.equal(dispatchCount, 1, "semantic failure is not retried");
});

test("runImplement does not retry phantom success (HEAD unchanged)", async () => {
  taskList.create([{ title: "a", description: "aa" }]);
  let dispatchCount = 0;
  const result = await runImplement({
    archNotes: "notes",
    dispatch: async () => {
      dispatchCount++;
      return { ok: true, stdout: successJson };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
    cwd: process.cwd(),
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
    dispatch: async () => {
      dispatchCount++;
      return { ok: true, stdout: successJson };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
    cwd: process.cwd(),
  });
  assert.equal(result.ok, true);
  assert.equal(dispatchCount, 1, "only pending task dispatched");
  assert.equal(taskList.get(1)?.status, "completed");
  assert.equal(taskList.get(1)?.summary, "already done");
  assert.equal(taskList.get(2)?.status, "completed");
});
