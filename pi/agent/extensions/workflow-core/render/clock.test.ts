import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderClock } from "./clock.ts";

describe("renderClock", () => {
  test("MM:SS for under an hour", () => {
    assert.equal(renderClock(125000), "02:05");
  });
  test("clamps negative to 00:00", () => {
    assert.equal(renderClock(-50), "00:00");
  });
  test("HH:MM:SS over an hour", () => {
    assert.equal(renderClock(3661000), "01:01:01");
  });
});
