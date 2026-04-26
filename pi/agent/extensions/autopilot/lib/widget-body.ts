import type { Widget } from "../../_workflow-core/lib/widget.ts";
import {
  renderClock,
  renderStageBreadcrumb,
  renderSubagents,
} from "../../_workflow-core/render.ts";
import { taskList } from "../../task-list/api.ts";
import { renderTaskWindowLines, type TaskWindowTheme } from "./widget-tasks.ts";

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
    ...renderTaskWindowLines(taskList.all(), widget.theme as TaskWindowTheme),
  ]);
  widget.setFooter("type /autopilot-cancel to stop");

  // Re-render on taskList mutations (_workflow-core only re-evals on tick + subagent events).
  const unsub = taskList.subscribe(() => widget.invalidate());

  return {
    setStage(s: Stage | null) {
      stage = s;
      widget.invalidate();
    },
    dispose: unsub,
  };
}
