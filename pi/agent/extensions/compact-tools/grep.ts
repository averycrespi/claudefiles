/**
 * Compact renderer for the built-in `grep` tool.
 *
 * Shows a one-line pattern label and a count of matches on success.
 * Execution is delegated to Pi's built-in grep tool unchanged.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  clearPartialTimer,
  countNonEmptyLines,
  firstLine,
  getRelativeLabel,
  getResultText,
  partialElapsed,
  plural,
} from "../_shared/render.ts";

const grepTools = new Map<string, ReturnType<typeof createGrepTool>>();

function getGrepTool(cwd: string) {
  let tool = grepTools.get(cwd);
  if (!tool) {
    tool = createGrepTool(cwd);
    grepTools.set(cwd, tool);
  }
  return tool;
}

export default function registerGrep(pi: ExtensionAPI) {
  const defaultTool = getGrepTool(process.cwd());

  pi.registerTool({
    name: "grep",
    label: "grep",
    description: defaultTool.description,
    parameters: defaultTool.parameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getGrepTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const pattern = args?.pattern ?? "";
      const scope = getRelativeLabel(context.cwd, args?.path ?? ".");
      const globSuffix = args?.glob ? theme.fg("muted", ` (${args.glob})`) : "";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${pattern}/`)} ${theme.fg("muted", `in ${scope}`)}${globSuffix}`,
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const pattern = context.args?.pattern ?? "pattern";

      if (isPartial) {
        return new Text(
          theme.fg(
            "warning",
            `Searching /${pattern}/...${partialElapsed(context)}`,
          ),
          0,
          0,
        );
      }

      clearPartialTimer(context);

      const text = getResultText(result);

      if (context.isError) {
        const message = firstLine(text) || `Error searching /${pattern}/`;
        return new Text(theme.fg("error", message), 0, 0);
      }

      const count = countNonEmptyLines(text);
      if (count === 0) {
        return new Text(theme.fg("muted", "no matches"), 0, 0);
      }

      return new Text(
        theme.fg("muted", plural(count, "match", "matches")),
        0,
        0,
      );
    },
  });
}
