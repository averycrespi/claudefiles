/**
 * Provider usage footer extension for Pi.
 *
 * Displays the current provider's rate-limit quota in the footer.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { codexAdapter } from "./codex.ts";
import { buildFooterText, type ProviderAdapter } from "./utils.ts";

// Add new adapters here.
const ADAPTERS: ProviderAdapter[] = [codexAdapter];

const DEBOUNCE_MS = 60_000;

export default function (pi: ExtensionAPI) {
  let footerText = "";
  let lastFetchAt = 0;

  async function refresh(ctx: any): Promise<void> {
    const now = Date.now();
    if (now - lastFetchAt < DEBOUNCE_MS) return;

    const model = ctx.model;
    if (!model) return;

    const adapter = ADAPTERS.find((a) => a.handles(model.provider));
    if (!adapter) return;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return;

    lastFetchAt = now;

    const stats = await adapter.fetchUsage(auth.apiKey, auth.headers);
    if (!stats) return;

    footerText = `\x1b[2m${buildFooterText(adapter, stats)}\x1b[0m`;
  }

  async function refreshAndUpdate(ctx: any): Promise<void> {
    await refresh(ctx);
    if (ctx.hasUI) ctx.ui.setStatus("provider-usage", footerText || undefined);
  }

  pi.on("session_start", async (_event, ctx) => {
    await refreshAndUpdate(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await refreshAndUpdate(ctx);
  });
}
