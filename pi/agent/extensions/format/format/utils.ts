export type NotifyContext = {
  cwd: string;
  hasUI: boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
  signal?: AbortSignal;
};

export function getToolPath(event: {
  input?: unknown;
  details?: unknown;
}): string | null {
  const input = event.input as { path?: unknown } | undefined;
  if (typeof input?.path === "string" && input.path.trim()) {
    return input.path.trim().replace(/^@/, "");
  }

  const details = event.details as { path?: unknown } | undefined;
  if (typeof details?.path === "string" && details.path.trim()) {
    return details.path.trim().replace(/^@/, "");
  }

  return null;
}

// In TUI mode, console writes corrupt the footer — route to notify instead.
// In headless mode (json/rpc/-p), stderr is fine and useful for log capture.
export function logFormattingIssue(ctx: NotifyContext, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "warning");
  } else {
    console.error(`[format] ${message}`);
  }
}
