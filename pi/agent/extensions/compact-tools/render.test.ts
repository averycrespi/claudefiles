import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { visibleWidth } from "@mariozechner/pi-tui";
import registerBash from "./bash.ts";
import registerFind from "./find.ts";
import registerGrep from "./grep.ts";
import registerLs from "./ls.ts";
import registerRead from "./read.ts";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type RegisteredTool = {
  renderCall: (
    args: any,
    theme: typeof identityTheme,
    context: any,
  ) => {
    render: (width: number) => string[];
  };
  renderResult: (
    result: AgentToolResult<unknown>,
    options: { isPartial: boolean },
    theme: typeof identityTheme,
    context: any,
  ) => { render: (width: number) => string[] };
};

function captureTool(register: (pi: any) => void): RegisteredTool {
  let tool: RegisteredTool | undefined;
  register({
    registerTool(def: RegisteredTool) {
      tool = def;
    },
  });
  assert.ok(tool, "tool should be registered");
  return tool;
}

function renderCall(
  tool: RegisteredTool,
  args: Record<string, unknown>,
  width: number,
): string[] {
  return tool
    .renderCall(args, identityTheme, {
      cwd: "/repo",
      lastComponent: undefined,
    })
    .render(width);
}

function renderResult(
  tool: RegisteredTool,
  text: string,
  width: number,
  options: {
    args?: Record<string, unknown>;
    isError?: boolean;
    isPartial?: boolean;
  } = {},
): string[] {
  return tool
    .renderResult(
      {
        content: [{ type: "text", text }],
      } as unknown as AgentToolResult<unknown>,
      { isPartial: options.isPartial ?? false },
      identityTheme,
      {
        cwd: "/repo",
        args: options.args ?? {},
        isError: options.isError ?? false,
        state: {},
        invalidate() {},
        lastComponent: undefined,
      },
    )
    .render(width);
}

function assertRenderedWidth(lines: string[], width: number) {
  assert.ok(lines.length > 0, "expected visible lines");
  for (const line of lines) {
    assert.ok(
      visibleWidth(line) <= width,
      `expected line width <= ${width}, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
    );
  }
}

test("bash renderCall truncates long commands instead of wrapping", () => {
  const tool = captureTool(registerBash);

  const lines = renderCall(
    tool,
    { command: "printf 'abcdefghijklmnopqrstuvwxyz0123456789'" },
    18,
  );

  assert.equal(lines.length, 1);
  assertRenderedWidth(lines, 18);
});

test("read error rendering truncates long messages instead of wrapping", () => {
  const tool = captureTool(registerRead);

  const lines = renderResult(
    tool,
    "ENOENT: no such file or directory, open '/repo/some/really/long/path/to/a/file.txt'",
    24,
    { args: { path: "some/really/long/path/to/a/file.txt" }, isError: true },
  );

  assert.equal(lines.length, 1);
  assertRenderedWidth(lines, 24);
});

test("ls success rendering truncates each preview line instead of wrapping", () => {
  const tool = captureTool(registerLs);

  const lines = renderResult(
    tool,
    [
      "src/components/extremely-long-component-name-one.ts",
      "src/components/extremely-long-component-name-two.ts",
      "src/components/extremely-long-component-name-three.ts",
      "src/components/extremely-long-component-name-four.ts",
    ].join("\n"),
    20,
    { args: { path: "src/components" } },
  );

  assert.equal(lines.length, 4);
  assertRenderedWidth(lines, 20);
});

test("find success rendering truncates each preview line instead of wrapping", () => {
  const tool = captureTool(registerFind);

  const lines = renderResult(
    tool,
    [
      "src/routes/really-long-file-name-one.ts",
      "src/routes/really-long-file-name-two.ts",
      "src/routes/really-long-file-name-three.ts",
      "src/routes/really-long-file-name-four.ts",
    ].join("\n"),
    18,
    { args: { pattern: "*.ts", path: "src/routes" } },
  );

  assert.equal(lines.length, 4);
  assertRenderedWidth(lines, 18);
});

test("grep error rendering truncates long messages instead of wrapping", () => {
  const tool = captureTool(registerGrep);

  const lines = renderResult(
    tool,
    "rg: /repo/src/a/really/long/path/to/search: IO error for operation on /repo/src/a/really/long/path/to/search: No such file or directory (os error 2)",
    22,
    { args: { pattern: "needle", path: "src" }, isError: true },
  );

  assert.equal(lines.length, 1);
  assertRenderedWidth(lines, 22);
});
