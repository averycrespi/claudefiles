import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildArgs,
  formatSpawnFailure,
  spawnSubagent,
  type SpawnOutcome,
} from "./spawn.ts";

function baseOutcome(overrides: Partial<SpawnOutcome> = {}): SpawnOutcome {
  return {
    ok: false,
    aborted: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    signal: null,
    ...overrides,
  };
}

// ─── formatSpawnFailure ──────────────────────────────────────────────────────

test("formatSpawnFailure: aborted outcome surfaces aborted message", () => {
  const text = formatSpawnFailure(baseOutcome({ aborted: true }));
  assert.match(text, /aborted/);
});

test("formatSpawnFailure: includes log file when present", () => {
  const text = formatSpawnFailure(
    baseOutcome({ aborted: true, logFile: "/tmp/x.log" }),
  );
  assert.match(text, /\/tmp\/x\.log/);
});

test("formatSpawnFailure: includes errorMessage, exit code, stderr, stdout", () => {
  const text = formatSpawnFailure(
    baseOutcome({
      errorMessage: "subagent exited with code 2",
      exitCode: 2,
      stderr: "boom\n",
      stdout: "partial output\n",
    }),
  );
  assert.match(text, /subagent exited with code 2/);
  assert.match(text, /Exit code: 2/);
  assert.match(text, /boom/);
  assert.match(text, /partial output/);
});

test("formatSpawnFailure: omits empty fields", () => {
  const text = formatSpawnFailure(baseOutcome({ errorMessage: "oops" }));
  assert.match(text, /oops/);
  assert.doesNotMatch(text, /Exit code/);
  assert.doesNotMatch(text, /stderr:/);
  assert.doesNotMatch(text, /stdout:/);
});

test("formatSpawnFailure: falls back to generic message when errorMessage missing", () => {
  const text = formatSpawnFailure(baseOutcome({}));
  assert.match(text, /subagent failed/);
});

// ─── buildArgs ───────────────────────────────────────────────────────────────

test("buildArgs: --no-session when inheritSession=none", () => {
  const args = buildArgs({
    prompt: "hi",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
  });
  assert.ok(args.includes("--no-session"));
  assert.ok(!args.includes("--fork"));
});

test("buildArgs: --fork <file> when inheritSession=fork", () => {
  const args = buildArgs({
    prompt: "hi",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "fork",
    parentSessionFile: "/tmp/session.json",
  });
  const forkIdx = args.indexOf("--fork");
  assert.ok(forkIdx >= 0);
  assert.equal(args[forkIdx + 1], "/tmp/session.json");
  assert.ok(!args.includes("--no-session"));
});

test("buildArgs: inheritSession=fork without parentSessionFile throws", () => {
  assert.throws(
    () =>
      buildArgs({
        prompt: "hi",
        tools: [],
        extensions: [],
        files: [],
        inheritSession: "fork",
      }),
    /parent session file/,
  );
});

test("buildArgs: empty tools → --no-tools", () => {
  const args = buildArgs({
    prompt: "hi",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
  });
  assert.ok(args.includes("--no-tools"));
  assert.ok(!args.includes("--tools"));
});

test("buildArgs: tools joined and deduplicated", () => {
  const args = buildArgs({
    prompt: "hi",
    tools: ["read", "bash", "read"],
    extensions: [],
    files: [],
    inheritSession: "none",
  });
  const toolsIdx = args.indexOf("--tools");
  assert.ok(toolsIdx >= 0);
  assert.equal(args[toolsIdx + 1], "read,bash");
});

test("buildArgs: each extension emits a -e flag", () => {
  const args = buildArgs({
    prompt: "hi",
    tools: [],
    extensions: ["/a/one", "/b/two"],
    files: [],
    inheritSession: "none",
  });
  assert.ok(args.includes("--no-extensions"));
  const eFlags = args
    .map((a, i) => (a === "-e" ? args[i + 1] : null))
    .filter((x): x is string => x !== null);
  assert.deepEqual(eFlags, ["/a/one", "/b/two"]);
});

test("buildArgs: files emitted as @path before prompt", () => {
  const args = buildArgs({
    prompt: "do-thing",
    tools: [],
    extensions: [],
    files: ["foo.md", "bar.md"],
    inheritSession: "none",
  });
  const fooIdx = args.indexOf("@foo.md");
  const barIdx = args.indexOf("@bar.md");
  const promptIdx = args.indexOf("do-thing");
  assert.ok(fooIdx >= 0 && barIdx >= 0);
  assert.ok(fooIdx < promptIdx && barIdx < promptIdx);
});

