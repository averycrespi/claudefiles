import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpecMarkdown } from "./parser.ts";

const SPEC = `# Sample

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

test("parseSpecMarkdown parses requirements, tasks, validations, and docs impact", () => {
  const parsed = parseSpecMarkdown(SPEC);

  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.requirements[0]?.id, "REQ-1");
  assert.equal(parsed.requirements[0]?.acceptanceCriteria[0]?.id, "AC-1");
  assert.equal(parsed.tasks[0]?.id, "T1");
  assert.deepEqual(parsed.tasks[0]?.owns, ["src/a.ts"]);
  assert.equal(parsed.validations[0]?.command, "npm test");
  assert.match(parsed.docsImpact, /README/);
});

test("parseSpecMarkdown reports missing required sections", () => {
  const parsed = parseSpecMarkdown("# Empty\n");
  assert.match(
    parsed.diagnostics.map((d) => d.message).join("\n"),
    /Missing ## requirements/,
  );
  assert.match(
    parsed.diagnostics.map((d) => d.message).join("\n"),
    /Missing ## tasks/,
  );
});
