import type { Widget } from "../../_workflow-core/lib/widget.ts";
import {
  renderClock,
  renderStageBreadcrumb,
  renderSubagents,
} from "../../_workflow-core/render.ts";

const STAGES = ["plan", "implement", "verify"] as const;
type Stage = (typeof STAGES)[number];

export function setupAutopilotWidget(widget: Widget): {
  setStage(s: Stage | null): void;
  dispose(): void;
} {
  let stage: Stage | null = null;

  widget.setTitle(
    () =>
      `autopilot · ${renderStageBreadcrumb({ stages: STAGES, active: stage, theme: widget.theme })} · ${renderClock(widget.elapsedMs())}`,
  );
  widget.setBody(() => [
    ...renderSubagents(widget.subagents, { theme: widget.theme }),
  ]);
  widget.setFooter("type /autopilot-cancel to stop");

  return {
    setStage(s: Stage | null) {
      stage = s;
      widget.invalidate();
    },
    dispose() {},
  };
}
