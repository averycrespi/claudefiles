import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readHandoff(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.handoff === "string"
    ) {
      return parsed.handoff;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeHandoff(
  path: string,
  handoff: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ handoff }, null, 2), "utf8");
}

export async function isBootstrap(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch {
    return true;
  }
}
