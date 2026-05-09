import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  mergeExtensionConfig,
  parseBooleanEnv,
  readExtensionSettings,
  readPiSettingsFiles,
} from "../_shared/config.ts";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type SpecWorkflowConfig = {
  enabled: boolean;
  showWidget: boolean;
  autoChallenge: boolean;
  maxFixRounds: number;
  autoCommitTasks: boolean;
  autoCompactOnPhaseChange: boolean;
  autoCompactMinTokens: number;
  planThinkingLevel: ThinkingLevel;
  executeThinkingLevel: ThinkingLevel;
  verifyThinkingLevel: ThinkingLevel;
};

type PlainObject = Record<string, unknown>;

export const DEFAULT_SPEC_WORKFLOW_CONFIG: SpecWorkflowConfig = {
  enabled: true,
  showWidget: true,
  autoChallenge: true,
  maxFixRounds: 2,
  autoCommitTasks: true,
  autoCompactOnPhaseChange: true,
  autoCompactMinTokens: 50_000,
  planThinkingLevel: "medium",
  executeThinkingLevel: "low",
  verifyThinkingLevel: "high",
};

const THINKING_LEVELS = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function envBoolean(
  env: NodeJS.ProcessEnv,
  key: string,
  warnings: string[],
): boolean | undefined {
  return parseBooleanEnv(env[key], key, warnings);
}

function readEnvSettings(
  env: NodeJS.ProcessEnv,
  warnings: string[],
): PlainObject {
  return {
    ...(envBoolean(env, "SPEC_WORKFLOW_ENABLED", warnings) !== undefined
      ? { enabled: envBoolean(env, "SPEC_WORKFLOW_ENABLED", warnings) }
      : {}),
    ...(envBoolean(env, "SPEC_WORKFLOW_SHOW_WIDGET", warnings) !== undefined
      ? { showWidget: envBoolean(env, "SPEC_WORKFLOW_SHOW_WIDGET", warnings) }
      : {}),
    ...(envBoolean(env, "SPEC_WORKFLOW_AUTO_CHALLENGE", warnings) !== undefined
      ? {
          autoChallenge: envBoolean(
            env,
            "SPEC_WORKFLOW_AUTO_CHALLENGE",
            warnings,
          ),
        }
      : {}),
    ...(env.SPEC_WORKFLOW_MAX_FIX_ROUNDS !== undefined
      ? { maxFixRounds: env.SPEC_WORKFLOW_MAX_FIX_ROUNDS }
      : {}),
    ...(envBoolean(env, "SPEC_WORKFLOW_AUTO_COMMIT_TASKS", warnings) !==
    undefined
      ? {
          autoCommitTasks: envBoolean(
            env,
            "SPEC_WORKFLOW_AUTO_COMMIT_TASKS",
            warnings,
          ),
        }
      : {}),
    ...(envBoolean(
      env,
      "SPEC_WORKFLOW_AUTO_COMPACT_ON_PHASE_CHANGE",
      warnings,
    ) !== undefined
      ? {
          autoCompactOnPhaseChange: envBoolean(
            env,
            "SPEC_WORKFLOW_AUTO_COMPACT_ON_PHASE_CHANGE",
            warnings,
          ),
        }
      : {}),
    ...(env.SPEC_WORKFLOW_AUTO_COMPACT_MIN_TOKENS !== undefined
      ? { autoCompactMinTokens: env.SPEC_WORKFLOW_AUTO_COMPACT_MIN_TOKENS }
      : {}),
    ...(env.SPEC_WORKFLOW_PLAN_THINKING_LEVEL !== undefined
      ? { planThinkingLevel: env.SPEC_WORKFLOW_PLAN_THINKING_LEVEL }
      : {}),
    ...(env.SPEC_WORKFLOW_EXECUTE_THINKING_LEVEL !== undefined
      ? { executeThinkingLevel: env.SPEC_WORKFLOW_EXECUTE_THINKING_LEVEL }
      : {}),
    ...(env.SPEC_WORKFLOW_VERIFY_THINKING_LEVEL !== undefined
      ? { verifyThinkingLevel: env.SPEC_WORKFLOW_VERIFY_THINKING_LEVEL }
      : {}),
  };
}

