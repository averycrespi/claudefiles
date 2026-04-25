import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { Type } from "@sinclair/typebox";
import { createSubagent } from "./subagent.ts";
import type { SpawnOutcome } from "../../subagents/api.ts";

const Schema = Type.Object({ outcome: Type.String(), n: Type.Number() });

function fakeSpawn(stdout: string) {
  return async () => ({
    ok: true,
    aborted: false,
    stdout,
    stderr: "",
    exitCode: 0,
    signal: null,
  });
}

describe("Subagent.dispatch — happy path", () => {
  test("returns ok:true with parsed data", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn(`{"outcome":"go","n":7}`),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "test",
      prompt: "do",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { outcome: "go", n: 7 });
  });
});

const failedSpawn = (
  errorMessage: string,
  aborted = false,
): (() => Promise<SpawnOutcome>) => {
  return async () => ({
    ok: false,
    aborted,
    stdout: "",
    stderr: "",
    exitCode: 1,
    signal: null,
    errorMessage,
  });
};

describe("Subagent.dispatch — failures", () => {
  test("dispatch failure → reason: 'dispatch'", async () => {
    const sub = createSubagent({ spawn: failedSpawn("crashed"), cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "dispatch");
      assert.match(r.error, /crashed/);
    }
  });

  test("aborted dispatch → reason: 'aborted'", async () => {
    const sub = createSubagent({
      spawn: failedSpawn("aborted by signal", true),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "aborted");
  });

  test("invalid JSON → reason: 'parse'", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn("not valid json"),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "parse");
  });

  test("schema mismatch → reason: 'schema'", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn(`{"outcome":1,"n":"x"}`),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "schema");
  });
});

describe("Subagent.dispatch — retry policy", () => {
  test("retries once on transient dispatch failure (default policy)", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          aborted: false,
          stdout: "",
          stderr: "",
          exitCode: 1,
          signal: null,
          errorMessage: "transient",
        };
      }
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "Plan",
      prompt: "x",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, true);
    assert.equal(calls, 2);
  });

  test("does not retry parse failures", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: true,
        aborted: false,
        stdout: "not json",
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry aborted dispatches", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: "SIGTERM" as NodeJS.Signals,
        errorMessage: "aborted",
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry when retry policy is 'none'", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        signal: null,
        errorMessage: "transient",
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
      retry: "none",
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry when run-level signal already aborted", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        signal: null,
        errorMessage: "transient",
      };
    };
    const ctl = new AbortController();
    ctl.abort();
    const sub = createSubagent({
      spawn: spawn as any,
      cwd: "/tmp",
      signal: ctl.signal,
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("retry's intent gets '(retry)' suffix in the lifecycle event", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          aborted: false,
          stdout: "",
          stderr: "",
          exitCode: 1,
          signal: null,
          errorMessage: "transient",
        };
      }
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const intents: string[] = [];
    const sub = createSubagent({
      spawn: spawn as any,
      cwd: "/tmp",
      onSubagentLifecycle: (e) => {
        if (e.kind === "start") intents.push(e.spec.intent);
      },
    });
    await sub.dispatch({
      intent: "Plan",
      prompt: "x",
      schema: Schema,
      tools: [],
    });
    assert.deepEqual(intents, ["Plan", "Plan (retry)"]);
  });
});

describe("Subagent.parallel", () => {
  test("dispatches all specs concurrently and returns results in order", async () => {
    const order: string[] = [];
    const spawn = async (inv: any) => {
      order.push(`start:${inv.prompt}`);
      await new Promise((r) => setTimeout(r, inv.prompt === "fast" ? 5 : 50));
      order.push(`end:${inv.prompt}`);
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const results = await sub.parallel([
      { intent: "a", prompt: "slow", schema: Schema, tools: [] },
      { intent: "b", prompt: "fast", schema: Schema, tools: [] },
    ]);
    assert.equal(results.length, 2);
    // both started before either ended
    assert.equal(order[0].startsWith("start:"), true);
    assert.equal(order[1].startsWith("start:"), true);
    // fast finished first
    assert.equal(order[2], "end:fast");
  });

  test("concurrency=1 serializes dispatches", async () => {
    const order: string[] = [];
    const spawn = async (inv: any) => {
      order.push(`s:${inv.prompt}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`e:${inv.prompt}`);
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    await sub.parallel(
      [
        { intent: "a", prompt: "1", schema: Schema, tools: [] },
        { intent: "b", prompt: "2", schema: Schema, tools: [] },
      ],
      { concurrency: 1 },
    );
    // each dispatch fully completes before the next starts
    assert.deepEqual(order, ["s:1", "e:1", "s:2", "e:2"]);
  });
});
