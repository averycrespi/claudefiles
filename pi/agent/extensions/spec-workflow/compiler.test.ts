import { test } from "node:test";
import assert from "node:assert/strict";
import { compileSpecRuntime, formatDiagnostics } from "./compiler.ts";

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

### T2: Polish
Depends: T1
Owns: src/b.ts
AC: AC-1
Validates: VAL-1

## Validations

- VAL-1: \`npm test\` unit tests

## Documentation Impact

README update required.
`;

test("compileSpecRuntime compiles a valid spec", () => {
  const result = compileSpecRuntime({
    slug: "sample",
    markdown: VALID_SPEC,
    now: "now",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.runtime.schemaVersion, 1);
  assert.equal(result.runtime.phase, "plan");
  assert.equal(result.runtime.tasks.length, 2);
  assert.equal(result.runtime.tasks[0]?.commitSkipped, null);
});

test("compileSpecRuntime aggregates validation diagnostics", () => {
  const result = compileSpecRuntime({
    slug: "sample",
    markdown: VALID_SPEC.replace("AC: AC-1", "AC: AC-404").replace(
      "Validates: VAL-1",
      "Validates: VAL-404",
    ),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  const text = formatDiagnostics(result.diagnostics);
  assert.match(text, /unknown AC AC-404/);
  assert.match(text, /unknown validation VAL-404/);
});

test("compileSpecRuntime detects duplicate IDs and cycles", () => {
  const spec = VALID_SPEC.replace(
    "- AC-1: It works",
    "- AC-1: It works\n- AC-1: It also works",
  ).replace("Depends: none", "Depends: T2");
  const result = compileSpecRuntime({ slug: "sample", markdown: spec });

  assert.equal(result.ok, false);
  if (result.ok) return;
  const text = formatDiagnostics(result.diagnostics);
  assert.match(text, /Duplicate acceptance criterion ID: AC-1/);
  assert.match(text, /dependency cycle/i);
});

test("compileSpecRuntime preserves existing task history", () => {
  const first = compileSpecRuntime({ slug: "sample", markdown: VALID_SPEC });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  first.runtime.tasks[0]!.status = "complete";
  first.runtime.tasks[0]!.commits = ["abc123"];

  const second = compileSpecRuntime({
    slug: "sample",
    markdown: VALID_SPEC.replace("Implement", "Implement core"),
    existingRuntime: first.runtime,
  });

  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.runtime.tasks[0]?.title, "Implement core");
  assert.equal(second.runtime.tasks[0]?.status, "complete");
  assert.deepEqual(second.runtime.tasks[0]?.commits, ["abc123"]);
});

test("compileSpecRuntime rejects unknown newer runtime schema", () => {
  const result = compileSpecRuntime({
    slug: "sample",
    markdown: VALID_SPEC,
    existingRuntime: { schemaVersion: 99 },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(
    formatDiagnostics(result.diagnostics),
    /Unsupported runtime schemaVersion: 99/,
  );
});
