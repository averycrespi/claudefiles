/**
 * Compact renderer for the built-in `bash` tool.
 *
 * Shows the command as a one-line label, a short tail of output on success,
 * and a one-line error on failure. Execution is delegated to Pi's built-in
 * bash tool unchanged.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { firstLine, getResultText, singleLineCommand } from "./shared.js";

const TAIL_LINES = 3;

const bashTools = new Map<string, ReturnType<typeof createBashTool>>();

function getBashTool(cwd: string) {
  let tool = bashTools.get(cwd);
  if (!tool) {
    tool = createBashTool(cwd);
    bashTools.set(cwd, tool);
  }
  return tool;
}

/**
 * Take the last N non-empty lines of text, ignoring trailing whitespace.
 */
function tailNonEmptyLines(text: string, count: number): string[] {
  const lines = text.split("\n");
  const result: string[] = [];
  for (let i = lines.length - 1; i >= 0 && result.length < count; i--) {
    const line = lines[i];
    if (line && line.trim().length > 0) {
      result.unshift(line);
    }
  }
  return result;
}

export default function registerBash(pi: ExtensionAPI) {
  const defaultTool = getBashTool(process.cwd());

  pi.registerTool({
    name: "bash",
    label: "bash",
    description: defaultTool.description,
    parameters: defaultTool.parameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBashTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, _context) {
      const commandLabel = singleLineCommand(args?.command);
      return new Text(
        `${theme.fg("toolTitle", theme.bold("bash"))} ${theme.fg("accent", commandLabel)}`,
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const commandLabel = singleLineCommand(context.args?.command);

      if (isPartial) {
        return new Text(theme.fg("warning", `Running ${commandLabel}…`), 0, 0);
      }

      const text = getResultText(result);

      if (context.isError) {
        const message = firstLine(text) || `bash failed: ${commandLabel}`;
        return new Text(theme.fg("error", message), 0, 0);
      }

      const tail = tailNonEmptyLines(text, TAIL_LINES);
      if (tail.length === 0) {
        return new Text("", 0, 0);
      }

      const rendered = tail.map((line) => theme.fg("muted", line)).join("\n");
      return new Text(rendered, 0, 0);
    },
  });
}
