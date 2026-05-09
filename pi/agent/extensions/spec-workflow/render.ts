import {
  clearPartialTimer,
  firstLine,
  getResultText,
  getTruncatedText,
  partialElapsed,
} from "../_shared/render.ts";

export function renderSpecToolCall(
  name: string,
  summary: string,
  theme: any,
  context: any,
) {
  return getTruncatedText(context.lastComponent, [
    `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("accent", summary)}`,
  ]);
}

export function renderSpecToolResult(
  result: any,
  options: { isPartial: boolean },
  theme: any,
  context: any,
) {
  if (options.isPartial) {
    return getTruncatedText(context.lastComponent, [
      theme.fg(
        "warning",
        `Updating spec workflow...${partialElapsed(context)}`,
      ),
    ]);
  }

  clearPartialTimer(context);
  const text = getResultText(result);
  const message = firstLine(text);
  if (context.isError || message.startsWith("Error:")) {
    return getTruncatedText(context.lastComponent, [
      theme.fg("error", message || "spec workflow error"),
    ]);
  }
  return getTruncatedText(context.lastComponent, [
    theme.fg("success", message || "✓ spec workflow updated"),
  ]);
}

export function formatStatus(details: any): string {
  if (!details || typeof details !== "object") return "No active spec.";
  const slug = typeof details.slug === "string" ? details.slug : "unknown";
  const phase = typeof details.phase === "string" ? details.phase : "unknown";
  const tasks = Array.isArray(details.tasks) ? details.tasks : [];
  const complete = tasks.filter(
    (task: any) => task?.status === "complete",
  ).length;
  return `Spec ${slug}: ${phase} · ${complete}/${tasks.length} tasks complete`;
}
