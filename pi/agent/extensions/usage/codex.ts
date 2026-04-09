import type { ProviderAdapter } from "./utils.js";

export const codexAdapter: ProviderAdapter = {
  label: "Codex",
  handles: (provider) => provider === "openai-codex",

  async fetchUsage(apiKey) {
    let res: Response;
    try {
      res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;

    let data: any;
    try {
      data = await res.json();
    } catch {
      return null;
    }

    const codexEntry = (data.additional_rate_limits ?? []).find(
      (r: any) => r.metered_feature === "codex",
    );
    const window =
      codexEntry?.rate_limit?.primary_window ?? data.rate_limit?.primary_window;
    const limitReached =
      codexEntry?.rate_limit?.limit_reached ??
      data.rate_limit?.limit_reached ??
      false;

    return {
      usedPercent: window?.used_percent,
      resetAfterSeconds: window?.reset_after_seconds,
      limitReached,
      balance:
        data.credits?.has_credits && !data.credits?.unlimited
          ? data.credits.balance
          : undefined,
    };
  },
};
