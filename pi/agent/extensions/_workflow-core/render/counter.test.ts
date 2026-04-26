import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderCounter } from "./counter.ts";

describe("renderCounter", () => {
  test("with total: 'iter 7/50'", () => {
    assert.equal(
      renderCounter({ label: "iter", current: 7, total: 50 }),
      "iter 7/50",
    );
  });
  test("without total: 'iter 7'", () => {
    assert.equal(renderCounter({ label: "iter", current: 7 }), "iter 7");
  });
});
