import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, readEnvSettings } from "./index.ts";

const ENV_NAMES = [
  "WORKFLOW_MODES_AUTO_COMPACT_ON_MODE_SWITCH",
  "WORKFLOW_MODES_AUTO_COMPACT_MIN_TOKENS",
  "WORKFLOW_MODES_AUTO_COMPACT_ON_ADVANCE",
  "WORKFLOW_MODES_AUTO_COMPACT_ADVANCE_MIN_TOKENS",
  "WORKFLOW_MODES_AUTO_ADVANCE_ENABLED",
  "WORKFLOW_MODES_AUTO_ADVANCE_DENY_TIMEOUT_MS",
  "WORKFLOW_MODES_AUTO_ADVANCE_MAX_FIX_LOOPS",
  "WORKFLOW_MODES_TODO_REMINDER_ENABLED",
  "WORKFLOW_MODES_TODO_REMINDER_TURNS_SINCE_TODO",
  "WORKFLOW_MODES_TODO_REMINDER_TURNS_BETWEEN_REMINDERS",
  "WORKFLOW_MODES_PLAN_THINKING_LEVEL",
  "WORKFLOW_MODES_EXECUTE_THINKING_LEVEL",
  "WORKFLOW_MODES_VERIFY_THINKING_LEVEL",
  "PI_CODING_AGENT_DIR",
] as const;

const savedEnv = new Map<string, string | undefined>();
for (const name of ENV_NAMES) savedEnv.set(name, process.env[name]);

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = savedEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("readEnvSettings maps every workflow-modes environment override", () => {
  process.env.WORKFLOW_MODES_AUTO_COMPACT_ON_MODE_SWITCH = "0";
  process.env.WORKFLOW_MODES_AUTO_COMPACT_MIN_TOKENS = "12345";
  process.env.WORKFLOW_MODES_AUTO_COMPACT_ON_ADVANCE = "0";
  process.env.WORKFLOW_MODES_AUTO_COMPACT_ADVANCE_MIN_TOKENS = "30000";
  process.env.WORKFLOW_MODES_AUTO_ADVANCE_ENABLED = "1";
  process.env.WORKFLOW_MODES_AUTO_ADVANCE_DENY_TIMEOUT_MS = "2500";
  process.env.WORKFLOW_MODES_AUTO_ADVANCE_MAX_FIX_LOOPS = "4";
  process.env.WORKFLOW_MODES_TODO_REMINDER_ENABLED = "0";
  process.env.WORKFLOW_MODES_TODO_REMINDER_TURNS_SINCE_TODO = "5";
  process.env.WORKFLOW_MODES_TODO_REMINDER_TURNS_BETWEEN_REMINDERS = "6";
  process.env.WORKFLOW_MODES_PLAN_THINKING_LEVEL = "high";
  process.env.WORKFLOW_MODES_EXECUTE_THINKING_LEVEL = "medium";
  process.env.WORKFLOW_MODES_VERIFY_THINKING_LEVEL = "xhigh";

  const settings = readEnvSettings();
  assert.equal("autoAdvanceDenyTimeoutMs" in settings, false);
  assert.deepEqual(settings, {
    autoCompactOnModeSwitch: false,
    autoCompactMinTokens: 12345,
    autoCompactOnAdvance: false,
    autoCompactAdvanceMinTokens: 30000,
    autoAdvanceEnabled: true,
    autoAdvanceMaxFixLoops: 4,
    todoReminderEnabled: false,
    todoReminderTurnsSinceTodo: 5,
    todoReminderTurnsBetweenReminders: 6,
    planThinkingLevel: "high",
    executeThinkingLevel: "medium",
    verifyThinkingLevel: "xhigh",
  });
});

test("loadConfig lets env settings override project and global settings", async () => {
  for (const name of ENV_NAMES) delete process.env[name];

  const root = join(
    tmpdir(),
    `workflow-modes-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        "extension:workflow-modes": {
          autoCompactOnModeSwitch: true,
          autoCompactMinTokens: 50000,
          autoCompactOnAdvance: false,
          autoCompactAdvanceMinTokens: 40000,
          autoAdvanceEnabled: false,
          autoAdvanceMaxFixLoops: 2,
          todoReminderEnabled: true,
          todoReminderTurnsSinceTodo: 3,
          todoReminderTurnsBetweenReminders: 3,
          planThinkingLevel: "medium",
          executeThinkingLevel: "low",
          verifyThinkingLevel: "high",
        },
      }),
    );
    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({
        "extension:workflow-modes": {
          autoCompactMinTokens: 75000,
          autoCompactAdvanceMinTokens: 35000,
          planThinkingLevel: "low",
        },
      }),
    );

    process.env.WORKFLOW_MODES_AUTO_COMPACT_MIN_TOKENS = "90000";
    process.env.WORKFLOW_MODES_AUTO_COMPACT_ON_ADVANCE = "1";
    process.env.WORKFLOW_MODES_AUTO_COMPACT_ADVANCE_MIN_TOKENS = "30000";
    process.env.WORKFLOW_MODES_PLAN_THINKING_LEVEL = "xhigh";

    const config = await loadConfig(cwd);
    assert.equal(config.autoCompactMinTokens, 90000);
    assert.equal(config.autoCompactOnAdvance, true);
    assert.equal(config.autoCompactAdvanceMinTokens, 30000);
    assert.equal(config.planThinkingLevel, "xhigh");
    assert.equal(config.executeThinkingLevel, "low");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
