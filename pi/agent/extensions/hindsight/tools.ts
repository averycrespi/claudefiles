import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { HindsightClient } from "./client.ts";
import type { HindsightConfig } from "./config.ts";
import { validateRequiredConfig } from "./config.ts";
import { buildMetadata, buildQueryTags, buildTags } from "./tags.ts";

const MAX_RESULTS = 8;
const MAX_FIELD = 1200;
const MAX_TOTAL = 7000;

const PARAMS = Type.Object({
  action: Type.String({ description: "One of: retain, recall, reflect." }),
  content: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  scope: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()),
  kind: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Optional(Type.Record(Type.String(), Type.String())),
  document_id: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.String()),
  update_mode: Type.Optional(Type.String()),
  tags_match: Type.Optional(Type.String()),
  types: Type.Optional(Type.Array(Type.String())),
  max_tokens: Type.Optional(Type.Number()),
  budget: Type.Optional(Type.String()),
  trace: Type.Optional(Type.Boolean()),
  query_timestamp: Type.Optional(Type.String()),
  include_entities: Type.Optional(Type.Boolean()),
  include_chunks: Type.Optional(Type.Boolean()),
  include_source_facts: Type.Optional(Type.Boolean()),
  include_facts: Type.Optional(Type.Boolean()),
  include_tool_calls: Type.Optional(Type.Boolean()),
  fact_types: Type.Optional(Type.Array(Type.String())),
  exclude_mental_models: Type.Optional(Type.Boolean()),
});

type Params = Record<string, unknown>;

type ToolDeps = {
  client: HindsightClient;
  loadConfig: (cwd: string) => Promise<HindsightConfig>;
};

export function registerHindsightTool(pi: ExtensionAPI, deps: ToolDeps): void {
  pi.registerTool({
    name: "hindsight",
    label: "Hindsight Memory",
    description:
      "Explicitly retain facts in Hindsight, recall raw memory evidence, or ask Hindsight to synthesize a grounded reflection. Use recall for evidence and reflect for synthesis.",
    parameters: PARAMS,
    async execute(_id, params, signal, _onUpdate, ctx) {
      const config = await deps.loadConfig(ctx.cwd);
      deps.client.configure(config);
      return executeHindsight(
        deps.client,
        config,
        ctx,
        params as Params,
        signal ?? new AbortController().signal,
      );
    },
  });
}

