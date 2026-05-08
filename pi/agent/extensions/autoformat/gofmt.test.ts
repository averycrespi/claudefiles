import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { _execFile, formatGoFile } from "./gofmt.ts";

const notifyCtx = {
  cwd: "/repo",
  hasUI: true,
  ui: { notify: mock.fn() },
};

test("formatGoFile runs gofmt -w for Go files", async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const stub = mock.method(
    _execFile,
    "fn",
    (
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: Function,
    ) => {
      calls.push({ file, args });
      cb(null, "", "");
    },
  );

  try {
    await formatGoFile(
      "/repo/main.go",
      new AbortController().signal,
      notifyCtx,
    );
  } finally {
    stub.mock.restore();
  }

  assert.deepEqual(calls, [{ file: "gofmt", args: ["-w", "/repo/main.go"] }]);
});

test("formatGoFile ignores missing gofmt", async () => {
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
      const error = Object.assign(new Error("missing"), { code: "ENOENT" });
      cb(error, "", "");
    },
  );

  try {
    await formatGoFile("/repo/main.go", new AbortController().signal, {
      ...notifyCtx,
      ui: { notify },
    });
  } finally {
    stub.mock.restore();
  }

  assert.equal(notify.mock.callCount(), 0);
});

test("formatGoFile warns on formatter failures", async () => {
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
      cb(new Error("bad formatting"), "", "");
    },
  );

  try {
    await formatGoFile("/repo/main.go", new AbortController().signal, {
      ...notifyCtx,
      ui: { notify },
    });
  } finally {
    stub.mock.restore();
  }

  assert.equal(notify.mock.callCount(), 1);
  assert.match(notify.mock.calls[0].arguments[0], /gofmt failed/);
});
