import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistory, appendHistory, type IterationRecord } from "./history.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "autoralph-history-"));
}

const sampleRecord = (
  n: number,
  outcome: IterationRecord["outcome"],
): IterationRecord => ({
  iteration: n,
  outcome,
  summary: `iter ${n}`,
  headBefore: "sha0",
  headAfter: outcome === "in_progress" ? "sha1" : "sha0",
  durationMs: 1000 * n,
  reflection: false,
});

test("readHistory returns empty array when file does not exist", async () => {
  const dir = tempDir();
  try {
    const result = await readHistory(join(dir, "missing.history.json"));
    assert.deepEqual(result, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory creates the file on first call", async () => {
  const dir = tempDir();
  const path = join(dir, "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    const result = await readHistory(path);
    assert.equal(result.length, 1);
    assert.equal(result[0].iteration, 1);
    assert.equal(result[0].outcome, "in_progress");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory preserves prior entries", async () => {
  const dir = tempDir();
  const path = join(dir, "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    await appendHistory(path, sampleRecord(2, "in_progress"));
    await appendHistory(path, sampleRecord(3, "complete"));
    const result = await readHistory(path);
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((r) => r.iteration),
      [1, 2, 3],
    );
    assert.equal(result[2].outcome, "complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory creates parent directory if missing", async () => {
  const dir = tempDir();
  const path = join(dir, "nested", "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    const result = await readHistory(path);
    assert.equal(result.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readHistory returns empty array on corrupt JSON", async () => {
  const dir = tempDir();
  const path = join(dir, "broken.history.json");
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile(path, "{not json", "utf8");
    const result = await readHistory(path);
    assert.deepEqual(result, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
