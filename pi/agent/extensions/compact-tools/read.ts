/**
 * Compact renderer for the built-in `read` tool.
 *
 * Shows a one-line file label instead of file contents. Execution is
 * delegated to Pi's built-in read tool unchanged.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { firstLine, getRelativeLabel, getResultText } from "./shared.js";

const readTools = new Map<string, ReturnType<typeof createReadTool>>();

function getReadTool(cwd: string) {
  let tool = readTools.get(cwd);
  if (!tool) {
    tool = createReadTool(cwd);
    readTools.set(cwd, tool);
  }
  return tool;
}

export default function registerRead(pi: ExtensionAPI) {
  const defaultTool = getReadTool(process.cwd());

  pi.registerTool({
    name: "read",
    label: "read",
    description: defaultTool.description,
    parameters: defaultTool.parameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getReadTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const fileLabel = getRelativeLabel(context.cwd, args.path);
      return new Text(
        `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", fileLabel)}`,
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const fileLabel = getRelativeLabel(context.cwd, context.args?.path);

      if (isPartial) {
        return new Text(theme.fg("warning", `Reading ${fileLabel}…`), 0, 0);
      }

      if (context.isError) {
        const message =
          firstLine(getResultText(result)) || `Error reading ${fileLabel}`;
        return new Text(theme.fg("error", message), 0, 0);
      }

      return new Text("", 0, 0);
    },
  });
}
