import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preflight } from "./preflight.ts";

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "autopilot-preflight-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "initial\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: dir });
  return dir;
}

test("fails when design file does not exist", async () => {
  const dir = makeTempRepo();
  try {
    const r = await preflight({
      designPath: "/does/not/exist.md",
      cwd: dir,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /design file/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails when design file is not a regular file", async () => {
  const dir = makeTempRepo();
  try {
    const r = await preflight({ designPath: dir, cwd: dir });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /design file/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails when design file is empty", async () => {
  const dir = makeTempRepo();
  const designDir = mkdtempSync(join(tmpdir(), "autopilot-design-"));
  const design = join(designDir, "design.md");
  writeFileSync(design, "");
  try {
    const r = await preflight({ designPath: design, cwd: dir });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /empty/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(designDir, { recursive: true, force: true });
  }
});

test("fails when working tree is dirty", async () => {
  const dir = makeTempRepo();
  const designDir = mkdtempSync(join(tmpdir(), "autopilot-design-"));
  const design = join(designDir, "design.md");
  writeFileSync(design, "# design\n");
  // Create an uncommitted file (untracked counts as dirty for porcelain)
  writeFileSync(join(dir, "dirty.txt"), "uncommitted\n");
  try {
    const r = await preflight({ designPath: design, cwd: dir });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /dirty|commit|stash/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(designDir, { recursive: true, force: true });
  }
});

test("succeeds with clean tree and valid design file", async () => {
  const dir = makeTempRepo();
  const designDir = mkdtempSync(join(tmpdir(), "autopilot-design-"));
  const design = join(designDir, "design.md");
  writeFileSync(design, "# design\n\nSome content.\n");
  try {
    const r = await preflight({ designPath: design, cwd: dir });
    assert.equal(r.ok, true);
    if (r.ok) {
      const expected = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir })
        .toString()
        .trim();
      assert.equal(r.baseSha, expected);
      assert.match(r.designText, /# design/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(designDir, { recursive: true, force: true });
  }
});
