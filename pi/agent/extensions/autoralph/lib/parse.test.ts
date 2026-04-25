import { test } from "node:test";
import assert from "node:assert/strict";
import { Type } from "@sinclair/typebox";
import { parseJsonReport } from "./parse.ts";

const Schema = Type.Object({
  outcome: Type.String(),
  commit: Type.Union([Type.String(), Type.Null()]),
});

test("parses clean JSON", () => {
  const r = parseJsonReport('{"outcome":"success","commit":"abc"}', Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.outcome, "success");
});

test("strips ```json ... ``` fences", () => {
  const r = parseJsonReport(
    '```json\n{"outcome":"success","commit":null}\n```',
    Schema,
  );
  assert.equal(r.ok, true);
});

test("strips leading/trailing prose", () => {
  const r = parseJsonReport(
    'Here you go:\n{"outcome":"ok","commit":null}\nDone.',
    Schema,
  );
  assert.equal(r.ok, true);
});

test("returns {ok: false, error} on schema mismatch", () => {
  const r = parseJsonReport('{"outcome":42}', Schema);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /outcome/);
});

test("returns {ok: false, error} on invalid JSON", () => {
  const r = parseJsonReport("not json at all", Schema);
  assert.equal(r.ok, false);
});
