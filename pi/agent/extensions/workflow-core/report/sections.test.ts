import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  formatSection,
  formatGitInfoBlock,
  formatKnownIssues,
} from "./sections.ts";

describe("formatSection", () => {
  test("titled section with indented body lines", () => {
    assert.deepEqual(
      formatSection("Tasks (5/5)", ["✔ 1. add config", "✔ 2. wire it"]),
      ["Tasks (5/5):", "  ✔ 1. add config", "  ✔ 2. wire it"],
    );
  });

  test("empty body section emits just the title line", () => {
    assert.deepEqual(formatSection("Verify", []), ["Verify:"]);
  });
});

describe("formatGitInfoBlock", () => {
  test("renders branch and commit count", () => {
    assert.deepEqual(
      formatGitInfoBlock({ branch: "feature", commitsAhead: 3 }),
      ["Branch:   feature  (3 commits ahead of main)"],
    );
  });

  test("custom base branch", () => {
    assert.deepEqual(
      formatGitInfoBlock({ branch: "f", commitsAhead: 1, baseBranch: "trunk" }),
      ["Branch:   f  (1 commit ahead of trunk)"],
    );
  });
});

describe("formatKnownIssues", () => {
  test("empty list renders nothing (caller decides whether to include section)", () => {
    assert.deepEqual(formatKnownIssues([]), []);
  });

  test("non-empty list renders Known issues section", () => {
    const out = formatKnownIssues(["lint warning in foo.ts:42"]);
    assert.deepEqual(out, ["Known issues:", "  └ lint warning in foo.ts:42"]);
  });
});
