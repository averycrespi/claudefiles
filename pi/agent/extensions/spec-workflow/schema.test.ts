import { test } from "node:test";
import assert from "node:assert/strict";
import { compileSpecRuntime } from "./compiler.ts";
import { validateSpecRuntime } from "./schema.ts";

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

test("validateSpecRuntime accepts compiled runtime", () => {
  const result = compileSpecRuntime({ slug: "sample", markdown: VALID_SPEC });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(validateSpecRuntime(result.runtime).ok, true);
});

test("validateSpecRuntime rejects invalid runtime", () => {
  const result = validateSpecRuntime({ schemaVersion: 1 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.length > 0);
});
