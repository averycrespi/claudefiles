/**
 * Smoke test for the autopilot registerWorkflow orchestrator.
 *
 * Drives plan → implement → verify to completion using:
 *   - a fake `spawn` that returns canned JSON for each phase
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
import { taskList } from "../task-list/api.ts";

// Canned responses keyed by intent prefix
const PLAN_RESPONSE = JSON.stringify({
  architecture_notes: "Keep it simple.",
  tasks: [{ title: "Add foo", description: "Add the foo feature." }],
});

const IMPL_RESPONSE = JSON.stringify({
  outcome: "success",
  commit: null,
  summary: "foo added",
});

const VALIDATION_RESPONSE = JSON.stringify({
  test: { status: "pass", command: "bun test", output: "" },
  lint: { status: "pass", command: "bun run lint", output: "" },
  typecheck: { status: "pass", command: "bun run typecheck", output: "" },
});

const REVIEWER_RESPONSE = JSON.stringify({ findings: [] });

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
  const dir = mkdtempSync(join(tmpdir(), "autopilot-smoke-"));
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
  const designDir = mkdtempSync(join(tmpdir(), "autopilot-design-"));
  const designPath = join(designDir, "my-design.md");
  writeFileSync(
    designPath,
    "# My Design\n\nSome content.\n\n## Acceptance Criteria\n\n- AC-1: foo works\n",
  );
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

test("autopilot smoke: registers /autopilot-start and /autopilot-cancel", async () => {
  const pi = fakePi();
  const tmpLog = mkdtempSync(join(tmpdir(), "autopilot-log-"));
  try {
    const { default: autopilot } = await import("./index.ts");
    autopilot(pi as any);
    assert.ok(pi.commands.has("autopilot-start"), "autopilot-start registered");
    assert.ok(
      pi.commands.has("autopilot-cancel"),
      "autopilot-cancel registered",
    );
  } finally {
    rmSync(tmpLog, { recursive: true, force: true });
  }
});

test("autopilot smoke: full plan → implement → verify produces populated log dir and correct report", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autopilot-logroot-"));
  taskList.clear();

  try {
    const pi = fakePi();

    // fake spawn: route by intent prefix
    let spawnCount = 0;
    const fakeSpawn = async (inv: SpawnInvocation) => {
      spawnCount++;
      const prompt = inv.prompt ?? "";

      // Plan phase — prompt contains the design path
      if (prompt.includes("design.md") || prompt.includes("my-design.md")) {
        return makeOkOutcome(PLAN_RESPONSE);
      }

      // Implement phase — make a real commit so HEAD moves
      if (prompt.includes("Add foo") || prompt.includes("foo feature")) {
        const fname = `feat-${spawnCount}.txt`;
        writeFileSync(join(repoDir, fname), `feat ${spawnCount}\n`);
        execFileSync("git", ["add", fname], { cwd: repoDir });
        execFileSync("git", ["commit", "-q", "-m", `feat ${spawnCount}`], {
          cwd: repoDir,
        });
        return makeOkOutcome(IMPL_RESPONSE);
      }

      // Validation phase
      if (
        prompt.includes("test") ||
        prompt.includes("lint") ||
        prompt.includes("typecheck") ||
        prompt.includes("Validate")
      ) {
        return makeOkOutcome(VALIDATION_RESPONSE);
      }

      // Reviewer phases (plan-completeness, integration, security prompts)
      return makeOkOutcome(REVIEWER_RESPONSE);
    };

    const { default: autopilot } = await import("./index.ts");
    autopilot(pi as any, {
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

    // Invoke /autopilot-start
    const startCmd = pi.commands.get("autopilot-start")!;
    await startCmd.handler(designPath, ctx as any);

    // Wait for the detached pipeline to finish (give it generous time)
    await new Promise((r) => setTimeout(r, 500));

    // 1. A report message was sent
    assert.equal(
      pi.messages.length,
      1,
      `expected exactly one report message; notifications: ${JSON.stringify(pi.notifications)}`,
    );
    const msg = pi.messages[0];
    assert.equal(msg.customType, "autopilot-report");
    const reportText: string = msg.content[0].text;

    // 2. Report contains expected sections
    assert.ok(
      reportText.includes("━━━ Autopilot Report ━━━"),
      "report header present",
    );
    assert.ok(
      reportText.includes("Tasks (1/1):"),
      `Tasks section present in: ${reportText.slice(0, 400)}`,
    );
    assert.ok(reportText.includes("✔ 1. Add foo"), "task line present");
    assert.ok(reportText.includes("Verify:"), "Verify section present");
    assert.ok(
      reportText.includes("Automated checks:"),
      "automated checks line present",
    );
    assert.ok(
      reportText.includes("Log:"),
      `Log line appended by framework: ${reportText.slice(-200)}`,
    );

    // 3. Log directory was populated
    const autopilotLogDir = join(logRoot, "autopilot");
    assert.ok(existsSync(autopilotLogDir), "autopilot log dir created");
    const runs = readdirSync(autopilotLogDir);
    assert.equal(runs.length, 1, "exactly one run dir");
    const runDir = join(autopilotLogDir, runs[0]);

    assert.ok(existsSync(join(runDir, "run.json")), "run.json exists");
    assert.ok(existsSync(join(runDir, "events.jsonl")), "events.jsonl exists");
    assert.ok(existsSync(join(runDir, "prompts")), "prompts/ dir exists");
    assert.ok(existsSync(join(runDir, "outputs")), "outputs/ dir exists");
    assert.ok(
      existsSync(join(runDir, "final-report.txt")),
      "final-report.txt exists",
    );
    assert.ok(
      existsSync(join(runDir, "workflow", "design.md")),
      "workflow/design.md (design copy) exists",
    );

    // 4. run.json records success outcome
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    assert.equal(runJson.outcome, "success");

    // 5. final-report.txt matches report sent via sendMessage
    const finalReportFile = readFileSync(
      join(runDir, "final-report.txt"),
      "utf8",
    );
    assert.ok(
      finalReportFile.startsWith("━━━ Autopilot Report ━━━"),
      "final-report.txt starts with header",
    );

    // 6. events.jsonl contains autopilot-specific plan-tasks event
    const eventsRaw = readFileSync(join(runDir, "events.jsonl"), "utf8");
    const events = eventsRaw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(
      events.some((e: any) => e.type === "autopilot.plan-tasks"),
      `expected autopilot.plan-tasks event; got types: ${events.map((e: any) => e.type).join(", ")}`,
    );
  } finally {
    taskList.clear();
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});

test("autopilot smoke: surfaces error when task list has live tasks", async () => {
  const repoDir = makeTempRepo();
  const designPath = makeDesignFile();
  const logRoot = mkdtempSync(join(tmpdir(), "autopilot-logroot-"));

  // Seed the task list with a live (pending) task — simulates a prior interrupted run.
  taskList.clear();
  taskList.create([{ title: "unfinished task" }]);

  try {
    const pi = fakePi();
    const fakeSpawn = async (_inv: SpawnInvocation) =>
      makeOkOutcome(PLAN_RESPONSE);

    const { default: autopilot } = await import("./index.ts");
    autopilot(pi as any, {
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

    const startCmd = pi.commands.get("autopilot-start")!;
    await startCmd.handler(designPath, ctx as any);

    // Give detached pipeline time to settle.
    await new Promise((r) => setTimeout(r, 500));

    // The pre-flight guardrail (create() throwing) should surface as a
    // notification error — not a successful report.
    const errorNotifications = pi.notifications.filter(
      (n) => n.level === "error",
    );
    assert.ok(
      errorNotifications.length > 0 ||
        pi.messages.some((m) => {
          const text: string = m?.content?.[0]?.text ?? "";
          return text.includes("live task") || text.includes("task-list-clear");
        }),
      `expected an error notification or report mentioning live tasks; notifications: ${JSON.stringify(pi.notifications)}, messages: ${JSON.stringify(pi.messages.map((m: any) => m?.content?.[0]?.text?.slice(0, 200)))}`,
    );
  } finally {
    taskList.clear();
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(logRoot, { recursive: true, force: true });
    const designDir = designPath.replace(/\/my-design\.md$/, "");
    if (existsSync(designDir))
      rmSync(designDir, { recursive: true, force: true });
  }
});
