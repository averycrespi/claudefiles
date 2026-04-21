import { Type, type Static } from "@sinclair/typebox";

export const IterationReportSchema = Type.Object({
  outcome: Type.Union([
    Type.Literal("in_progress"),
    Type.Literal("complete"),
    Type.Literal("failed"),
  ]),
  summary: Type.String({ minLength: 1 }),
  handoff: Type.String(),
});

export type IterationReport = Static<typeof IterationReportSchema>;
