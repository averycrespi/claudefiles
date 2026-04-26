import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderStageBreadcrumb } from "./breadcrumb.ts";

describe("renderStageBreadcrumb", () => {
  test("joins stages with arrow separator", () => {
    assert.equal(
      renderStageBreadcrumb({
        stages: ["plan", "implement", "verify"],
        active: "implement",
      }),
      "plan › implement › verify",
    );
  });

  test("no active stage still renders", () => {
    assert.equal(
      renderStageBreadcrumb({ stages: ["a", "b"], active: null }),
      "a › b",
    );
  });

  test("theme adapter is invoked for active stage when provided", () => {
    const calls: string[] = [];
    const theme = {
      bold: (s: string) => {
        calls.push(`bold:${s}`);
        return s;
      },
      fg: (kind: string, s: string) => {
        calls.push(`fg:${kind}:${s}`);
        return s;
      },
    };
    renderStageBreadcrumb({ stages: ["a", "b"], active: "b", theme });
    assert.ok(
      calls.some((c) => c.startsWith("bold:b") || c.startsWith("fg:accent:b")),
    );
  });
});
