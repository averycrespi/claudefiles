import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HindsightClient } from "./client.ts";
import type { HindsightConfig } from "./config.ts";
import { validateRequiredConfig } from "./config.ts";

const SMOKE_QUERY = "hindsight doctor connectivity smoke test";

type DoctorDeps = {
  client: HindsightClient;
  loadConfig: (cwd: string) => Promise<HindsightConfig> | HindsightConfig;
};

export function registerHindsightDoctorCommand(
  pi: Pick<ExtensionAPI, "registerCommand">,
  deps: DoctorDeps,
): void {
  pi.registerCommand("hindsight-doctor", {
    description: "Run read-only Hindsight diagnostics.",
    handler: async (_args, ctx) => {
      const config = await deps.loadConfig(ctx.cwd);
      deps.client.configure(config);
      const report = await runDoctor(deps.client, config);
      ctx.ui.notify(report.text, report.level);
    },
  });
}

async function runDoctor(
  client: HindsightClient,
  config: HindsightConfig,
): Promise<{ text: string; level: "info" | "warning" }> {
  const lines = ["Hindsight doctor", ""];
  lines.push(`Target: ${config.apiUrl} bank=${config.bankId}`);

  const configErrors = validateRequiredConfig(config);
  if (configErrors.length > 0) {
    lines.push("Config readiness: fail");
    for (const error of configErrors) lines.push(`- ${error}`);
    return { text: lines.join("\n"), level: "warning" };
  }

  lines.push("Config readiness: pass");

  try {
    await client.recall(
      {
        query: SMOKE_QUERY,
        budget: "low",
        max_tokens: 1,
        tags: ["hindsight-doctor-smoke-test"],
        tags_match: "any",
      },
      new AbortController().signal,
    );
    lines.push("Connectivity/bank access: pass");
    lines.push(
      "Smoke check: read-only recall completed; memory contents omitted.",
    );
    return { text: lines.join("\n"), level: "info" };
  } catch (err) {
    lines.push("Connectivity/bank access: fail");
    lines.push(`- ${summarizeError(err)}`);
    lines.push("No memories were written or displayed.");
    return { text: lines.join("\n"), level: "warning" };
  }
}

function summarizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const http = message.match(/Hindsight HTTP \d+/)?.[0];
  if (http) return http;
  if (
    /Failed to fetch|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(
      message,
    )
  ) {
    return "Unable to reach Hindsight API";
  }
  return message.split("\n")[0]?.slice(0, 160) || "Unknown error";
}
