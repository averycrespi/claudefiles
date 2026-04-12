import { Type, type Static } from "@sinclair/typebox";

export const PlanTaskSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
});

export const PlanReportSchema = Type.Object({
  architecture_notes: Type.String({ minLength: 1 }),
  tasks: Type.Array(PlanTaskSchema, { minItems: 1, maxItems: 15 }),
});

export type PlanReport = Static<typeof PlanReportSchema>;

export const ImplementReportSchema = Type.Object({
  outcome: Type.Union([Type.Literal("success"), Type.Literal("failure")]),
  commit: Type.Union([Type.String(), Type.Null()]),
  summary: Type.String({ minLength: 1 }),
});

export type ImplementReport = Static<typeof ImplementReportSchema>;
