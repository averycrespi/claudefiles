import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildModeContract,
  getManagedToolNamesForMode,
  getThinkingLevelForMode,
} from "./modes.ts";

test("buildModeContract for plan mode includes collaborative discovery and plan-authoring guidance", () => {
  const contract = buildModeContract({
    mode: "plan",
  });

  assert.match(contract, /current mode: plan/i);
  assert.match(contract, /clarify ambiguous requests/i);
  assert.match(contract, /ask one focused question at a time/i);
  assert.match(contract, /confirm the chosen direction/i);
  assert.match(contract, /write_plan/i);
  assert.match(contract, /edit_plan/i);
  assert.match(contract, /\.plans\//i);
});

test("buildModeContract for execute mode encourages using relevant plan files without requiring one", () => {
  const contract = buildModeContract({
    mode: "execute",
  });

  assert.match(contract, /current mode: execute/i);
  assert.match(contract, /read relevant .*\.plans/i);
  assert.match(contract, /commit regularly/i);
  assert.match(contract, /logical checkpoints/i);
});

test("mode helpers return the expected thinking defaults and tool sets", () => {
  assert.equal(getThinkingLevelForMode("normal"), undefined);
  assert.equal(getThinkingLevelForMode("plan"), "high");
  assert.equal(getThinkingLevelForMode("execute"), "low");
  assert.equal(getThinkingLevelForMode("verify"), "high");

  const planTools = getManagedToolNamesForMode("plan");
  assert.ok(planTools.includes("read"));
  assert.ok(planTools.includes("write_plan"));
  assert.ok(planTools.includes("edit_plan"));
  assert.ok(planTools.includes("mcp_call"));
  assert.ok(!planTools.includes("bash"));
  assert.ok(!planTools.includes("edit"));
  assert.ok(!planTools.includes("write"));

  const executeTools = getManagedToolNamesForMode("execute");
  assert.ok(executeTools.includes("bash"));
  assert.ok(executeTools.includes("write"));
  assert.ok(!executeTools.includes("write_plan"));
  assert.ok(!executeTools.includes("ask_user"));

  const verifyTools = getManagedToolNamesForMode("verify");
  assert.ok(verifyTools.includes("bash"));
  assert.ok(verifyTools.includes("ask_user"));
  assert.ok(!verifyTools.includes("write"));
  assert.ok(!verifyTools.includes("edit"));
});
