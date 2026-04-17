import { test } from "node:test";
import assert from "node:assert/strict";
import { codexAdapter, parseWindow } from "./codex.ts";

test("codexAdapter.handles matches the openai-codex provider id only", () => {
  assert.equal(codexAdapter.handles("openai-codex"), true);
  assert.equal(codexAdapter.handles("openai"), false);
  assert.equal(codexAdapter.handles("anthropic"), false);
  assert.equal(codexAdapter.handles(""), false);
});

test("codexAdapter has a human-readable label", () => {
  assert.equal(codexAdapter.label, "Codex");
});

test("parseWindow returns undefined for falsy input", () => {
  assert.equal(parseWindow(undefined), undefined);
  assert.equal(parseWindow(null), undefined);
  assert.equal(parseWindow(0), undefined);
});

test("parseWindow maps snake_case fields to WindowStats shape", () => {
  assert.deepEqual(
    parseWindow({ used_percent: 42, reset_after_seconds: 3600 }),
    { usedPercent: 42, resetAfterSeconds: 3600 },
  );
});

test("parseWindow passes through missing subfields as undefined", () => {
  assert.deepEqual(parseWindow({}), {
    usedPercent: undefined,
    resetAfterSeconds: undefined,
  });
  assert.deepEqual(parseWindow({ used_percent: 10 }), {
    usedPercent: 10,
    resetAfterSeconds: undefined,
  });
});
