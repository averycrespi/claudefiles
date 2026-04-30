import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildModeContract,
  getManagedToolNamesForMode,
  getThinkingLevelForMode,
} from "./modes.ts";

test("buildModeContract for plan mode includes collaborative discovery guidance", () => {
  const contract = buildModeContract({
    mode: "plan",
    activePlanPath: ".plans/2026-04-30-auth.md",
  });

  assert.match(contract, /current mode: plan/i);
  assert.match(contract, /active plan artifact: \.plans\/2026-04-30-auth\.md/i);
  assert.match(contract, /clarify ambiguous requests/i);
  assert.match(contract, /ask one focused question at a time/i);
  assert.match(contract, /compare approaches when the trade-offs matter/i);
  assert.match(contract, /confirm the chosen direction/i);
  assert.match(contract, /workflow_brief/i);
});

test("mode helpers return the expected thinking defaults and tool sets", () => {
  assert.equal(getThinkingLevelForMode("normal"), undefined);
  assert.equal(getThinkingLevelForMode("plan"), "high");
  assert.equal(getThinkingLevelForMode("execute"), "low");
  assert.equal(getThinkingLevelForMode("verify"), "high");

  const planTools = getManagedToolNamesForMode("plan");
  assert.ok(planTools.includes("read"));
  assert.ok(planTools.includes("workflow_brief"));
  assert.ok(planTools.includes("mcp_call"));
  assert.ok(!planTools.includes("bash"));
  assert.ok(!planTools.includes("edit"));
  assert.ok(!planTools.includes("write"));

  const executeTools = getManagedToolNamesForMode("execute");
  assert.ok(executeTools.includes("bash"));
  assert.ok(executeTools.includes("write"));
  assert.ok(!executeTools.includes("workflow_brief"));
  assert.ok(!executeTools.includes("ask_user"));

  const verifyTools = getManagedToolNamesForMode("verify");
  assert.ok(verifyTools.includes("bash"));
  assert.ok(verifyTools.includes("ask_user"));
  assert.ok(!verifyTools.includes("write"));
  assert.ok(!verifyTools.includes("edit"));
});
