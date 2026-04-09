/**
 * Compact read extension for Pi.
 *
 * Overrides the built-in `read` tool renderer so the TUI shows a compact file
 * path label instead of the file contents. Tool execution behavior stays the
 * same; only the visual rendering is compacted.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { isAbsolute, relative, resolve } from "node:path";

const readTools = new Map<string, ReturnType<typeof createReadTool>>();

function getReadTool(cwd: string) {
  let tool = readTools.get(cwd);
  if (!tool) {
    tool = createReadTool(cwd);
    readTools.set(cwd, tool);
  }
  return tool;
}

function getFileLabel(cwd: string, path: unknown) {
  if (typeof path !== "string" || path.length === 0) return "file";

  const normalized = path.startsWith("@") ? path.slice(1) : path;
  const absolutePath = resolve(cwd, normalized);
  const relativePath = relative(cwd, absolutePath);

  if (
    relativePath &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  if (relativePath === "") {
    return ".";
  }

  return absolutePath;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "read",
    label: "read",
    description: getReadTool(process.cwd()).description,
    parameters: getReadTool(process.cwd()).parameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getReadTool(ctx.cwd).execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const fileLabel = getFileLabel(context.cwd, args.path);
      return new Text(
        `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", fileLabel)}`,
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const fileLabel = getFileLabel(context.cwd, context.args?.path);

      if (isPartial) {
        return new Text(theme.fg("warning", `Reading ${fileLabel}…`), 0, 0);
      }

      if (context.isError) {
        const textContent = result.content.find(
          (content) => content.type === "text",
        );
        const firstLine =
          textContent?.type === "text"
            ? textContent.text.split("\n")[0]
            : `Error reading ${fileLabel}`;
        return new Text(theme.fg("error", firstLine), 0, 0);
      }

      return new Text("", 0, 0);
    },
  });
}
