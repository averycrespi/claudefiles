import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSpecRuntime } from "./compiler.ts";
import { createEvent, readSpecEvents } from "./events.ts";
import {
  activeSpecSummary,
  parsePersistedSpecState,
  readRuntime,
  restoreActiveSpecFromBranch,
  updateRuntimeWithEvent,
  writeRuntime,
} from "./state.ts";

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

function runtime() {
  const result = compileSpecRuntime({
    slug: "sample",
    markdown: VALID_SPEC,
    now: "now",
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("compile failed");
  return result.runtime;
}

test("writeRuntime and readRuntime persist validated runtime", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-state-"));
  try {
    const written = await writeRuntime(dir, runtime());
    assert.equal(written.ok, true);
    const read = await readRuntime(dir, "sample");
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.runtime.slug, "sample");
    assert.equal(read.path, ".specs/sample/runtime.json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("updateRuntimeWithEvent atomically writes runtime and appends event", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-state-"));
  try {
    await writeRuntime(dir, runtime());
    const result = await updateRuntimeWithEvent(
      dir,
      "sample",
      (current) => ({ ...current, phase: "execute", status: "running" }),
      createEvent(
        "phase_started",
        { phase: "execute" },
        new Date("2026-05-09T00:00:00.000Z"),
      ),
    );

    assert.equal(result.ok, true);
    const read = await readRuntime(dir, "sample");
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.runtime.phase, "execute");
    const events = await readSpecEvents(
      join(dir, ".specs/sample/events.jsonl"),
    );
    assert.equal(events.events[0]?.type, "phase_started");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("updateRuntimeWithEvent rejects invalid updates without appending event", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-state-"));
  try {
    await writeRuntime(dir, runtime());
    const result = await updateRuntimeWithEvent(
      dir,
      "sample",
      (current) => ({ ...current, schemaVersion: 2 }) as any,
      createEvent("phase_started"),
    );

    assert.equal(result.ok, false);
    const eventsPath = join(dir, ".specs/sample/events.jsonl");
    const events = await readSpecEvents(eventsPath);
    assert.equal(events.events.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("active state helpers parse and restore compact custom entries", () => {
  assert.deepEqual(parsePersistedSpecState({ slug: "sample", phase: "plan" }), {
    slug: "sample",
    phase: "plan",
  });
  const restored = restoreActiveSpecFromBranch([
    {
      type: "custom",
      customType: "spec-workflow-state",
      data: { slug: "old", phase: "plan" },
    },
    {
      type: "custom",
      customType: "spec-workflow-state",
      data: { slug: "new", phase: "execute" },
    },
  ]);
  assert.deepEqual(restored, { slug: "new", phase: "execute" });
  assert.deepEqual(activeSpecSummary("/repo", "sample", "plan"), {
    slug: "sample",
    phase: "plan",
    runtimePath: ".specs/sample/runtime.json",
  });
});