export async function executeHindsight(
  client: HindsightClient,
  config: HindsightConfig,
  ctx: Pick<ExtensionContext, "cwd">,
  params: Params,
  signal: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const action = stringValue(params.action);
  if (!action) return errorResult("hindsight: action is required");
  if (!["retain", "recall", "reflect"].includes(action)) {
    return errorResult(`hindsight: unknown action '${action}'`);
  }
  const configErrors = validateRequiredConfig(config);
  if (configErrors.length > 0)
    return errorResult(`hindsight: ${configErrors.join("; ")}`);
  try {
    if (action === "retain")
      return await retain(client, config, ctx.cwd, params, signal);
    if (action === "recall")
      return await recall(client, config, ctx.cwd, params, signal);
    return await reflect(client, config, ctx.cwd, params, signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return errorResult(
      `hindsight ${action} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function retain(
  client: HindsightClient,
  config: HindsightConfig,
  cwd: string,
  params: Params,
  signal: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const content = stringValue(params.content);
  if (!content) return errorResult("hindsight retain: content is required");
  const scope = enumValue(
    params.scope,
    ["repo", "global"],
    config.defaultScope,
  );
  const source = enumValue(
    params.source,
    ["manual", "external", "agent"],
    "manual",
  );
  const kind = optionalEnumValue(params.kind, [
    "semantic",
    "episodic",
    "procedural",
  ]);
  if (params.kind !== undefined && !kind)
    return errorResult("hindsight retain: invalid kind");
  const updateMode = optionalEnumValue(params.update_mode, [
    "replace",
    "append",
  ]);
  if (params.update_mode !== undefined && !updateMode)
    return errorResult("hindsight retain: invalid update_mode");
  const metadata = objectOfStrings(params.metadata);
  if (params.metadata !== undefined && !metadata)
    return errorResult(
      "hindsight retain: metadata must be an object of strings",
    );
  const callerTags = arrayOfStrings(params.tags);
  if (params.tags !== undefined && !callerTags)
    return errorResult("hindsight retain: tags must be an array of strings");
  const tags = buildTags({
    cwd,
    scope,
    source,
    kind,
    defaultTags: config.defaultTags,
    tags: callerTags,
  });
  const body = {
    items: [
      {
        content,
        ...(stringValue(params.context)
          ? { context: stringValue(params.context) }
          : {}),
        ...(stringValue(params.timestamp)
          ? { timestamp: stringValue(params.timestamp) }
          : {}),
        ...(stringValue(params.document_id)
          ? { document_id: stringValue(params.document_id) }
          : {}),
        ...(updateMode ? { update_mode: updateMode } : {}),
        tags,
        metadata: buildMetadata({
          cwd,
          scope,
          source,
          kind,
          metadata: metadata ?? undefined,
        }),
      },
    ],
    async: false,
  };
  const response = await client.retain(body, signal);
  return okResult(
    `hindsight retain: stored ${get(response, "items_count") ?? 1} item(s)`,
    { action: "retain", request: body, response },
  );
}

async function recall(
  client: HindsightClient,
  config: HindsightConfig,
  cwd: string,
  params: Params,
  signal: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const query = stringValue(params.query);
  if (!query) return errorResult("hindsight recall: query is required");
  const scope = enumValue(
    params.scope,
    ["repo", "global"],
    config.defaultScope,
  );
  const callerTags = arrayOfStrings(params.tags);
  if (params.tags !== undefined && !callerTags)
    return errorResult("hindsight recall: tags must be an array of strings");
  const tags = buildQueryTags({
    cwd,
    scope,
    defaultTags: config.defaultTags,
    tags: callerTags,
  });
  const body = {
    query,
    budget: enumValue(
      params.budget,
      ["low", "mid", "high"],
      config.recallBudget,
    ),
    max_tokens: positiveNumber(params.max_tokens) ?? config.recallMaxTokens,
    tags,
    tags_match: enumValue(
      params.tags_match,
      ["any", "any_strict", "all", "all_strict"],
      config.tagsMatch,
    ),
    ...(arrayOfStrings(params.types)
      ? { types: arrayOfStrings(params.types) }
      : {}),
    ...(typeof params.trace === "boolean" ? { trace: params.trace } : {}),
    ...(stringValue(params.query_timestamp)
      ? { query_timestamp: stringValue(params.query_timestamp) }
      : {}),
    include: includeObject({
      entities: params.include_entities,
      chunks: params.include_chunks,
      source_facts: params.include_source_facts,
    }),
  };
  const response = await client.recall(body, signal);
  const bounded = boundResponse(response);
  return okResult(`hindsight recall:\n${bounded.text}`, {
    action: "recall",
    request: body,
    response: bounded.value,
    truncated: bounded.truncated,
  });
}

async function reflect(
  client: HindsightClient,
  config: HindsightConfig,
  cwd: string,
  params: Params,
  signal: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const query = stringValue(params.query);
  if (!query) return errorResult("hindsight reflect: query is required");
  const scope = enumValue(
    params.scope,
    ["repo", "global"],
    config.defaultScope,
  );
  const callerTags = arrayOfStrings(params.tags);
  if (params.tags !== undefined && !callerTags)
    return errorResult("hindsight reflect: tags must be an array of strings");
  const tags = buildQueryTags({
    cwd,
    scope,
    defaultTags: config.defaultTags,
    tags: callerTags,
  });
  const body = {
    query,
    budget: enumValue(
      params.budget,
      ["low", "mid", "high"],
      config.reflectBudget,
    ),
    ...(positiveNumber(params.max_tokens)
      ? { max_tokens: positiveNumber(params.max_tokens) }
      : {}),
    tags,
    tags_match: enumValue(
      params.tags_match,
      ["any", "any_strict", "all", "all_strict"],
      config.tagsMatch,
    ),
    ...(arrayOfStrings(params.fact_types)
      ? { fact_types: arrayOfStrings(params.fact_types) }
      : {}),
    ...(typeof params.exclude_mental_models === "boolean"
      ? { exclude_mental_models: params.exclude_mental_models }
      : {}),
    include: includeObject({
      facts: params.include_facts,
      tool_calls: params.include_tool_calls,
    }),
  };
  const response = await client.reflect(body, signal);
  const bounded = boundResponse(response);
  return okResult(`hindsight reflect:\n${bounded.text}`, {
    action: "reflect",
    request: body,
    response: bounded.value,
    truncated: bounded.truncated,
  });
}

function includeObject(
  values: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const enabled = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value === true)
      .map(([key]) => [key, {}]),
  );
  return Object.keys(enabled).length > 0 ? enabled : undefined;
}

function boundResponse(value: unknown): {
  value: unknown;
  text: string;
  truncated: boolean;
} {
  let truncated = false;
  const bounded = bound(value);
  let text = JSON.stringify(bounded, null, 2);
  if (text.length > MAX_TOTAL) {
    text = `${text.slice(0, MAX_TOTAL)}\n...[truncated]`;
    truncated = true;
  }
  return { value: bounded, text, truncated };

  function bound(item: unknown): unknown {
    if (typeof item === "string") {
      if (item.length > MAX_FIELD) {
        truncated = true;
        return `${item.slice(0, MAX_FIELD)}...[truncated]`;
      }
      return item;
    }
    if (Array.isArray(item)) {
      if (item.length > MAX_RESULTS) truncated = true;
      return item.slice(0, MAX_RESULTS).map(bound);
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).map(([key, val]) => [key, bound(val)]),
      );
    }
    return item;
  }
}

function okResult(
  text: string,
  details: Record<string, unknown>,
): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function errorResult(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: { error: true } };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function arrayOfStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function objectOfStrings(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return Object.values(value).every((item) => typeof item === "string")
    ? (value as Record<string, string>)
    : undefined;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function optionalEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function get(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
