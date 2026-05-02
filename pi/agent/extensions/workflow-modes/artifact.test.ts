import { test } from "node:test";
import assert from "node:assert/strict";
import { applyExactTextEdits, resolvePlanFilePath } from "./artifact.ts";

test("resolvePlanFilePath scopes bare filenames and explicit .plans paths into repo-root .plans", () => {
  const cwd = "/repo";

  assert.deepEqual(resolvePlanFilePath(cwd, "auth.md"), {
    ok: true,
    absolutePath: "/repo/.plans/auth.md",
    displayPath: ".plans/auth.md",
  });
  assert.deepEqual(resolvePlanFilePath(cwd, ".plans/nested/auth.md"), {
    ok: true,
    absolutePath: "/repo/.plans/nested/auth.md",
    displayPath: ".plans/nested/auth.md",
  });
});

test("resolvePlanFilePath rejects paths outside .plans and non-markdown targets", () => {
  const cwd = "/repo";

  assert.equal(resolvePlanFilePath(cwd, "../README.md").ok, false);
  assert.equal(resolvePlanFilePath(cwd, "notes.txt").ok, false);
});

test("applyExactTextEdits applies multiple disjoint replacements against the original content", () => {
  const result = applyExactTextEdits("alpha\nbeta\ngamma\n", [
    { oldText: "alpha", newText: "one" },
    { oldText: "gamma", newText: "three" },
  ]);

  assert.deepEqual(result, {
    ok: true,
    content: "one\nbeta\nthree\n",
  });
});

test("applyExactTextEdits rejects non-unique matches", () => {
  const result = applyExactTextEdits("alpha\nbeta\nalpha\n", [
    { oldText: "alpha", newText: "one" },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /must match exactly once/i);
  }
});
