import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { _execFile, formatWithPrettier } from "./prettier.ts";

const signal = new AbortController().signal;

test("formatWithPrettier tries project-local prettier before PATH prettier", async () => {
  const calls: string[] = [];
  const stub = mock.method(
    _execFile,
    "fn",
    (
      file: string,
      _args: readonly string[],
      _options: unknown,
      cb: Function,
    ) => {
      calls.push(file);
      if (calls.length === 1) {
        cb(Object.assign(new Error("missing"), { code: "ENOENT" }), "", "");
        return;
      }
      cb(null, "", "");
    },
  );

  try {
    await formatWithPrettier("/repo/file.ts", signal, {
      cwd: "/repo",
      hasUI: true,
      ui: { notify: mock.fn() },
    });
  } finally {
    stub.mock.restore();
  }

  assert.deepEqual(calls, ["/repo/node_modules/.bin/prettier", "prettier"]);
});

test("formatWithPrettier ignores missing prettier binaries", async () => {
  const notify = mock.fn();
  const stub = mock.method(
    _execFile,
    "fn",
    (
      _file: string,
      _args: readonly string[],
      _options: unknown,
      cb: Function,
    ) => {
      cb(Object.assign(new Error("missing"), { code: "ENOENT" }), "", "");
    },
  );

  try {
    await formatWithPrettier("/repo/file.ts", signal, {
      cwd: "/repo",
      hasUI: true,
      ui: { notify },
    });
  } finally {
    stub.mock.restore();
  }

  assert.equal(notify.mock.callCount(), 0);
});

test("formatWithPrettier warns on non-ENOENT formatter failure without trying fallback", async () => {
  const notify = mock.fn();
  const calls: string[] = [];
  const stub = mock.method(
    _execFile,
    "fn",
    (
      file: string,
      _args: readonly string[],
      _options: unknown,
      cb: Function,
    ) => {
      calls.push(file);
      cb(new Error("parse failed"), "", "");
    },
  );

  try {
    await formatWithPrettier("/repo/file.ts", signal, {
      cwd: "/repo",
      hasUI: true,
      ui: { notify },
    });
  } finally {
    stub.mock.restore();
  }

  assert.deepEqual(calls, ["/repo/node_modules/.bin/prettier"]);
  assert.equal(notify.mock.callCount(), 1);
  assert.match(notify.mock.calls[0].arguments[0], /Prettier failed/);
});
