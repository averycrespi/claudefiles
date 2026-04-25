import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAskParams } from "./validate.ts";

test("validateAskParams returns null for a valid options list", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "Yes" }, { label: "No" }],
    }),
    null,
  );
});

test("validateAskParams returns null when recommended points to a valid index", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "A" }, { label: "B" }, { label: "C" }],
      recommended: 2,
    }),
    null,
  );
});

test("validateAskParams rejects whitespace-only labels", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "   " }, { label: "B" }],
    }),
    "Option labels must be non-empty.",
  );
});

test("validateAskParams rejects a reserved 'Other' label", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "Other" }, { label: "Skip" }],
    }),
    "Options must not include an 'Other' label; it is added automatically.",
  );
});

test("validateAskParams rejects the auto-added 'Type something.' label", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "Type something." }, { label: "Skip" }],
    }),
    "Options must not include an 'Other' label; it is added automatically.",
  );
});

test("validateAskParams rejects reserved labels case-insensitively", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "OTHER" }, { label: "Skip" }],
    }),
    "Options must not include an 'Other' label; it is added automatically.",
  );
});

test("validateAskParams rejects duplicate labels case-insensitively", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "Yes" }, { label: "yes" }],
    }),
    "Option labels must be unique.",
  );
});

test("validateAskParams treats labels as duplicate after trimming", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "Yes" }, { label: "  Yes  " }],
    }),
    "Option labels must be unique.",
  );
});

test("validateAskParams rejects recommended index >= options length", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "A" }, { label: "B" }],
      recommended: 2,
    }),
    "recommended must point to a valid option index.",
  );
});

test("validateAskParams allows recommended=0", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "A" }, { label: "B" }],
      recommended: 0,
    }),
    null,
  );
});

test("validateAskParams allows undefined recommended", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "A" }, { label: "B" }],
    }),
    null,
  );
});

test("validateAskParams returns the empty-label error before checking other rules", () => {
  assert.equal(
    validateAskParams({
      options: [{ label: "" }, { label: "Other" }],
      recommended: 99,
    }),
    "Option labels must be non-empty.",
  );
});
