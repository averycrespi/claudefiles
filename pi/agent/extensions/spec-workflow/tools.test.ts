import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSpecEvents } from "./events.ts";
import { registerSpecWorkflowTools } from "./tools.ts";

const VALID_SPEC = `# Sample

## Requirements

### REQ-1: Do the thing
- AC-1: It works

## Tasks

### T1: Implement
Depends: none
Owns: src/a.ts
AC: AC-1
Validates: VAL-1

## Validations

- VAL-1: \`npm test\` unit tests

## Documentation Impact

README update required.
`;

function makePi() {
  const tools = new Map<string, any>();
  return {
    tools,
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  } as any;
}

function text(result: any): string {
  return result.content[0].text;
}

test("spec tools write, compile, status, edit, and runtime update", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-tools-"));
  try {
    const pi = makePi();
    registerSpecWorkflowTools(pi);
    const ctx = { cwd: dir } as any;

    const write = await pi.tools
      .get("write_spec_artifact")
      .execute(
        "1",
        { slug: "sample", filename: "tasks.md", content: VALID_SPEC },
        undefined,
        undefined,
        ctx,
      );
    assert.match(text(write), /Wrote \.specs\/sample\/tasks.md/);

    const compile = await pi.tools
      .get("compile_spec_runtime")
      .execute("2", { slug: "sample" }, undefined, undefined, ctx);
    assert.match(text(compile), /Compiled \.specs\/sample\/runtime.json/);

    const status = await pi.tools
      .get("spec_status")
      .execute("3", { slug: "sample" }, undefined, undefined, ctx);
    assert.match(text(status), /Spec sample: plan · 0\/1 tasks complete/);

    const edit = await pi.tools.get("edit_spec_artifact").execute(
      "4",
      {
        slug: "sample",
        filename: "tasks.md",
        edits: [
          { old_text: "README update required.", new_text: "No docs change." },
        ],
      },
      undefined,
      undefined,
      ctx,
    );
    assert.match(text(edit), /Edited \.specs\/sample\/tasks.md/);

    const update = await pi.tools
      .get("spec_runtime_update")
      .execute(
        "5",
        { slug: "sample", action: "task_completed", task_id: "T1" },
        undefined,
        undefined,
        ctx,
      );
    assert.match(text(update), /Updated \.specs\/sample\/runtime.json/);

    const updatedStatus = await pi.tools
      .get("spec_status")
      .execute("6", { slug: "sample" }, undefined, undefined, ctx);
    assert.match(text(updatedStatus), /1\/1 tasks complete/);
    const events = await readSpecEvents(
      join(dir, ".specs/sample/events.jsonl"),
    );
    assert.equal(events.events[0]?.type, "task_completed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compile_spec_runtime returns readable diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-tools-"));
  try {
    const pi = makePi();
    registerSpecWorkflowTools(pi);
    const result = await pi.tools
      .get("compile_spec_runtime")
      .execute(
        "1",
        { slug: "sample", markdown: "# bad" },
        undefined,
        undefined,
        { cwd: dir } as any,
      );

    assert.match(text(result), /^Error:/);
    assert.match(text(result), /Missing ## requirements/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("spec_runtime_update rejects task actions without task_id", async () => {
  const pi = makePi();
  registerSpecWorkflowTools(pi);
  const result = await pi.tools
    .get("spec_runtime_update")
    .execute(
      "1",
      { slug: "sample", action: "task_completed" },
      undefined,
      undefined,
      { cwd: "/tmp" } as any,
    );
  assert.match(text(result), /task_id is required/);
});
