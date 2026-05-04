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
  assert.match(contract, /Plan mode has four phases/i);
  assert.match(contract, /Discover, Explore, Validate, and Author/i);
  assert.match(contract, /clarify ambiguous requests/i);
  assert.match(contract, /bounded grilling loop/i);
  assert.match(contract, /requirements-discovery questions until/i);
  assert.match(contract, /ask one focused question at a time/i);
  assert.match(contract, /recommended answer/i);
  assert.match(contract, /multiple-choice/i);
  assert.match(contract, /exploring the repo/i);
  assert.match(
    contract,
    /purpose, constraints, success criteria, major trade-offs, and acceptance criteria/i,
  );
  assert.match(contract, /2-3 approaches/i);
  assert.match(contract, /Use ask_user for material decisions/i);
  assert.match(contract, /confirm the chosen direction/i);
  assert.match(
    contract,
    /Do not call write_plan or edit_plan until Discovery, Explore, and Validate are complete/i,
  );
  assert.match(contract, /skip discovery for trivial mechanical tasks/i);
  assert.match(contract, /testable acceptance criteria/i);
  assert.match(contract, /Documentation Impact/i);
  assert.match(contract, /no documentation updates are required/i);
  assert.match(contract, /Documentation Impact was followed/i);
  assert.match(contract, /YAGNI/i);
  assert.match(contract, /write_plan/i);
  assert.match(contract, /edit_plan/i);
  assert.match(contract, /\.plans\//i);
});

test("buildModeContract for execute mode encourages using relevant plan files without requiring one", () => {
  const contract = buildModeContract({
    mode: "execute",
    autoHandoffEnabled: true,
  });

  assert.match(contract, /current mode: execute/i);
  assert.match(contract, /read relevant .*\.plans/i);
  assert.match(contract, /commit regularly/i);
  assert.match(contract, /logical checkpoints/i);
  assert.match(contract, /workflow_handoff/i);
  assert.match(contract, /target_mode="verify"/i);
});

test("buildModeContract for execute mode avoids disabled automatic handoff guidance", () => {
  const contract = buildModeContract({
    mode: "execute",
  });

  assert.doesNotMatch(contract, /call workflow_handoff/i);
  assert.match(contract, /report that outcome to the user/i);
});

test("buildModeContract for verify mode explains handoff outcomes", () => {
  const contract = buildModeContract({
    mode: "verify",
    autoHandoffEnabled: true,
  });

  assert.match(contract, /workflow_handoff/i);
  assert.match(contract, /target_mode="execute"/i);
  assert.match(contract, /passes/i);
  assert.match(contract, /blocked/i);
  assert.match(contract, /unfixable/i);
});

test("buildModeContract for verify mode avoids disabled automatic handoff guidance", () => {
  const contract = buildModeContract({
    mode: "verify",
  });

  assert.doesNotMatch(contract, /target_mode="execute"/i);
  assert.match(contract, /report the needed fixes to the user/i);
});

test("mode helpers return the expected thinking defaults and tool sets", () => {
  assert.equal(getThinkingLevelForMode("normal"), undefined);
  assert.equal(getThinkingLevelForMode("plan"), "medium");
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
  assert.ok(executeTools.includes("workflow_handoff"));
  assert.ok(!executeTools.includes("write_plan"));
  assert.ok(!executeTools.includes("ask_user"));

  const verifyTools = getManagedToolNamesForMode("verify");
  assert.ok(verifyTools.includes("bash"));
  assert.ok(verifyTools.includes("ask_user"));
  assert.ok(verifyTools.includes("workflow_handoff"));
  assert.ok(!verifyTools.includes("write"));
  assert.ok(!verifyTools.includes("edit"));
});