test("buildArgs: prompt is the final argument", () => {
  const args = buildArgs({
    prompt: "the-prompt",
    tools: ["read"],
    extensions: ["/ext"],
    files: ["file.md"],
    inheritSession: "none",
  });
  assert.equal(args[args.length - 1], "the-prompt");
});

test("buildArgs: model and thinking flags only present when provided", () => {
  const withFlags = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
    model: "openai/gpt-5",
    thinking: "high",
  });
  const modelIdx = withFlags.indexOf("--model");
  const thinkIdx = withFlags.indexOf("--thinking");
  assert.equal(withFlags[modelIdx + 1], "openai/gpt-5");
  assert.equal(withFlags[thinkIdx + 1], "high");

  const noFlags = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
  });
  assert.ok(!noFlags.includes("--model"));
  assert.ok(!noFlags.includes("--thinking"));
});

test("buildArgs: --no-skills and --no-prompt-templates gated on booleans", () => {
  const on = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
    disableSkills: true,
    disablePromptTemplates: true,
  });
  assert.ok(on.includes("--no-skills"));
  assert.ok(on.includes("--no-prompt-templates"));

  const off = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
  });
  assert.ok(!off.includes("--no-skills"));
  assert.ok(!off.includes("--no-prompt-templates"));
});

test("buildArgs: systemPrompt only appended when trimmed non-empty", () => {
  const blank = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
    systemPrompt: "   \n  ",
  });
  assert.ok(!blank.includes("--append-system-prompt"));

  const real = buildArgs({
    prompt: "p",
    tools: [],
    extensions: [],
    files: [],
    inheritSession: "none",
    systemPrompt: "  you are helpful  ",
  });
  const idx = real.indexOf("--append-system-prompt");
  assert.ok(idx >= 0);
  assert.equal(real[idx + 1], "you are helpful");
});

// ─── spawnSubagent (pre-spawn guards) ─────────────────────────────────────────

test("spawnSubagent: depth-cap short-circuits without spawning", async () => {
  const prev = process.env.PI_SUBAGENT_DEPTH;
  process.env.PI_SUBAGENT_DEPTH = "5";
  try {
    const result = await spawnSubagent({
      prompt: "p",
      toolAllowlist: [],
      extensionAllowlist: [],
      cwd: "/tmp",
    });
    assert.equal(result.ok, false);
    assert.match(result.errorMessage ?? "", /depth limit/);
  } finally {
    if (prev === undefined) delete process.env.PI_SUBAGENT_DEPTH;
    else process.env.PI_SUBAGENT_DEPTH = prev;
  }
});

test("spawnSubagent: unresolved extensionAllowlist returns error without spawning", async () => {
  const prev = process.env.PI_SUBAGENT_DEPTH;
  process.env.PI_SUBAGENT_DEPTH = "0";
  const prevDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = "/nonexistent-agent-dir";
  try {
    const result = await spawnSubagent({
      prompt: "p",
      toolAllowlist: [],
      extensionAllowlist: ["definitely-not-here"],
      cwd: "/nonexistent-cwd",
    });
    assert.equal(result.ok, false);
    assert.match(
      result.errorMessage ?? "",
      /no matching extensions found for: definitely-not-here/,
    );
  } finally {
    if (prev === undefined) delete process.env.PI_SUBAGENT_DEPTH;
    else process.env.PI_SUBAGENT_DEPTH = prev;
    if (prevDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevDir;
  }
});

test("spawnSubagent: aborted signal before spawn returns error without running", async () => {
  const prev = process.env.PI_SUBAGENT_DEPTH;
  process.env.PI_SUBAGENT_DEPTH = "0";
  try {
    const controller = new AbortController();
    controller.abort();
    const result = await spawnSubagent({
      prompt: "p",
      toolAllowlist: [],
      extensionAllowlist: [],
      cwd: "/tmp",
      signal: controller.signal,
    });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
  } finally {
    if (prev === undefined) delete process.env.PI_SUBAGENT_DEPTH;
    else process.env.PI_SUBAGENT_DEPTH = prev;
  }
});
