import type {
  CompileResult,
  Diagnostic,
  SpecRuntime,
  TaskRuntime,
} from "./types.ts";
import { parseSpecMarkdown, type ParsedTask } from "./parser.ts";

function addDuplicateDiagnostics(
  diagnostics: Diagnostic[],
  values: Array<{ id: string; line?: number }>,
  kind: string,
): void {
  const seen = new Map<string, number | undefined>();
  for (const value of values) {
    if (seen.has(value.id)) {
      diagnostics.push({
        line: value.line,
        message: `Duplicate ${kind} ID: ${value.id}`,
      });
    } else {
      seen.set(value.id, value.line);
    }
  }
}

function detectCycles(tasks: ParsedTask[], diagnostics: Diagnostic[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string, stack: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      diagnostics.push({
        message: `Task dependency cycle: ${[...stack, id].join(" -> ")}`,
      });
      return;
    }
    visiting.add(id);
    const task = byId.get(id);
    for (const dep of task?.depends ?? []) visit(dep, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const task of tasks) visit(task.id, []);
}

function preserveTaskHistory(
  task: ParsedTask,
  existing?: SpecRuntime,
): TaskRuntime {
  const previous = existing?.tasks.find(
    (candidate) => candidate.id === task.id,
  );
  return {
    id: task.id,
    title: task.title,
    line: task.line,
    depends: task.depends,
    owns: task.owns,
    ac: task.ac,
    validates: task.validates,
    status: previous?.status ?? "pending",
    attempts: previous?.attempts ?? 0,
    commits: previous?.commits ?? [],
    commitSkipped: previous?.commitSkipped ?? null,
    amendments: previous?.amendments ?? [],
  };
}

export function compileSpecRuntime(options: {
  slug: string;
  markdown: string;
  existingRuntime?: unknown;
  now?: string;
}): CompileResult {
  const diagnostics: Diagnostic[] = [];
  let existing: SpecRuntime | undefined;
  if (options.existingRuntime && typeof options.existingRuntime === "object") {
    const version = (options.existingRuntime as any).schemaVersion;
    if (version !== undefined && version !== 1) {
      return {
        ok: false,
        diagnostics: [
          { message: `Unsupported runtime schemaVersion: ${version}` },
        ],
      };
    }
    if (version === 1) existing = options.existingRuntime as SpecRuntime;
  }

  const parsed = parseSpecMarkdown(options.markdown);
  diagnostics.push(...parsed.diagnostics);

  const acs = parsed.requirements.flatMap(
    (requirement) => requirement.acceptanceCriteria,
  );
  addDuplicateDiagnostics(diagnostics, parsed.requirements, "requirement");
  addDuplicateDiagnostics(diagnostics, acs, "acceptance criterion");
  addDuplicateDiagnostics(diagnostics, parsed.tasks, "task");
  addDuplicateDiagnostics(
    diagnostics,
    parsed.validations.map((validation) => ({ id: validation.id })),
    "validation",
  );

  if (parsed.requirements.length === 0)
    diagnostics.push({
      section: "requirements",
      message: "At least one requirement is required",
    });
  if (acs.length === 0)
    diagnostics.push({
      section: "requirements",
      message: "At least one acceptance criterion is required",
    });
  if (parsed.tasks.length === 0)
    diagnostics.push({
      section: "tasks",
      message: "At least one task is required",
    });
  if (parsed.validations.length === 0)
    diagnostics.push({
      section: "validations",
      message: "At least one validation is required",
    });
  if (!parsed.docsImpact)
    diagnostics.push({
      section: "documentation impact",
      message: "Documentation impact is required",
    });

  const taskIds = new Set(parsed.tasks.map((task) => task.id));
  const acIds = new Set(acs.map((ac) => ac.id));
  const validationIds = new Set(
    parsed.validations.map((validation) => validation.id),
  );

  for (const task of parsed.tasks) {
    for (const dep of task.depends) {
      if (!taskIds.has(dep))
        diagnostics.push({
          line: task.line,
          message: `${task.id} depends on unknown task ${dep}`,
        });
    }
    for (const ac of task.ac) {
      if (!acIds.has(ac))
        diagnostics.push({
          line: task.line,
          message: `${task.id} references unknown AC ${ac}`,
        });
    }
    for (const validation of task.validates) {
      if (!validationIds.has(validation))
        diagnostics.push({
          line: task.line,
          message: `${task.id} references unknown validation ${validation}`,
        });
    }
    if (task.owns.length === 0)
      diagnostics.push({
        line: task.line,
        message: `${task.id} must declare Owns`,
      });
    if (task.ac.length === 0)
      diagnostics.push({
        line: task.line,
        message: `${task.id} must declare AC`,
      });
    if (task.validates.length === 0)
      diagnostics.push({
        line: task.line,
        message: `${task.id} must declare Validates`,
      });
  }
  detectCycles(parsed.tasks, diagnostics);

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const runtime: SpecRuntime = {
    schemaVersion: 1,
    slug: options.slug,
    phase: existing?.phase ?? "plan",
    status: existing?.status ?? "draft",
    requirements: parsed.requirements,
    validations: parsed.validations,
    tasks: parsed.tasks.map((task) => preserveTaskHistory(task, existing)),
    docsImpact: parsed.docsImpact,
    approval: existing?.approval,
    challenge: existing?.challenge ?? { status: "not_run", findings: [] },
    fixRoundsUsed: existing?.fixRoundsUsed ?? 0,
    knownIssues: existing?.knownIssues ?? [],
    amendments: existing?.amendments ?? [],
    updatedAt: options.now ?? new Date().toISOString(),
  };
  return { ok: true, runtime, diagnostics: [] };
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const location = [
        diagnostic.file,
        diagnostic.section,
        diagnostic.line ? `line ${diagnostic.line}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      return location
        ? `${location}: ${diagnostic.message}`
        : diagnostic.message;
    })
    .join("\n");
}