function parseNonNegativeInteger(
  value: unknown,
  field: string,
  fallback: number,
  warnings: string[],
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : undefined;
  if (parsed !== undefined && Number.isInteger(parsed) && parsed >= 0)
    return parsed;
  if (value !== undefined)
    warnings.push(`Ignoring invalid ${field}: ${String(value)}`);
  return fallback;
}

function parseThinkingLevel(
  value: unknown,
  field: string,
  fallback: ThinkingLevel,
  warnings: string[],
): ThinkingLevel {
  if (typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel))
    return value as ThinkingLevel;
  if (value !== undefined) warnings.push(`Ignoring invalid ${field}: ${value}`);
  return fallback;
}

function parseBooleanField(
  value: unknown,
  field: string,
  fallback: boolean,
  warnings: string[],
): boolean {
  if (typeof value === "boolean") return value;
  if (value !== undefined) warnings.push(`Ignoring invalid ${field}: ${value}`);
  return fallback;
}

export function parseSpecWorkflowConfig(options: {
  settings?: PlainObject;
  env?: NodeJS.ProcessEnv;
  warnings?: string[];
}): SpecWorkflowConfig {
  const warnings = options.warnings ?? [];
  const merged = mergeExtensionConfig({
    defaults: DEFAULT_SPEC_WORKFLOW_CONFIG,
    projectSettings: options.settings,
    envSettings: readEnvSettings(options.env ?? process.env, warnings),
  });

  return {
    enabled: parseBooleanField(
      merged.enabled,
      "enabled",
      DEFAULT_SPEC_WORKFLOW_CONFIG.enabled,
      warnings,
    ),
    showWidget: parseBooleanField(
      merged.showWidget,
      "showWidget",
      DEFAULT_SPEC_WORKFLOW_CONFIG.showWidget,
      warnings,
    ),
    autoChallenge: parseBooleanField(
      merged.autoChallenge,
      "autoChallenge",
      DEFAULT_SPEC_WORKFLOW_CONFIG.autoChallenge,
      warnings,
    ),
    maxFixRounds: parseNonNegativeInteger(
      merged.maxFixRounds,
      "maxFixRounds",
      DEFAULT_SPEC_WORKFLOW_CONFIG.maxFixRounds,
      warnings,
    ),
    autoCommitTasks: parseBooleanField(
      merged.autoCommitTasks,
      "autoCommitTasks",
      DEFAULT_SPEC_WORKFLOW_CONFIG.autoCommitTasks,
      warnings,
    ),
    autoCompactOnPhaseChange: parseBooleanField(
      merged.autoCompactOnPhaseChange,
      "autoCompactOnPhaseChange",
      DEFAULT_SPEC_WORKFLOW_CONFIG.autoCompactOnPhaseChange,
      warnings,
    ),
    autoCompactMinTokens: parseNonNegativeInteger(
      merged.autoCompactMinTokens,
      "autoCompactMinTokens",
      DEFAULT_SPEC_WORKFLOW_CONFIG.autoCompactMinTokens,
      warnings,
    ),
    planThinkingLevel: parseThinkingLevel(
      merged.planThinkingLevel,
      "planThinkingLevel",
      DEFAULT_SPEC_WORKFLOW_CONFIG.planThinkingLevel,
      warnings,
    ),
    executeThinkingLevel: parseThinkingLevel(
      merged.executeThinkingLevel,
      "executeThinkingLevel",
      DEFAULT_SPEC_WORKFLOW_CONFIG.executeThinkingLevel,
      warnings,
    ),
    verifyThinkingLevel: parseThinkingLevel(
      merged.verifyThinkingLevel,
      "verifyThinkingLevel",
      DEFAULT_SPEC_WORKFLOW_CONFIG.verifyThinkingLevel,
      warnings,
    ),
  };
}

export async function loadSpecWorkflowConfig(cwd: string): Promise<{
  config: SpecWorkflowConfig;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const { globalSettings, projectSettings } = await readPiSettingsFiles({
    agentDir: getAgentDir(),
    cwd,
  });
  const settings = mergeExtensionConfig({
    defaults: {},
    globalSettings: readExtensionSettings(globalSettings, "spec-workflow"),
    projectSettings: readExtensionSettings(projectSettings, "spec-workflow"),
  });
  return { config: parseSpecWorkflowConfig({ settings, warnings }), warnings };
}
