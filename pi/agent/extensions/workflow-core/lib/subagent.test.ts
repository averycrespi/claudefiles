import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { Type } from "@sinclair/typebox";
import { createSubagent } from "./subagent.ts";

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
