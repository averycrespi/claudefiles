import assert from "node:assert/strict";
import { mock, test } from "node:test";

import autoformat from "./index.ts";
import { _execFile } from "./prettier.ts";

test("autoformat does not spawn a formatter when the tool-result context is aborted", async () => {
  let handler: Function | undefined;
  autoformat({ on: (_event: string, fn: Function) => (handler = fn) } as any);
  assert.ok(handler, "extension should register a tool_result handler");

  const controller = new AbortController();
  controller.abort();
  const execStub = mock.method(
    _execFile,
    "fn",
    (
      _file: string,
      _args: readonly string[],
      _options: unknown,
      cb: Function,
    ) => {
      cb(null, "", "");
    },
  );

  try {
    await handler(
      {
        toolName: "write",
        input: { path: "file.ts" },
        content: [{ type: "text", text: "ok" }],
      },
      {
        cwd: "/repo",
        hasUI: true,
        ui: { notify: mock.fn() },
        signal: controller.signal,
      },
    );
  } finally {
    execStub.mock.restore();
  }

  assert.equal(execStub.mock.callCount(), 0);
});
