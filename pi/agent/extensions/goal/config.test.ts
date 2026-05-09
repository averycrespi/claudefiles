import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoalConfig } from "./config.ts";

test("parseGoalConfig applies defaults and environment overrides", () => {
  const warnings: string[] = [];
  const config = parseGoalConfig({
    settings: { showWidget: false, objectiveMaxChars: 50 },
    env: { GOAL_SHOW_WIDGET: "true", GOAL_EVIDENCE_MAX_CHARS: "25" },
    warnings,
  });

  assert.equal(config.showWidget, true);
  assert.equal(config.objectiveMaxChars, 50);
  assert.equal(config.evidenceMaxChars, 25);
  assert.equal(config.injectActiveGoal, true);
  assert.equal(config.checkpointCommits, true);
  assert.equal(config.showUsage, true);
  assert.deepEqual(warnings, []);
});

test("parseGoalConfig rejects invalid numeric config with warning", () => {
  const warnings: string[] = [];
  const config = parseGoalConfig({
    settings: { objectiveMaxChars: -1 },
    env: { GOAL_COMPACT_SUMMARY_ENABLED: "maybe", GOAL_CHECKPOINT_COMMITS: "false", GOAL_SHOW_USAGE: "false" },
    warnings,
  });

  assert.equal(config.objectiveMaxChars, 4000);
  assert.equal(config.compactSummaryEnabled, true);
  assert.equal(config.checkpointCommits, false);
  assert.equal(config.showUsage, false);
  assert.match(warnings.join("\n"), /objectiveMaxChars/);
  assert.match(warnings.join("\n"), /GOAL_COMPACT_SUMMARY_ENABLED/);
});
