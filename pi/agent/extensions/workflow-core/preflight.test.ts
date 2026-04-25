// preflight.test.ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { requireFile, requireCleanTree, captureHead } from "./preflight.ts";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wc-preflight-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=T",
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: dir },
  );
  return dir;
}

describe("requireFile", () => {
  test("ok when file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wc-rf-"));
    const p = join(dir, "x.txt");
    writeFileSync(p, "hi");
    const r = await requireFile(p);
    assert.equal(r.ok, true);
    rmSync(dir, { recursive: true });
  });

  test("ok:false when missing", async () => {
    const r = await requireFile("/no/such/path/xyz");
    assert.equal(r.ok, false);
  });
});

describe("requireCleanTree", () => {
  test("ok on a clean repo", async () => {
    const dir = makeRepo();
    const r = await requireCleanTree(dir);
    assert.equal(r.ok, true);
    rmSync(dir, { recursive: true });
  });

  test("ok:false when there are uncommitted changes", async () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "dirty.txt"), "dirty");
    const r = await requireCleanTree(dir);
    assert.equal(r.ok, false);
    rmSync(dir, { recursive: true });
  });
});

describe("captureHead", () => {
  test("returns the HEAD sha as a 40-char hex string", async () => {
    const dir = makeRepo();
    const sha = await captureHead(dir);
    assert.match(sha, /^[0-9a-f]{40}$/);
    rmSync(dir, { recursive: true });
  });
});
