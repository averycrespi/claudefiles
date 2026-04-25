// lib/parse.test.ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { Type } from "@sinclair/typebox";
import { parseJsonReport } from "./parse.ts";

const Schema = Type.Object({ ok: Type.Boolean(), n: Type.Number() });

describe("parseJsonReport", () => {
  test("happy path", () => {
    const r = parseJsonReport(`{"ok": true, "n": 42}`, Schema);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { ok: true, n: 42 });
  });

  test("strips ```json fences", () => {
    const r = parseJsonReport('```json\n{"ok": true, "n": 1}\n```', Schema);
    assert.equal(r.ok, true);
  });

  test("strips leading prose to find the first JSON object", () => {
    const r = parseJsonReport(
      'Some prose before.\n{"ok": true, "n": 1}\nTrailing prose.',
      Schema,
    );
    assert.equal(r.ok, true);
  });

  test("invalid JSON returns ok:false reason 'parse'", () => {
    const r = parseJsonReport("{not json", Schema);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /JSON parse error/);
  });

  test("schema mismatch returns ok:false with field paths", () => {
    const r = parseJsonReport(`{"ok": "yes", "n": 1}`, Schema);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Schema validation/);
  });
});
