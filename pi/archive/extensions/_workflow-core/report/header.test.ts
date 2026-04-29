import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatHeader } from "./header.ts";

describe("formatHeader", () => {
  test("renders title surrounded by box-drawing markers", () => {
    assert.equal(formatHeader("Autopilot Report"), "━━━ Autopilot Report ━━━");
  });
});
