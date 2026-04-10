export interface UsageStats {
  /** 0–100, percentage of quota consumed in the current window */
  usedPercent?: number;
  /** Seconds until the quota window resets */
  resetAfterSeconds?: number;
  /** True when the hard limit has been reached */
  limitReached?: boolean;
  /** Credit balance string for credit-based plans (e.g. "4.20") */
  balance?: string;
}

export interface ProviderAdapter {
  /** Human-readable name shown in the footer */
  label: string;
  /** Returns true if this adapter handles the given provider identifier */
  handles(provider: string): boolean;
  /** Fetch current usage. apiKey is the bearer token; headers are any extra auth headers. */
  fetchUsage(
    apiKey: string,
    headers?: Record<string, string>,
  ): Promise<UsageStats | null>;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function buildFooterText(
  adapter: ProviderAdapter,
  stats: UsageStats,
): string {
  const parts: string[] = [];

  if (stats.limitReached) {
    parts.push(`${adapter.label}: limit reached`);
  } else if (stats.usedPercent !== undefined) {
    parts.push(`${adapter.label}: ${stats.usedPercent}%`);
  } else if (stats.balance !== undefined) {
    parts.push(`${adapter.label}: $${stats.balance}`);
  } else {
    parts.push(adapter.label);
  }

  if (stats.resetAfterSeconds !== undefined) {
    parts.push(`resets in ${formatDuration(stats.resetAfterSeconds)}`);
  }

  return parts.join(" · ");
}
