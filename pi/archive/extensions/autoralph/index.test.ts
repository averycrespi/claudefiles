/**
 * Smoke test for the autoralph registerWorkflow orchestrator.
 *
 * Drives the iteration loop to completion using:
 *   - a fake `spawn` that returns canned iteration JSON
 *   - a real temp git repo (needed for preflight + HEAD tracking)
 *   - `logBaseDir` injection so run logs go to a temp dir
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnInvocation } from "../subagents/spawn.ts";

const ITERATION_COMPLETE = JSON.stringify({
  outcome: "complete",
  summary: "done",
  handoff: "all checklist items complete",
});

const ITERATION_IN_PROGRESS = JSON.stringify({
  outcome: "in_progress",
  summary: "still working",
  handoff: "partial progress",
});

function makeOkOutcome(stdout: string) {
  return {
    ok: true as const,
    aborted: false,
    stdout,
    stderr: "",
    exitCode: 0 as const,
    signal: null,
  };
}

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "autoralph-smoke-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "init\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: dir });
  return dir;
}

function makeDesignFile(): string {
  // Keep the design file outside the repo so the working tree stays clean.
  const designDir = mkdtempSync(join(tmpdir(), "autoralph-design-"));
  const designPath = join(designDir, "my-design.md");
  writeFileSync(designPath, "# My Design\n\nSome content.\n");
  return designPath;
}

function fakePi() {
  const commands = new Map<
    string,
    { description?: string; handler: (args: string, ctx: any) => Promise<void> }
  >();
  const messages: any[] = [];
  const notifications: { msg: string; level: string }[] = [];
  return {
    commands,
    messages,
    notifications,
    registerCommand(name: string, spec: any) {
      commands.set(name, spec);
    },
    sendMessage(m: any) {
      messages.push(m);
    },
    waitForIdle() {},
    notify(msg: string, level: string) {
      notifications.push({ msg, level });
    },
    hasUI: false,
    ui: {
      theme: undefined as any,
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
    },
  };
}

test("autoralph smoke: registers /autoralph-start and /autoralph-cancel", async () => {
  const pi = fakePi();
  const { default: autoralph } = await import("./index.ts");
  autoralph(pi as any);
  assert.ok(pi.commands.has("autoralph-start"), "autoralph-start registered");
  assert.ok(pi.commands.has("autoralph-cancel"), "autoralph-cancel registered");
  assert.ok(
    !pi.commands.has("autoralph"),
    "/autoralph (no suffix) not registered",
  );
});

test("autoralph smoke: full run produces populated log dir and correct report", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autoralph-logroot-"));

  try {
    const pi = fakePi();

    // fake spawn: first call returns in_progress, second returns complete
    let spawnCount = 0;
    const fakeSpawn = async (_inv: SpawnInvocation) => {
      spawnCount++;
      if (spawnCount === 1) {
        return makeOkOutcome(ITERATION_IN_PROGRESS);
      }
      return makeOkOutcome(ITERATION_COMPLETE);
    };

    const { default: autoralph } = await import("./index.ts");
    autoralph(pi as any, {
      spawn: fakeSpawn as any,
      logBaseDir: logRoot,
      cwd: repoDir,
    });

    const ctx = {
      waitForIdle: async () => {},
      ui: {
        notify(_m: string, _l: string) {},
        theme: undefined as any,
      },
    };

    // Invoke /autoralph-start with the design file path
    const startCmd = pi.commands.get("autoralph-start")!;
    await startCmd.handler(designPath, ctx as any);

    // Wait for the detached pipeline to finish
    await new Promise((r) => setTimeout(r, 500));

    // 1. A report message was sent
    assert.equal(
      pi.messages.length,
      1,
      `expected exactly one report message; notifications: ${JSON.stringify(pi.notifications)}`,
    );
    const msg = pi.messages[0];
    assert.equal(msg.customType, "autoralph-report");
    const reportText: string = msg.content[0].text;

    // 2. Report contains expected sections
    assert.ok(
      reportText.includes("━━━ Autoralph Report ━━━"),
      `report header present in: ${reportText.slice(0, 200)}`,
    );
    assert.ok(
      reportText.includes("Iterations ("),
      `Iterations section present in: ${reportText.slice(0, 400)}`,
    );
    assert.ok(
      reportText.includes("✔") ||
        reportText.includes("⏱") ||
        reportText.includes("✗"),
      `at least one iteration row glyph present`,
    );
    assert.ok(
      reportText.includes("Outcome:"),
      `Outcome line present in: ${reportText.slice(0, 400)}`,
    );
    assert.ok(
      reportText.includes("Log:"),
      `Log line appended by framework: ${reportText.slice(-200)}`,
    );

    // 3. Log directory was populated
    const autoralphLogDir = join(logRoot, "autoralph");
    assert.ok(existsSync(autoralphLogDir), "autoralph log dir created");
    const runs = readdirSync(autoralphLogDir);
    assert.equal(runs.length, 1, "exactly one run dir");
    const runDir = join(autoralphLogDir, runs[0]);

    assert.ok(existsSync(join(runDir, "run.json")), "run.json exists");
    assert.ok(existsSync(join(runDir, "events.jsonl")), "events.jsonl exists");
    assert.ok(existsSync(join(runDir, "prompts")), "prompts/ dir exists");
    assert.ok(existsSync(join(runDir, "outputs")), "outputs/ dir exists");
    assert.ok(
      existsSync(join(runDir, "final-report.txt")),
      "final-report.txt exists",
    );

    // 4. run.json records success outcome
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    assert.equal(runJson.outcome, "success");

    // 5. final-report.txt starts with the header
    const finalReportFile = readFileSync(
      join(runDir, "final-report.txt"),
      "utf8",
    );
    assert.ok(
      finalReportFile.startsWith("━━━ Autoralph Report ━━━"),
      "final-report.txt starts with header",
    );

    // 6. events.jsonl contains autoralph-specific iteration-start event
    const eventsRaw = readFileSync(join(runDir, "events.jsonl"), "utf8");
    const events = eventsRaw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(
      events.some((e: any) => e.type === "autoralph.iteration-start"),
      `expected autoralph.iteration-start event; got types: ${events.map((e: any) => e.type).join(", ")}`,
    );

    // 7. Exactly two spawns ran (one in_progress, one complete)
    assert.equal(spawnCount, 2, "exactly two spawns ran");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});

test("autoralph smoke: single-iteration complete run", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autoralph-logroot2-"));

  try {
    const pi = fakePi();

    const fakeSpawn = async (_inv: SpawnInvocation) =>
      makeOkOutcome(ITERATION_COMPLETE);

    const { default: autoralph } = await import("./index.ts");
    autoralph(pi as any, {
      spawn: fakeSpawn as any,
      logBaseDir: logRoot,
      cwd: repoDir,
    });

    const ctx = {
      waitForIdle: async () => {},
      ui: {
        notify(_m: string, _l: string) {},
        theme: undefined as any,
      },
    };

    const startCmd = pi.commands.get("autoralph-start")!;
    await startCmd.handler(designPath, ctx as any);
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(pi.messages.length, 1, "exactly one report message");
    const reportText: string = pi.messages[0].content[0].text;
    assert.ok(reportText.includes("Outcome: complete"), "outcome is complete");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});

test("autoralph preflight: design file missing emits error notification and no report", async () => {
  const repoDir = makeTempRepo();
  const logRoot = mkdtempSync(join(tmpdir(), "autoralph-logroot3-"));
  const missingPath = join(logRoot, "does-not-exist.md");

  try {
    const pi = fakePi();

    const fakeSpawn = async (_inv: SpawnInvocation) =>
      makeOkOutcome(ITERATION_COMPLETE);

    const { default: autoralph } = await import("./index.ts");
    autoralph(pi as any, {
      spawn: fakeSpawn as any,
      logBaseDir: logRoot,
      cwd: repoDir,
    });

    // ctx.ui.notify is where run.ts delivers preflight errors — capture them.
    const ctxNotifications: { msg: string; level: string }[] = [];
    const ctx = {
      waitForIdle: async () => {},
      ui: {
        notify(msg: string, level: string) {
          ctxNotifications.push({ msg, level });
        },
        theme: undefined as any,
      },
    };

    const startCmd = pi.commands.get("autoralph-start")!;
    await startCmd.handler(missingPath, ctx as any);
    await new Promise((r) => setTimeout(r, 500));

    // Preflight should have aborted — no report sent
    assert.equal(
      pi.messages.length,
      0,
      `expected no report message when design file is missing; got: ${JSON.stringify(pi.messages)}`,
    );

    // An error notification should have been emitted containing the requireFile error text
    const errorNotifications = ctxNotifications.filter(
      (n) => n.level === "error",
    );
    assert.ok(
      errorNotifications.length > 0,
      `expected at least one error notification; got: ${JSON.stringify(ctxNotifications)}`,
    );
    const combinedText = errorNotifications.map((n) => n.msg).join(" ");
    assert.ok(
      combinedText.includes("cannot read file"),
      `expected "cannot read file" in error notification; got: ${combinedText}`,
    );
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
  }
});

test("autoralph preflight: dirty working tree emits error notification and no report", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autoralph-logroot4-"));

  // Write an uncommitted file to make the working tree dirty
  writeFileSync(join(repoDir, "dirty.txt"), "uncommitted\n");

  try {
    const pi = fakePi();

    const fakeSpawn = async (_inv: SpawnInvocation) =>
      makeOkOutcome(ITERATION_COMPLETE);

    const { default: autoralph } = await import("./index.ts");
    autoralph(pi as any, {
      spawn: fakeSpawn as any,
      logBaseDir: logRoot,
      cwd: repoDir,
    });

    // ctx.ui.notify is where run.ts delivers preflight errors — capture them.
    const ctxNotifications: { msg: string; level: string }[] = [];
    const ctx = {
      waitForIdle: async () => {},
      ui: {
        notify(msg: string, level: string) {
          ctxNotifications.push({ msg, level });
        },
        theme: undefined as any,
      },
    };

    const startCmd = pi.commands.get("autoralph-start")!;
    await startCmd.handler(designPath, ctx as any);
    await new Promise((r) => setTimeout(r, 500));

    // Preflight should have aborted — no report sent
    assert.equal(
      pi.messages.length,
      0,
      `expected no report message when working tree is dirty; got: ${JSON.stringify(pi.messages)}`,
    );

    // An error notification should mention the clean tree requirement
    const errorNotifications = ctxNotifications.filter(
      (n) => n.level === "error",
    );
    assert.ok(
      errorNotifications.length > 0,
      `expected at least one error notification; got: ${JSON.stringify(ctxNotifications)}`,
    );
    const combinedText = errorNotifications.map((n) => n.msg).join(" ");
    assert.ok(
      combinedText.includes("working tree is not clean"),
      `expected "working tree is not clean" in error notification; got: ${combinedText}`,
    );
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});

test("autoralph run: subagent outcome=failed surfaces in report with reason and single iteration", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autoralph-logroot5-"));

  try {
    const pi = fakePi();

    const ITERATION_FAILED = JSON.stringify({
      outcome: "failed",
      summary: "blocked on missing API key",
      handoff: "tried X, failed",
    });

    let spawnCount = 0;
    const fakeSpawn = async (_inv: SpawnInvocation) => {
      spawnCount++;
      return makeOkOutcome(ITERATION_FAILED);
    };

    const { default: autoralph } = await import("./index.ts");
    autoralph(pi as any, {
      spawn: fakeSpawn as any,
      logBaseDir: logRoot,
      cwd: repoDir,
    });

    const ctx = {
      waitForIdle: async () => {},
      ui: {
        notify(_m: string, _l: string) {},
        theme: undefined as any,
      },
    };

    const startCmd = pi.commands.get("autoralph-start")!;
    await startCmd.handler(designPath, ctx as any);
    await new Promise((r) => setTimeout(r, 500));

    // Exactly one report message
    assert.equal(
      pi.messages.length,
      1,
      `expected exactly one report message; notifications: ${JSON.stringify(pi.notifications)}`,
    );

    const reportText: string = pi.messages[0].content[0].text;

    // Report contains failed outcome line
    assert.ok(
      reportText.includes("Outcome: failed"),
      `report should contain "Outcome: failed"; got: ${reportText.slice(0, 400)}`,
    );

    // Report contains the failure reason from the subagent summary
    assert.ok(
      reportText.includes("blocked on missing API key"),
      `report should contain failure reason; got: ${reportText.slice(0, 400)}`,
    );

    // Workflow completed normally — run.json.outcome should be "success"
    const autoralphLogDir = join(logRoot, "autoralph");
    const runs = readdirSync(autoralphLogDir);
    assert.equal(runs.length, 1, "exactly one run dir");
    const runDir = join(autoralphLogDir, runs[0]);
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    assert.equal(
      runJson.outcome,
      "success",
      "run.json.outcome should be success (workflow ran to completion)",
    );

    // Exactly one spawn ran (failed on first iteration → loop exits)
    assert.equal(spawnCount, 1, "exactly one spawn ran");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});

// TODO: cancellation mid-run test — the cancel handler reaches into the active
// AbortController via module-level state in _workflow-core. Calling
// `autoralph-cancel` synchronously from inside a fake spawn is feasible in
// principle (the command is registered before start is called), but the
// handler's async teardown races with the fake spawn's return value in a way
// that is difficult to make deterministic without exposing internal state.
// Implement once workflow-core exposes a way to wait for cancellation to
// propagate (e.g. a promise or event on the run object).
