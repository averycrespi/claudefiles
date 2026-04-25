import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHandoff, writeHandoff, isBootstrap } from "./handoff.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "autoralph-handoff-"));
}

test("readHandoff returns null when file does not exist", async () => {
  const dir = tempDir();
  try {
    const result = await readHandoff(join(dir, "missing.handoff.json"));
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeHandoff then readHandoff round-trips", async () => {
  const dir = tempDir();
  const path = join(dir, "design.handoff.json");
  try {
    await writeHandoff(path, "I tried X, next try Y");
    const result = await readHandoff(path);
    assert.equal(result, "I tried X, next try Y");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeHandoff creates parent directory if missing", async () => {
  const dir = tempDir();
  const path = join(dir, "nested", "design.handoff.json");
  try {
    await writeHandoff(path, "x");
    const result = await readHandoff(path);
    assert.equal(result, "x");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isBootstrap returns true when no handoff file exists", async () => {
  const dir = tempDir();
  try {
    const result = await isBootstrap(join(dir, "missing.handoff.json"));
    assert.equal(result, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isBootstrap returns false after a handoff has been written", async () => {
  const dir = tempDir();
  const path = join(dir, "design.handoff.json");
  try {
    await writeHandoff(path, "anything");
    const result = await isBootstrap(path);
    assert.equal(result, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
