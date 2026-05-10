import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, readEnvSettings } from "./index.ts";

const ENV_NAMES = [
  "DEV_WORKFLOW_AUTO_COMPACT_ON_MODE_SWITCH",
  "DEV_WORKFLOW_AUTO_COMPACT_MIN_TOKENS",
  "DEV_WORKFLOW_AUTO_COMPACT_ON_ADVANCE",
  "DEV_WORKFLOW_AUTO_COMPACT_ADVANCE_MIN_TOKENS",
  "DEV_WORKFLOW_AUTO_ADVANCE_ENABLED",
  "DEV_WORKFLOW_AUTO_ADVANCE_DENY_TIMEOUT_MS",
  "DEV_WORKFLOW_AUTO_ADVANCE_MAX_FIX_LOOPS",
  "DEV_WORKFLOW_TODO_REMINDER_ENABLED",
  "DEV_WORKFLOW_TODO_REMINDER_TURNS_SINCE_TODO",
  "DEV_WORKFLOW_TODO_REMINDER_TURNS_BETWEEN_REMINDERS",
  "DEV_WORKFLOW_PLAN_THINKING_LEVEL",
  "DEV_WORKFLOW_EXECUTE_THINKING_LEVEL",
  "DEV_WORKFLOW_VERIFY_THINKING_LEVEL",
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

test("readEnvSettings maps every dev-workflow environment override", () => {
  process.env.DEV_WORKFLOW_AUTO_COMPACT_ON_MODE_SWITCH = "0";
  process.env.DEV_WORKFLOW_AUTO_COMPACT_MIN_TOKENS = "12345";
  process.env.DEV_WORKFLOW_AUTO_COMPACT_ON_ADVANCE = "0";
  process.env.DEV_WORKFLOW_AUTO_COMPACT_ADVANCE_MIN_TOKENS = "30000";
  process.env.DEV_WORKFLOW_AUTO_ADVANCE_ENABLED = "1";
  process.env.DEV_WORKFLOW_AUTO_ADVANCE_DENY_TIMEOUT_MS = "2500";
  process.env.DEV_WORKFLOW_AUTO_ADVANCE_MAX_FIX_LOOPS = "4";
  process.env.DEV_WORKFLOW_TODO_REMINDER_ENABLED = "0";
  process.env.DEV_WORKFLOW_TODO_REMINDER_TURNS_SINCE_TODO = "5";
  process.env.DEV_WORKFLOW_TODO_REMINDER_TURNS_BETWEEN_REMINDERS = "6";
  process.env.DEV_WORKFLOW_PLAN_THINKING_LEVEL = "high";
  process.env.DEV_WORKFLOW_EXECUTE_THINKING_LEVEL = "medium";
  process.env.DEV_WORKFLOW_VERIFY_THINKING_LEVEL = "xhigh";

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
    `dev-workflow-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
        "extension:dev-workflow": {
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
        "extension:dev-workflow": {
          autoCompactMinTokens: 75000,
          autoCompactAdvanceMinTokens: 35000,
          planThinkingLevel: "low",
        },
      }),
    );

    process.env.DEV_WORKFLOW_AUTO_COMPACT_MIN_TOKENS = "90000";
    process.env.DEV_WORKFLOW_AUTO_COMPACT_ON_ADVANCE = "1";
    process.env.DEV_WORKFLOW_AUTO_COMPACT_ADVANCE_MIN_TOKENS = "30000";
    process.env.DEV_WORKFLOW_PLAN_THINKING_LEVEL = "xhigh";

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
