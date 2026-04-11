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

export function logFormattingIssue(ctx: NotifyContext, message: string): void {
  console.warn(`[code-feedback] ${message}`);
  if (ctx.hasUI) {
    ctx.ui.notify(message, "warning");
  }
}
