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
