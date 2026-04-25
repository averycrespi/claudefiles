import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatCancelledBanner, formatFailureBanner } from "./banners.ts";

describe("formatCancelledBanner", () => {
  test("formats elapsed as MM:SS", () => {
    assert.equal(formatCancelledBanner(125000), "Cancelled by user at 02:05");
  });

  test("zero elapsed", () => {
    assert.equal(formatCancelledBanner(0), "Cancelled by user at 00:00");
  });
});

describe("formatFailureBanner", () => {
  test("formats reason inline", () => {
    assert.equal(
      formatFailureBanner("plan parse error"),
      "Failed: plan parse error",
    );
  });
});
