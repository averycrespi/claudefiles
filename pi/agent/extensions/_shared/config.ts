import { readFile } from "node:fs/promises";
import { join } from "node:path";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readExtensionSettings(
  settings: unknown,
  extensionName: string,
): PlainObject {
  if (!isPlainObject(settings)) return {};
  const value = settings[`extension:${extensionName}`];
  return isPlainObject(value) ? { ...value } : {};
}

export function mergeExtensionConfig<T extends PlainObject>(options: {
  defaults: T;
  globalSettings?: PlainObject;
  projectSettings?: PlainObject;
  envSettings?: PlainObject;
}): T {
  return {
    ...options.defaults,
    ...(options.globalSettings ?? {}),
    ...(options.projectSettings ?? {}),
    ...(options.envSettings ?? {}),
  } as T;
}

export async function readJsonFileObject(path: string): Promise<PlainObject> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return isPlainObject(value) ? value : {};
  } catch {
    return {};
  }
}

export async function readPiSettingsFiles(options: {
  agentDir: string;
  cwd: string;
}): Promise<{ globalSettings: PlainObject; projectSettings: PlainObject }> {
  const [globalSettings, projectSettings] = await Promise.all([
    readJsonFileObject(join(options.agentDir, "settings.json")),
    readJsonFileObject(join(options.cwd, ".pi", "settings.json")),
  ]);
  return { globalSettings, projectSettings };
}

export function parseBooleanEnv(
  value: string | undefined,
  name?: string,
  warnings: string[] = [],
): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  if (name) warnings.push(`Ignoring invalid boolean env ${name}=${value}`);
  return undefined;
}
