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
