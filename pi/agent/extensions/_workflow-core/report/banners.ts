function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatCancelledBanner(elapsedMs: number): string {
  return `Cancelled by user at ${mmss(elapsedMs)}`;
}

export function formatFailureBanner(reason: string): string {
  return `Failed: ${reason}`;
}
