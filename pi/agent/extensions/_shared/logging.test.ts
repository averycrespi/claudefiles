import assert from "node:assert/strict";
import test from "node:test";

import { redactSecrets, safeErrorMessage } from "./logging.ts";

test("redactSecrets masks bearer tokens and assignment-style secrets", () => {
  const text = `Authorization: Bearer sk-abc123SECRET\napi_key = "ghp_abcdefghijklmnopqrstuvwxyz123456"\npassword: hunter2`;

  assert.equal(
    redactSecrets(text),
    `Authorization: Bearer [REDACTED]\napi_key = "[REDACTED]"\npassword: [REDACTED]`,
  );
});

test("redactSecrets masks private key blocks", () => {
  const text =
    "before\n-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----\nafter";

  assert.equal(redactSecrets(text), "before\n[REDACTED PRIVATE KEY]\nafter");
});

test("safeErrorMessage returns sanitized error message without stack", () => {
  const error = new Error("Request failed with Bearer token123");
  error.stack = "stack should not appear";

  assert.equal(
    safeErrorMessage(error),
    "Request failed with Bearer [REDACTED]",
  );
});

test("safeErrorMessage handles non-errors", () => {
  assert.equal(safeErrorMessage({ reason: "bad" }), "[object Object]");
});
