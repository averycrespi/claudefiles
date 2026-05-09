import type {
  AcceptanceCriterion,
  Diagnostic,
  Requirement,
  ValidationSpec,
} from "./types.ts";

export type ParsedTask = {
  id: string;
  title: string;
  line: number;
  depends: string[];
  owns: string[];
  ac: string[];
  validates: string[];
};

export type ParsedSpec = {
  requirements: Requirement[];
  validations: ValidationSpec[];
  tasks: ParsedTask[];
  docsImpact: string;
  diagnostics: Diagnostic[];
};

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function splitList(value: string): string[] {
  if (value.trim().toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sectionName(line: string): string | undefined {
  const match = /^##\s+(.+?)\s*$/.exec(line.trim());
  return match?.[1]?.trim().toLowerCase();
}

function getSection(
  lines: string[],
  name: string,
): { start: number; end: number } | undefined {
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (sectionName(lines[index] ?? "") === name.toLowerCase()) {
      start = index;
      break;
    }
  }
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function parseRequirements(
  lines: string[],
  range: { start: number; end: number },
): Requirement[] {
  const requirements: Requirement[] = [];
  let current: Requirement | undefined;
  for (let index = range.start + 1; index < range.end; index += 1) {
    const line = lines[index] ?? "";
    const req = /^###\s+(REQ-[0-9]+)\s*[:-]?\s*(.*)$/.exec(line.trim());
    if (req) {
      current = {
        id: req[1]!,
        text: req[2]?.trim() || req[1]!,
        line: index + 1,
        acceptanceCriteria: [],
      };
      requirements.push(current);
      continue;
    }
    const ac = /^[-*]\s*\[?(AC-[0-9]+)\]?\s*[:-]?\s*(.*)$/.exec(line.trim());
    if (ac && current) {
      current.acceptanceCriteria.push({
        id: ac[1]!,
        text: ac[2]?.trim() || ac[1]!,
        line: index + 1,
      });
    }
  }
  return requirements;
}

function parseValidations(
  lines: string[],
  range: { start: number; end: number },
): ValidationSpec[] {
  const validations: ValidationSpec[] = [];
  for (let index = range.start + 1; index < range.end; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const match = /^[-*]\s*(VAL-[0-9]+)\s*[:-]\s*`([^`]+)`\s*(.*)$/.exec(line);
    if (match) {
      validations.push({
        id: match[1]!,
        command: match[2]!,
        description: match[3]?.trim() || undefined,
      });
    }
  }
  return validations;
}

function parseTasks(
  lines: string[],
  range: { start: number; end: number },
): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  let current: ParsedTask | undefined;
  for (let index = range.start + 1; index < range.end; index += 1) {
    const line = lines[index] ?? "";
    const header = /^###\s+(T[0-9]+)\s*[:-]?\s*(.*)$/.exec(line.trim());
    if (header) {
      current = {
        id: header[1]!,
        title: header[2]?.trim() || header[1]!,
        line: index + 1,
        depends: [],
        owns: [],
        ac: [],
        validates: [],
      };
      tasks.push(current);
      continue;
    }
    if (!current) continue;
    const annotation = /^[-*]?\s*(Depends|Owns|AC|Validates)\s*:\s*(.+)$/i.exec(
      line.trim(),
    );
    if (!annotation) continue;
    const key = annotation[1]!.toLowerCase();
    const values = splitList(annotation[2]!);
    if (key === "depends") current.depends = values;
    if (key === "owns") current.owns = values;
    if (key === "ac") current.ac = values;
    if (key === "validates") current.validates = values;
  }
  return tasks;
}

function parseDocsImpact(
  lines: string[],
  range: { start: number; end: number },
): string {
  return lines
    .slice(range.start + 1, range.end)
    .join("\n")
    .trim();
}

export function parseSpecMarkdown(markdown: string): ParsedSpec {
  const lines = splitLines(markdown);
  const diagnostics: Diagnostic[] = [];
  const required = [
    "requirements",
    "tasks",
    "validations",
    "documentation impact",
  ];
  const ranges = new Map<string, { start: number; end: number }>();
  for (const name of required) {
    const range = getSection(lines, name);
    if (!range)
      diagnostics.push({ section: name, message: `Missing ## ${name}` });
    else ranges.set(name, range);
  }

  const requirementsRange = ranges.get("requirements");
  const tasksRange = ranges.get("tasks");
  const validationsRange = ranges.get("validations");
  const docsRange = ranges.get("documentation impact");

  return {
    requirements: requirementsRange
      ? parseRequirements(lines, requirementsRange)
      : [],
    validations: validationsRange
      ? parseValidations(lines, validationsRange)
      : [],
    tasks: tasksRange ? parseTasks(lines, tasksRange) : [],
    docsImpact: docsRange ? parseDocsImpact(lines, docsRange) : "",
    diagnostics,
  };
}
