import type { HindsightConfig } from "./config.ts";

export type RetainRequest = {
  items: Array<{
    content: string;
    timestamp?: string | null;
    context?: string | null;
    metadata?: Record<string, string>;
    document_id?: string | null;
    tags?: string[];
    update_mode?: "replace" | "append" | null;
  }>;
  async?: boolean;
};

export type RecallRequest = {
  query: string;
  types?: string[];
  budget?: string;
  max_tokens?: number;
  trace?: boolean;
  query_timestamp?: string | null;
  include?: Record<string, unknown>;
  tags?: string[];
  tags_match?: string;
};

export type ReflectRequest = {
  query: string;
  budget?: string;
  max_tokens?: number;
  include?: Record<string, unknown>;
  tags?: string[];
  tags_match?: string;
  fact_types?: string[];
  exclude_mental_models?: boolean;
};

export const _fetch = { fn: globalThis.fetch };

export class HindsightClient {
  constructor(private config: HindsightConfig) {}

  configure(config: HindsightConfig): void {
    this.config = config;
  }

  retain(body: RetainRequest, signal: AbortSignal): Promise<unknown> {
    return this.post(
      `/v1/default/banks/${this.bankId()}/memories`,
      body,
      signal,
    );
  }

  recall(body: RecallRequest, signal: AbortSignal): Promise<unknown> {
    return this.post(
      `/v1/default/banks/${this.bankId()}/memories/recall`,
      body,
      signal,
    );
  }

  reflect(body: ReflectRequest, signal: AbortSignal): Promise<unknown> {
    return this.post(
      `/v1/default/banks/${this.bankId()}/reflect`,
      body,
      signal,
    );
  }

  private bankId(): string {
    return encodeURIComponent(this.config.bankId ?? "");
  }

  private async post(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await _fetch.fn(`${this.config.baseUrl}${path}`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${this.config.apiKey ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const json = parseJson(text);
    if (!response.ok) {
      const detail =
        typeof json === "object" && json && "detail" in json
          ? JSON.stringify((json as { detail: unknown }).detail)
          : text;
      throw new Error(
        `Hindsight HTTP ${response.status}: ${detail || response.statusText}`,
      );
    }
    return json;
  }
}

function parseJson(text: string): unknown {
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
