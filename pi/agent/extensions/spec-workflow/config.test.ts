import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpecWorkflowConfig } from "./config.ts";

test("parseSpecWorkflowConfig applies defaults and env overrides", () => {
  const warnings: string[] = [];
  const config = parseSpecWorkflowConfig({
    settings: { showWidget: false, maxFixRounds: 1 },
    env: {
      SPEC_WORKFLOW_SHOW_WIDGET: "true",
      SPEC_WORKFLOW_AUTO_COMMIT_TASKS: "0",
      SPEC_WORKFLOW_VERIFY_THINKING_LEVEL: "xhigh",
    },
    warnings,
  });

  assert.equal(config.enabled, true);
  assert.equal(config.showWidget, true);
  assert.equal(config.maxFixRounds, 1);
  assert.equal(config.autoCommitTasks, false);
  assert.equal(config.verifyThinkingLevel, "xhigh");
  assert.deepEqual(warnings, []);
});

test("parseSpecWorkflowConfig rejects invalid config with warnings", () => {
  const warnings: string[] = [];
  const config = parseSpecWorkflowConfig({
    settings: { maxFixRounds: -1, planThinkingLevel: "giant" },
    env: { SPEC_WORKFLOW_AUTO_CHALLENGE: "maybe" },
    warnings,
  });

  assert.equal(config.maxFixRounds, 2);
  assert.equal(config.planThinkingLevel, "medium");
  assert.equal(config.autoChallenge, true);
  assert.match(warnings.join("\n"), /maxFixRounds/);
  assert.match(warnings.join("\n"), /planThinkingLevel/);
  assert.match(warnings.join("\n"), /SPEC_WORKFLOW_AUTO_CHALLENGE/);
});
