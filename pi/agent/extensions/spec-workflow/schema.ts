import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SpecRuntime } from "./types.ts";

export const SpecRuntimeSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  slug: Type.String(),
  phase: Type.String(),
  status: Type.String(),
  requirements: Type.Array(Type.Any()),
  validations: Type.Array(Type.Any()),
  tasks: Type.Array(Type.Any()),
  docsImpact: Type.String(),
  approval: Type.Optional(Type.Any()),
  challenge: Type.Optional(Type.Any()),
  fixRoundsUsed: Type.Number(),
  knownIssues: Type.Array(Type.String()),
  amendments: Type.Array(Type.String()),
  updatedAt: Type.String(),
});

export function validateSpecRuntime(
  value: unknown,
): { ok: true; runtime: SpecRuntime } | { ok: false; errors: string[] } {
  if (Value.Check(SpecRuntimeSchema, value)) {
    return { ok: true, runtime: value as SpecRuntime };
  }
  return {
    ok: false,
    errors: [...Value.Errors(SpecRuntimeSchema, value)].map(
      (error) => `${error.path || "/"}: ${error.message}`,
    ),
  };
}
