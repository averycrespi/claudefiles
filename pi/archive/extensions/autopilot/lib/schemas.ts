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

export const ValidationCategorySchema = Type.Object({
  status: Type.Union([
    Type.Literal("pass"),
    Type.Literal("fail"),
    Type.Literal("skipped"),
  ]),
  command: Type.String(),
  output: Type.String(),
});

export type ValidationCategory = Static<typeof ValidationCategorySchema>;

export const ValidationReportSchema = Type.Object({
  test: ValidationCategorySchema,
  lint: ValidationCategorySchema,
  typecheck: ValidationCategorySchema,
});

export type ValidationReport = Static<typeof ValidationReportSchema>;

export const FixerReportSchema = Type.Object({
  outcome: Type.Union([Type.Literal("success"), Type.Literal("failure")]),
  commit: Type.Union([Type.String(), Type.Null()]),
  fixed: Type.Array(Type.String()),
  unresolved: Type.Array(Type.String()),
});

export type FixerReport = Static<typeof FixerReportSchema>;

export const FindingSchema = Type.Object({
  file: Type.String({ minLength: 1 }),
  line: Type.Integer({ minimum: 1 }),
  severity: Type.Union([
    Type.Literal("blocker"),
    Type.Literal("important"),
    Type.Literal("suggestion"),
  ]),
  confidence: Type.Integer({ minimum: 0, maximum: 100 }),
  description: Type.String({ minLength: 1 }),
});

export type Finding = Static<typeof FindingSchema>;

export const ReviewerReportSchema = Type.Object({
  findings: Type.Array(FindingSchema),
});

export type ReviewerReport = Static<typeof ReviewerReportSchema>;
