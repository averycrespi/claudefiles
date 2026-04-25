import { Value } from "@sinclair/typebox/value";
import type { TSchema, Static } from "@sinclair/typebox";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseJsonReport<S extends TSchema>(
  raw: string,
  schema: S,
): ParseResult<Static<S>> {
  const stripped = stripWrappers(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
  }
  if (!Value.Check(schema, parsed)) {
    const errors = [...Value.Errors(schema, parsed)]
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return { ok: false, error: `Schema validation failed: ${errors}` };
  }
  return { ok: true, data: parsed as Static<S> };
}

function stripWrappers(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fence) return fence[1].trim();
  const match = raw.match(/\{[\s\S]*\}/);
  return (match ? match[0] : raw).trim();
}
