/**
 * Compact renderer for the built-in `find` tool.
 *
 * Shows a one-line glob pattern label and a count of results on success.
 * Execution is delegated to Pi's built-in find tool unchanged.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createFindTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  clearPartialTimer,
  countNonEmptyLines,
  firstLine,
  getRelativeLabel,
  getResultText,
  headNonEmptyLines,
  partialElapsed,
  plural,
} from "../_shared/render.ts";

const findTools = new Map<string, ReturnType<typeof createFindTool>>();

function getFindTool(cwd: string) {
  let tool = findTools.get(cwd);
  if (!tool) {
    tool = createFindTool(cwd);
    findTools.set(cwd, tool);
  }
  return tool;
}

export default function registerFind(pi: ExtensionAPI) {
  const defaultTool = getFindTool(process.cwd());

  pi.registerTool({
    name: "find",
    label: "find",
    description: defaultTool.description,
    parameters: defaultTool.parameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getFindTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const pattern = args?.pattern ?? "";
      const scope = getRelativeLabel(context.cwd, args?.path ?? ".");
      return new Text(
        `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", pattern)} ${theme.fg("muted", `in ${scope}`)}`,
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const pattern = context.args?.pattern ?? "files";

      if (isPartial) {
        return new Text(
          theme.fg(
            "warning",
            `Finding ${pattern}...${partialElapsed(context)}`,
          ),
          0,
          0,
        );
      }

      clearPartialTimer(context);

      const text = getResultText(result);

      if (context.isError) {
        const message = firstLine(text) || `Error finding ${pattern}`;
        return new Text(theme.fg("error", message), 0, 0);
      }

      const head = headNonEmptyLines(text, 3);
      if (head.length === 0) {
        return new Text(theme.fg("muted", "no matches"), 0, 0);
      }

      const totalLines = countNonEmptyLines(text);
      const extra = totalLines - head.length;
      const displayLines =
        extra > 0 ? [...head, `... +${plural(extra, "more result")}`] : head;
      const rendered = displayLines
        .map((line) => theme.fg("muted", line))
        .join("\n");
      return new Text(rendered, 0, 0);
    },
  });
}
