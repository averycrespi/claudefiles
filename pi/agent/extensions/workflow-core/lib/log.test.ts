import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunLogger } from "./log.ts";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wc-log-"));
}

describe("createRunLogger — events.jsonl", () => {
  test("writes one valid JSON line per logEvent call, ending in newline", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: "s",
      args: {},
      preflight: {},
      now: () => new Date("2026-01-01T00:00:00Z").getTime(),
    });
    logger.logEvent({ type: "test.a", payload: { x: 1 } });
    logger.logEvent({ type: "test.b", payload: { y: 2 } });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    assert.ok(lines.length >= 4); // run.start + 2 + run.end
    for (const l of lines) {
      const obj = JSON.parse(l);
      assert.ok(obj.ts);
      assert.ok(obj.type);
    }
    rmSync(root, { recursive: true });
  });

  test("auto-emits run.start at construction and run.end on close", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: { foo: 1 },
      preflight: {},
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(lines[0].type, "run.start");
    assert.deepEqual(lines[0].args, { foo: 1 });
    assert.equal(lines[lines.length - 1].type, "run.end");
    assert.equal(lines[lines.length - 1].outcome, "success");
    rmSync(root, { recursive: true });
  });

  test("writes run.json at close with correct shape", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: "my-slug",
      args: { a: 1 },
      preflight: {},
    });
    await logger.close({
      outcome: "success",
      error: null,
      subagentCount: 3,
      subagentRetries: 1,
    });
    const runJson = JSON.parse(
      readFileSync(join(logger.runDir, "run.json"), "utf8"),
    );
    assert.equal(runJson.workflow, "wf");
    assert.equal(runJson.slug, "my-slug");
    assert.equal(runJson.outcome, "success");
    assert.deepEqual(runJson.args, { a: 1 });
    assert.equal(runJson.subagent_count, 3);
    assert.equal(runJson.subagent_retries, 1);
    assert.equal(runJson.log_path, "events.jsonl");
    assert.equal(runJson.report_path, "final-report.txt");
    assert.equal(runJson.error, null);
    assert.ok(runJson.started_at);
    assert.ok(runJson.ended_at);
    assert.equal(typeof runJson.elapsed_ms, "number");
    rmSync(root, { recursive: true });
  });

  test("writeFinalReport writes final-report.txt", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.writeFinalReport("the report");
    await logger.close({ outcome: "success", error: null });
    const text = readFileSync(join(logger.runDir, "final-report.txt"), "utf8");
    assert.equal(text, "the report");
    rmSync(root, { recursive: true });
  });

  test("retention prunes older runs beyond keep, preserves current", async () => {
    const root = makeRoot();
    // Create 3 prior runs by hand.
    const { mkdirSync, utimesSync } = await import("node:fs");
    const baseWf = join(root, "wf");
    mkdirSync(baseWf, { recursive: true });
    const oldRuns = ["a", "b", "c"];
    for (let i = 0; i < oldRuns.length; i++) {
      const p = join(baseWf, oldRuns[i]);
      mkdirSync(p, { recursive: true });
      const t = (Date.now() - (oldRuns.length - i) * 10000) / 1000;
      utimesSync(p, t, t);
    }
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
      retainRuns: 2, // keep 2 newest entries (current run + newest prior)
    });
    await logger.close({ outcome: "success", error: null });
    const { readdirSync, existsSync } = await import("node:fs");
    const remaining = readdirSync(baseWf);
    // current run is newest (mtime=now); next newest of {a,b,c} is "c".
    // So current + c survive; a and b get pruned.
    assert.ok(remaining.includes(logger.runDir.split("/").pop()!));
    assert.ok(existsSync(join(baseWf, "c")));
    assert.ok(!remaining.includes("a"));
    assert.ok(!remaining.includes("b"));
    rmSync(root, { recursive: true });
  });
});

describe("createRunLogger — workflow events", () => {
  test("logWorkflow auto-prefixes type with workflow name", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "autopilot",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.logWorkflow("task.complete", { id: 3 });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const evt = lines.find((l: any) => l.type === "autopilot.task.complete");
    assert.ok(evt, "expected prefixed event in log");
    assert.equal((evt as any).id, 3);
    rmSync(root, { recursive: true });
  });

  test("logEvent / logWorkflow after close are silently dropped", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    await logger.close({ outcome: "success", error: null });
    logger.logWorkflow("late", {});
    logger.logEvent({ type: "later" });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(!lines.some((l: any) => l.type === "wf.late"));
    assert.ok(!lines.some((l: any) => l.type === "later"));
    rmSync(root, { recursive: true });
  });
});

describe("createRunLogger — subagent lifecycle", () => {
  test("recordSubagentStart writes prompt sidecar and emits start event with prompt_path", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "Plan",
      schema: "PlanReport",
      tools: ["read"],
      extensions: [],
      prompt: "do the plan",
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const start = lines.find((l: any) => l.type === "subagent.start");
    assert.ok(start);
    assert.equal((start as any).id, 1);
    assert.match((start as any).prompt_path, /^prompts\/0*1-plan\.txt$/);
    const promptText = readFileSync(
      join(logger.promptsDir, "001-plan.txt"),
      "utf8",
    );
    assert.equal(promptText, "do the plan");
    rmSync(root, { recursive: true });
  });

  test("recordSubagentEnd writes output sidecar on success and emits end event", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "Plan",
      schema: "PlanReport",
      tools: [],
      extensions: [],
      prompt: "x",
    });
    logger.recordSubagentEnd({
      id: 1,
      ok: true,
      durationMs: 1234,
      output: { hello: "world" },
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const end = lines.find((l: any) => l.type === "subagent.end");
    assert.equal((end as any).ok, true);
    assert.equal((end as any).duration_ms, 1234);
    assert.match((end as any).output_path, /^outputs\/0*1-plan\.json$/);
    const outputJson = readFileSync(
      join(logger.outputsDir, "001-plan.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(outputJson), { hello: "world" });
    rmSync(root, { recursive: true });
  });

  test("recordSubagentEnd on failure emits reason+error and no output sidecar", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "x",
      schema: "X",
      tools: [],
      extensions: [],
      prompt: "p",
    });
    logger.recordSubagentEnd({
      id: 1,
      ok: false,
      durationMs: 500,
      reason: "parse",
      error: "bad json",
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const end = lines.find((l: any) => l.type === "subagent.end");
    assert.equal((end as any).ok, false);
    assert.equal((end as any).reason, "parse");
    assert.equal((end as any).error, "bad json");
    assert.equal((end as any).output_path, undefined);
    rmSync(root, { recursive: true });
  });

  test("recordSubagentStart / recordSubagentEnd after close are silently dropped", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    await logger.close({ outcome: "success", error: null });
    logger.recordSubagentStart({
      id: 9,
      intent: "late",
      schema: "X",
      tools: [],
      extensions: [],
      prompt: "p",
    });
    logger.recordSubagentEnd({ id: 9, ok: true, durationMs: 1, output: {} });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(!lines.some((l: any) => l.type === "subagent.start"));
    assert.ok(!lines.some((l: any) => l.type === "subagent.end"));
    rmSync(root, { recursive: true });
  });
});
