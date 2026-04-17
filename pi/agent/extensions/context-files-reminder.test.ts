import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildFingerprint,
  discoverContextFiles,
  getAgentDir,
  getCurrentDate,
  loadContextFileFromDir,
  renderReminder,
  type ContextFile,
} from "./context-files-reminder.ts";

async function makeTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ctx-files-test-"));
}

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

test("getAgentDir defaults to ~/.pi/agent when env var is unset", () => {
  withEnv("PI_CODING_AGENT_DIR", undefined, () => {
    assert.equal(getAgentDir(), join(homedir(), ".pi", "agent"));
  });
});

test("getAgentDir honors PI_CODING_AGENT_DIR when set", () => {
  withEnv("PI_CODING_AGENT_DIR", "/custom/agent/path", () => {
    assert.equal(getAgentDir(), resolve("/custom/agent/path"));
  });
});

test("getAgentDir falls back to default when env var is blank", () => {
  withEnv("PI_CODING_AGENT_DIR", "   ", () => {
    assert.equal(getAgentDir(), join(homedir(), ".pi", "agent"));
  });
});

test("getCurrentDate returns a YYYY-MM-DD string", () => {
  const today = getCurrentDate();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(today, new Date().toISOString().slice(0, 10));
});

test("loadContextFileFromDir returns null when nothing is present", async () => {
  const dir = await makeTempDir();
  try {
    assert.equal(loadContextFileFromDir(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadContextFileFromDir prefers AGENTS.md over CLAUDE.md", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(join(dir, "AGENTS.md"), "agents content");
    await writeFile(join(dir, "CLAUDE.md"), "claude content");
    const result = loadContextFileFromDir(dir);
    assert.ok(result);
    assert.equal(result.path, join(dir, "AGENTS.md"));
    assert.equal(result.content, "agents content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadContextFileFromDir falls back to CLAUDE.md when AGENTS.md is absent", async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(join(dir, "CLAUDE.md"), "claude content");
    const result = loadContextFileFromDir(dir);
    assert.ok(result);
    assert.equal(result.path, join(dir, "CLAUDE.md"));
    assert.equal(result.content, "claude content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discoverContextFiles returns [] when neither agent dir nor cwd has context files", async () => {
  const cwd = await makeTempDir();
  const agentDir = await makeTempDir();
  try {
    assert.deepEqual(discoverContextFiles(cwd, agentDir), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("discoverContextFiles puts the agent-dir context first, then ancestors top-down", async () => {
  const root = await makeTempDir();
  const agentDir = await makeTempDir();
  try {
    await writeFile(join(agentDir, "AGENTS.md"), "global");

    // Create nested ancestor chain: root/project/sub
    const project = join(root, "project");
    const sub = join(project, "sub");
    await mkdir(sub, { recursive: true });
    await writeFile(join(project, "AGENTS.md"), "project-level");
    await writeFile(join(sub, "AGENTS.md"), "sub-level");

    const files = discoverContextFiles(sub, agentDir);
    const paths = files.map((f) => f.path);
    assert.equal(paths[0], join(agentDir, "AGENTS.md"));
    const projectIdx = paths.indexOf(join(project, "AGENTS.md"));
    const subIdx = paths.indexOf(join(sub, "AGENTS.md"));
    assert.ok(projectIdx > 0, "project-level should follow global");
    assert.ok(subIdx > projectIdx, "sub-level should come after project-level");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("discoverContextFiles dedupes when agent dir equals an ancestor", async () => {
  const agentDir = await makeTempDir();
  const cwd = join(agentDir, "child");
  try {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(agentDir, "AGENTS.md"), "shared");
    const files = discoverContextFiles(cwd, agentDir);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, join(agentDir, "AGENTS.md"));
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("buildFingerprint changes when mtime changes", async () => {
  const dir = await makeTempDir();
  try {
    const path = join(dir, "AGENTS.md");
    await writeFile(path, "v1");
    const file: ContextFile = { path, content: "v1" };
    const before = buildFingerprint([file], "2026-04-17");

    const older = new Date(Date.now() - 60_000);
    await utimes(path, older, older);
    const after = buildFingerprint([file], "2026-04-17");

    assert.notEqual(before, after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildFingerprint changes when the date component changes", async () => {
  const dir = await makeTempDir();
  try {
    const path = join(dir, "AGENTS.md");
    await writeFile(path, "v1");
    const file: ContextFile = { path, content: "v1" };
    const a = buildFingerprint([file], "2026-04-17");
    const b = buildFingerprint([file], "2026-04-18");
    assert.notEqual(a, b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildFingerprint marks missing files with ':missing'", () => {
  const fp = buildFingerprint(
    [{ path: "/definitely/does/not/exist.md", content: "" }],
    "2026-04-17",
  );
  assert.match(fp, /:missing/);
  assert.match(fp, /date:2026-04-17/);
});

test("renderReminder includes each file path, content, the date, and system-reminder tags", () => {
  const files: ContextFile[] = [
    { path: "/a/AGENTS.md", content: "alpha content\n" },
    { path: "/b/CLAUDE.md", content: "bravo content" },
  ];
  const out = renderReminder(files, "2026-04-17");
  assert.match(out, /^<system-reminder>/);
  assert.match(out, /<\/system-reminder>$/);
  assert.match(out, /Contents of \/a\/AGENTS\.md/);
  assert.match(out, /alpha content/);
  assert.match(out, /Contents of \/b\/CLAUDE\.md/);
  assert.match(out, /bravo content/);
  assert.match(out, /Today's date is 2026-04-17\./);
});

test("renderReminder trims per-file content but preserves file ordering", () => {
  const files: ContextFile[] = [
    { path: "/a/AGENTS.md", content: "\n\n  first  \n\n" },
    { path: "/b/AGENTS.md", content: "\n\nsecond\n\n" },
  ];
  const out = renderReminder(files, "2026-04-17");
  const firstIdx = out.indexOf("first");
  const secondIdx = out.indexOf("second");
  assert.ok(firstIdx >= 0 && secondIdx > firstIdx);
  // Trimmed: no leading/trailing blank line around "first"
  assert.match(out, /AGENTS\.md \(Pi context instructions\):\n\nfirst\n\n/);
});
