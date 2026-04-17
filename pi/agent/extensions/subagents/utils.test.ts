import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expandHome, resolvePath, resolveExtensionAllowlist } from "./utils.ts";

async function makeTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "subagents-utils-test-"));
}

test("expandHome: lone tilde returns homedir", () => {
  assert.equal(expandHome("~"), homedir());
});

test("expandHome: ~/foo expands under homedir", () => {
  assert.equal(expandHome("~/foo/bar"), join(homedir(), "foo/bar"));
});

test("expandHome: absolute path passes through", () => {
  assert.equal(expandHome("/etc/hosts"), "/etc/hosts");
});

test("expandHome: relative path passes through unchanged", () => {
  assert.equal(expandHome("relative/path"), "relative/path");
});

test("expandHome: tilde not at start is left alone", () => {
  assert.equal(expandHome("some/~/file"), "some/~/file");
});

test("resolvePath: absolute target ignores base", () => {
  assert.equal(resolvePath("/base", "/abs/target"), "/abs/target");
});

test("resolvePath: ~/x expands under homedir regardless of base", () => {
  assert.equal(resolvePath("/base", "~/x"), join(homedir(), "x"));
});

test("resolvePath: relative target is resolved against base", () => {
  assert.equal(resolvePath("/base/dir", "sub/file"), "/base/dir/sub/file");
});

test("resolveExtensionAllowlist: empty input returns empty array", async () => {
  const result = await resolveExtensionAllowlist([], "/any");
  assert.deepEqual(result, []);
});

test("resolveExtensionAllowlist: finds extension dir under cwd/.pi/extensions", async () => {
  const cwd = await makeTempDir();
  try {
    const extDir = join(cwd, ".pi/extensions/my-ext");
    await mkdir(extDir, { recursive: true });
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = join(cwd, "nonexistent-agent-dir");
    try {
      const result = await resolveExtensionAllowlist(["my-ext"], cwd);
      assert.deepEqual(result, [extDir]);
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveExtensionAllowlist: finds extension .ts file by basename", async () => {
  const cwd = await makeTempDir();
  try {
    const extFile = join(cwd, ".pi/extensions/tool.ts");
    await mkdir(join(cwd, ".pi/extensions"), { recursive: true });
    await writeFile(extFile, "export default () => {};");
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = join(cwd, "nonexistent-agent-dir");
    try {
      const result = await resolveExtensionAllowlist(["tool"], cwd);
      assert.deepEqual(result, [extFile]);
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveExtensionAllowlist: returns empty when name doesn't match", async () => {
  const cwd = await makeTempDir();
  try {
    await mkdir(join(cwd, ".pi/extensions/other"), { recursive: true });
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = join(cwd, "nonexistent-agent-dir");
    try {
      const result = await resolveExtensionAllowlist(["missing"], cwd);
      assert.deepEqual(result, []);
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveExtensionAllowlist: dedupes identical paths across multiple roots", async () => {
  const cwd = await makeTempDir();
  try {
    // Make an agent dir with extensions/foo AND point settings.json at the same
    // location so the same path shows up twice.
    const agentDir = await makeTempDir();
    const extDir = join(agentDir, "extensions/foo");
    await mkdir(extDir, { recursive: true });
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ extensions: [join(agentDir, "extensions")] }),
    );

    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      const result = await resolveExtensionAllowlist(["foo"], cwd);
      assert.deepEqual(result, [extDir]);
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
      await rm(agentDir, { recursive: true, force: true });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveExtensionAllowlist: ignores blank names", async () => {
  const cwd = await makeTempDir();
  try {
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = join(cwd, "nonexistent-agent-dir");
    try {
      const result = await resolveExtensionAllowlist(["", "   "], cwd);
      assert.deepEqual(result, []);
    } finally {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
