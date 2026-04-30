import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWorkflowBriefTemplate,
  ensureWorkflowBrief,
  resolvePlanPathArgument,
} from "./artifact.ts";

test("buildWorkflowBriefTemplate includes the required sections and seeds the goal", () => {
  const template = buildWorkflowBriefTemplate({
    context: "Refactor auth middleware",
    mode: "plan",
  });

  assert.match(template, /^# Workflow Brief/m);
  assert.match(template, /^## Goal$/m);
  assert.match(template, /^## Constraints$/m);
  assert.match(template, /^## Acceptance Criteria$/m);
  assert.match(template, /^## Chosen Approach$/m);
  assert.match(template, /^## Assumptions \/ Open Questions$/m);
  assert.match(template, /^## Ordered Tasks$/m);
  assert.match(template, /^## Verification Checklist$/m);
  assert.match(template, /^## Known Issues \/ Follow-ups$/m);
  assert.match(template, /Refactor auth middleware/);
});

test("resolvePlanPathArgument accepts direct paths and markdown links", () => {
  const cwd = "/repo";

  assert.equal(
    resolvePlanPathArgument(".plans/2026-04-30-auth.md", cwd),
    "/repo/.plans/2026-04-30-auth.md",
  );
  assert.equal(
    resolvePlanPathArgument("[workflow](.plans/2026-04-30-auth.md)", cwd),
    "/repo/.plans/2026-04-30-auth.md",
  );
  assert.equal(resolvePlanPathArgument("Refactor auth", cwd), undefined);
});

test("ensureWorkflowBrief creates a dated .plans artifact and preserves existing content", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-shell-artifact-"));

  try {
    const firstPath = await ensureWorkflowBrief({
      cwd,
      context: "Refactor auth middleware",
      mode: "plan",
      now: new Date("2026-04-30T12:00:00Z"),
    });

    assert.equal(firstPath, ".plans/2026-04-30-refactor-auth-middleware.md");
    const absolute = join(cwd, firstPath);
    const firstContent = await readFile(absolute, "utf8");
    assert.match(firstContent, /Refactor auth middleware/);

    await writeFile(absolute, "# Workflow Brief\n\ncustom\n", "utf8");

    const secondPath = await ensureWorkflowBrief({
      cwd,
      context: "Refactor auth middleware",
      mode: "plan",
      now: new Date("2026-04-30T12:00:00Z"),
    });
    const secondContent = await readFile(absolute, "utf8");

    assert.equal(secondPath, firstPath);
    assert.equal(secondContent, "# Workflow Brief\n\ncustom\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
