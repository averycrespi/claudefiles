import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  mergeExtensionConfig,
  readExtensionSettings,
  readPiSettingsFiles,
} from "../_shared/config.ts";

export type HindsightScope = "repo" | "global";
export type HindsightSource = "manual" | "external" | "agent";
export type HindsightKind = "semantic" | "episodic" | "procedural";
export type HindsightBudget = "low" | "mid" | "high";
export type HindsightTagsMatch = "any" | "any_strict" | "all" | "all_strict";

export type HindsightConfig = {
  apiUrl: string;
  apiKey?: string;
  bankId: string;
  defaultScope: HindsightScope;
  defaultTags: string[];
  recallMaxTokens: number;
  reflectMaxTokens: number;
  recallBudget: HindsightBudget;
  reflectBudget: HindsightBudget;
  tagsMatch: HindsightTagsMatch;
};

type RawHindsightConfig = Omit<
  HindsightConfig,
  | "defaultScope"
  | "defaultTags"
  | "recallBudget"
  | "reflectBudget"
  | "tagsMatch"
> & {
  defaultScope: unknown;
  defaultTags: unknown;
  recallBudget: unknown;
  reflectBudget: unknown;
  tagsMatch: unknown;
};

export const DEFAULT_HINDSIGHT_CONFIG: HindsightConfig = {
  apiUrl: "http://localhost:8888",
  apiKey: undefined,
  bankId: "default",
  defaultScope: "repo",
  defaultTags: [],
  recallMaxTokens: 1200,
  reflectMaxTokens: 1200,
  recallBudget: "mid",
  reflectBudget: "low",
  tagsMatch: "any_strict",
};

const SCOPES = new Set<HindsightScope>(["repo", "global"]);
const BUDGETS = new Set<HindsightBudget>(["low", "mid", "high"]);
const TAGS_MATCH = new Set<HindsightTagsMatch>([
  "any",
  "any_strict",
  "all",
  "all_strict",
]);

export async function loadHindsightConfig(
  cwd: string,
): Promise<HindsightConfig> {
  const { globalSettings, projectSettings } = await readPiSettingsFiles({
    agentDir: getAgentDir(),
    cwd,
  });
  const merged = mergeExtensionConfig({
    defaults: DEFAULT_HINDSIGHT_CONFIG,
    globalSettings: readExtensionSettings(globalSettings, "hindsight"),
    projectSettings: readExtensionSettings(projectSettings, "hindsight"),
    envSettings: readEnvSettings(),
  }) as RawHindsightConfig;
  return normalizeConfig(merged);
}

export function readEnvSettings(): Partial<HindsightConfig> {
  const settings: Partial<HindsightConfig> = {};
  setString(settings, "apiUrl", process.env.HINDSIGHT_API_URL);
  setString(settings, "apiKey", process.env.HINDSIGHT_API_KEY);
  setString(settings, "bankId", process.env.HINDSIGHT_BANK_ID);
  setString(settings, "defaultScope", process.env.HINDSIGHT_DEFAULT_SCOPE);
  if (process.env.HINDSIGHT_DEFAULT_TAGS !== undefined) {
    settings.defaultTags = process.env.HINDSIGHT_DEFAULT_TAGS.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  setNumber(
    settings,
    "recallMaxTokens",
    process.env.HINDSIGHT_RECALL_MAX_TOKENS,
  );
  setNumber(
    settings,
    "reflectMaxTokens",
    process.env.HINDSIGHT_REFLECT_MAX_TOKENS,
  );
  setString(settings, "recallBudget", process.env.HINDSIGHT_RECALL_BUDGET);
  setString(settings, "reflectBudget", process.env.HINDSIGHT_REFLECT_BUDGET);
  setString(settings, "tagsMatch", process.env.HINDSIGHT_TAGS_MATCH);
  return settings;
}

export function normalizeConfig(
  raw: Partial<RawHindsightConfig>,
): HindsightConfig {
  return {
    apiUrl: normalizeApiUrl(raw.apiUrl) ?? DEFAULT_HINDSIGHT_CONFIG.apiUrl,
    apiKey: normalizeRequiredString(raw.apiKey),
    bankId:
      normalizeRequiredString(raw.bankId) ?? DEFAULT_HINDSIGHT_CONFIG.bankId,
    defaultScope: enumOrDefault(
      raw.defaultScope,
      SCOPES,
      DEFAULT_HINDSIGHT_CONFIG.defaultScope,
    ),
    defaultTags: normalizeStringArray(raw.defaultTags),
    recallMaxTokens: positiveIntegerOrDefault(
      raw.recallMaxTokens,
      DEFAULT_HINDSIGHT_CONFIG.recallMaxTokens,
    ),
    reflectMaxTokens: positiveIntegerOrDefault(
      raw.reflectMaxTokens,
      DEFAULT_HINDSIGHT_CONFIG.reflectMaxTokens,
    ),
    recallBudget: enumOrDefault(
      raw.recallBudget,
      BUDGETS,
      DEFAULT_HINDSIGHT_CONFIG.recallBudget,
    ),
    reflectBudget: enumOrDefault(
      raw.reflectBudget,
      BUDGETS,
      DEFAULT_HINDSIGHT_CONFIG.reflectBudget,
    ),
    tagsMatch: enumOrDefault(
      raw.tagsMatch,
      TAGS_MATCH,
      DEFAULT_HINDSIGHT_CONFIG.tagsMatch,
    ),
  };
}

export function validateRequiredConfig(config: HindsightConfig): string[] {
  const errors: string[] = [];
  if (!config.apiKey) errors.push("Hindsight apiKey is not configured");
  return errors;
}

function setString<T extends Record<string, unknown>, K extends keyof T>(
  settings: T,
  key: K,
  value: string | undefined,
): void {
  if (value !== undefined) settings[key] = value.trim() as T[K];
}

function setNumber<T extends Record<string, unknown>, K extends keyof T>(
  settings: T,
  key: K,
  value: string | undefined,
): void {
  if (value !== undefined && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) settings[key] = number as T[K];
  }
}

function normalizeApiUrl(value: unknown): string | undefined {
  const text = normalizeRequiredString(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function normalizeRequiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function enumOrDefault<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  return typeof value === "string" && allowed.has(value as T)
    ? (value as T)
    : fallback;
}

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}
