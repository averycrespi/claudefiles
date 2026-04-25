import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatLabelValueRow } from "./rows.ts";

describe("formatLabelValueRow", () => {
  test("default label width pads to 9 chars + colon", () => {
    assert.equal(
      formatLabelValueRow("Design", ".designs/x.md"),
      "Design:   .designs/x.md",
    );
  });

  test("custom label width", () => {
    assert.equal(
      formatLabelValueRow("Design", "x.md", { labelWidth: 12 }),
      "Design:      x.md",
    );
  });

  test("label longer than width still renders one space after colon", () => {
    assert.equal(
      formatLabelValueRow("VeryLongLabel", "x", { labelWidth: 5 }),
      "VeryLongLabel: x",
    );
  });
});
