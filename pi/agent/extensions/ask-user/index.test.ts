import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import askUser from "./index.ts";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

test("custom UI wraps long question text instead of truncating it", async () => {
  const tools = new Map<string, any>();
  askUser({ registerTool: (def: any) => tools.set(def.name, def) } as any);

  let renderedLines: string[] = [];
  const ctx = {
    hasUI: true,
    ui: {
      async custom(factory: any) {
        const component = factory(
          { requestRender: () => {} },
          identityTheme,
          {},
          () => {},
        );
        renderedLines = component.render(36);
        return null;
      },
    },
  };

  await tools.get("ask_user").execute(
    "call-1",
    {
      question:
        "Which implementation path should we choose for wrapping long ask_user questions correctly?",
      options: [{ label: "A" }, { label: "B" }],
    },
    undefined,
    undefined,
    ctx,
  );

  assert.ok(renderedLines.some((line) => line.includes("wrapping long")));
  assert.ok(renderedLines.some((line) => line.includes("questions correctly?")));
  const questionLines = renderedLines.slice(1, renderedLines.indexOf(""));
  assert.ok(
    questionLines.every((line) => !line.includes("...")),
    "wrapped question should not be ellipsized",
  );
});


test("custom UI rewraps question text when render width changes", async () => {
  const tools = new Map<string, any>();
  askUser({ registerTool: (def: any) => tools.set(def.name, def) } as any);

  let component: { render(width: number): string[] };
  const ctx = {
    hasUI: true,
    ui: {
      async custom(factory: any) {
        component = factory(
          { requestRender: () => {} },
          identityTheme,
          {},
          () => {},
        );
        component.render(80);
        const narrowLines = component.render(36);
        assert.ok(
          narrowLines.every((line) => visibleWidth(line) <= 36),
          "rerendered lines must fit the latest width",
        );
        return null;
      },
    },
  };

  await tools.get("ask_user").execute(
    "call-1",
    {
      question:
        "Which implementation path should we choose for wrapping long ask_user questions correctly?",
      options: [{ label: "A" }, { label: "B" }],
    },
    undefined,
    undefined,
    ctx,
  );
});
