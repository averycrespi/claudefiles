import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyExactTextEdits,
  ensureSpecsExcluded,
  resolveArtifactPath,
  resolveSpecDir,
} from "./artifacts.ts";

test("resolveSpecDir validates slug and prevents traversal", () => {
  assert.equal(resolveSpecDir("/repo", "my-spec").ok, true);
  assert.equal(resolveSpecDir("/repo", "../evil").ok, false);
  assert.equal(resolveSpecDir("/repo", "Bad_Spec").ok, false);
});

test("resolveArtifactPath allows only known basenames", () => {
  assert.equal(resolveArtifactPath("/repo", "my-spec", "tasks.md").ok, true);
  assert.equal(
    resolveArtifactPath("/repo", "my-spec", "/tmp/tasks.md").ok,
    false,
  );
  assert.equal(
    resolveArtifactPath("/repo", "my-spec", "../tasks.md").ok,
    false,
  );
  assert.equal(resolveArtifactPath("/repo", "my-spec", "notes.md").ok, false);
});

test("applyExactTextEdits rejects duplicate, missing, and overlapping edits", () => {
  assert.equal(
    applyExactTextEdits("a b a", [{ oldText: "a", newText: "x" }]).ok,
    false,
  );
  assert.equal(
    applyExactTextEdits("abc", [{ oldText: "z", newText: "x" }]).ok,
    false,
  );
  assert.equal(
    applyExactTextEdits("abcdef", [
      { oldText: "abc", newText: "x" },
      { oldText: "bcd", newText: "y" },
    ]).ok,
    false,
  );
});

test("ensureSpecsExcluded is idempotent and writes .git/info/exclude", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-workflow-"));
  try {
    const first = await ensureSpecsExcluded(dir);
    assert.deepEqual(first, {
      ok: true,
      changed: true,
      path: ".git/info/exclude",
    });
    const second = await ensureSpecsExcluded(dir);
    assert.deepEqual(second, {
      ok: true,
      changed: false,
      path: ".git/info/exclude",
    });
    assert.match(
      await readFile(join(dir, ".git/info/exclude"), "utf8"),
      /^\.specs\/\n$/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
