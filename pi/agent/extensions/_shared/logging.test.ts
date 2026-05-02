import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test, mock } from "node:test";

import {
  _loggingFs,
  createManagedLogger,
  redactSecrets,
  safeErrorMessage,
} from "./logging.ts";

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

test("createManagedLogger creates sanitized logs under the shared temp root", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-logger-test-"));
  const tmpStub = mock.method(_loggingFs, "tmpdir", () => root);

  try {
    const logger = createManagedLogger({
      extensionName: "sub agents/../x",
      id: "tool call/1",
    });
    logger.write("hello");
    await logger.close();

    assert.equal(
      dirname(logger.path),
      join(root, "pi-extension-logs", "sub_agents____x"),
    );
    assert.equal(basename(logger.path), "tool_call_1.log");
    assert.equal(await readFile(logger.path, "utf8"), "hello");
  } finally {
    tmpStub.mock.restore();
  }
});

test("createManagedLogger chooses a unique path when the requested id exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-logger-test-"));
  const dir = join(root, "pi-extension-logs", "subagents");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(dir, { recursive: true }),
  );
  await writeFile(join(dir, "run.log"), "old", "utf8");

  const tmpStub = mock.method(_loggingFs, "tmpdir", () => root);
  const nowStub = mock.method(_loggingFs, "now", () => 1234);

  try {
    const logger = createManagedLogger({
      extensionName: "subagents",
      id: "run",
    });
    logger.write("new");
    await logger.close();

    assert.equal(basename(logger.path), "run-1234.log");
    assert.equal(await readFile(join(dir, "run.log"), "utf8"), "old");
    assert.equal(await readFile(logger.path, "utf8"), "new");
  } finally {
    tmpStub.mock.restore();
    nowStub.mock.restore();
  }
});

test("ManagedLogger writes raw string and buffer chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-logger-test-"));
  const tmpStub = mock.method(_loggingFs, "tmpdir", () => root);

  try {
    const logger = createManagedLogger({ extensionName: "x", id: "raw" });
    logger.write("Authorization: Bearer secret-token\n");
    logger.write(Buffer.from("token=abc123\n"));
    await logger.close();

    assert.equal(
      await readFile(logger.path, "utf8"),
      "Authorization: Bearer secret-token\ntoken=abc123\n",
    );
  } finally {
    tmpStub.mock.restore();
  }
});

test("ManagedLogger delete removes the log and ignores missing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-logger-test-"));
  const tmpStub = mock.method(_loggingFs, "tmpdir", () => root);

  try {
    const logger = createManagedLogger({ extensionName: "x", id: "cleanup" });
    logger.write("content");
    await logger.close();

    assert.equal(existsSync(logger.path), true);
    logger.delete();
    assert.equal(existsSync(logger.path), false);
    assert.doesNotThrow(() => logger.delete());
  } finally {
    tmpStub.mock.restore();
  }
});
