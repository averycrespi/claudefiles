import { isAbsolute, relative, resolve, sep } from "node:path";

export type ExactTextEdit = {
  oldText: string;
  newText: string;
};

export function resolvePlanFilePath(
  cwd: string,
  inputPath: string,
):
  | {
      ok: true;
      absolutePath: string;
      displayPath: string;
    }
  | {
      ok: false;
      error: string;
    } {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return { ok: false, error: "path is required" };
  }

  const plansRoot = resolve(cwd, ".plans");
  const absolutePath = resolve(
    trimmed.startsWith(`.plans${sep}`) ||
      trimmed === ".plans" ||
      isAbsolute(trimmed)
      ? cwd
      : plansRoot,
    trimmed,
  );

  if (!absolutePath.endsWith(".md")) {
    return {
      ok: false,
      error: "path must target a markdown file under .plans/",
    };
  }

  if (!isWithin(plansRoot, absolutePath)) {
    return {
      ok: false,
      error: "path must stay within .plans/ at the repo root",
    };
  }

  return {
    ok: true,
    absolutePath,
    displayPath: relative(cwd, absolutePath),
  };
}

export type ExactTextEditDiff = {
  diff: string;
  firstChangedLine?: number;
};

export function applyExactTextEdits(
  originalContent: string,
  edits: ExactTextEdit[],
):
  | {
      ok: true;
      content: string;
      diff: string;
      firstChangedLine?: number;
    }
  | {
      ok: false;
      error: string;
    } {
  const ranges: Array<{ start: number; end: number; newText: string }> = [];

  for (const edit of edits) {
    if (edit.oldText.length === 0) {
      return { ok: false, error: "oldText must not be empty" };
    }
    const start = originalContent.indexOf(edit.oldText);
    if (start === -1) {
      return {
        ok: false,
        error: `oldText must match exactly once: ${JSON.stringify(edit.oldText)}`,
      };
    }
    const nextMatch = originalContent.indexOf(edit.oldText, start + 1);
    if (nextMatch !== -1) {
      return {
        ok: false,
        error: `oldText must match exactly once: ${JSON.stringify(edit.oldText)}`,
      };
    }
    ranges.push({
      start,
      end: start + edit.oldText.length,
      newText: edit.newText,
    });
  }

  ranges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index++) {
    const previous = ranges[index - 1]!;
    const current = ranges[index]!;
    if (current.start < previous.end) {
      return {
        ok: false,
        error: "edits must not overlap in the original file",
      };
    }
  }

  let content = originalContent;
  for (const range of [...ranges].reverse()) {
    content =
      content.slice(0, range.start) + range.newText + content.slice(range.end);
  }
  return { ok: true, content, ...buildLineDiff(originalContent, content) };
}

function buildLineDiff(
  originalContent: string,
  editedContent: string,
): ExactTextEditDiff {
  const originalLines = trimTrailingSplitLine(originalContent.split("\n"));
  const editedLines = trimTrailingSplitLine(editedContent.split("\n"));
  const lcsLengths = buildLcsLengths(originalLines, editedLines);
  const diffLines: string[] = [];
  let firstChangedLine: number | undefined;
  let originalIndex = 0;
  let editedIndex = 0;

  while (
    originalIndex < originalLines.length ||
    editedIndex < editedLines.length
  ) {
    if (
      originalIndex < originalLines.length &&
      editedIndex < editedLines.length &&
      originalLines[originalIndex] === editedLines[editedIndex]
    ) {
      diffLines.push(
        ` ${originalIndex + 1} ${originalLines[originalIndex] ?? ""}`,
      );
      originalIndex += 1;
      editedIndex += 1;
    } else if (
      originalIndex < originalLines.length &&
      (editedIndex === editedLines.length ||
        lcsLengths[originalIndex + 1]![editedIndex]! >=
          lcsLengths[originalIndex]![editedIndex + 1]!)
    ) {
      firstChangedLine ??= originalIndex + 1;
      diffLines.push(
        `-${originalIndex + 1} ${originalLines[originalIndex] ?? ""}`,
      );
      originalIndex += 1;
    } else {
      firstChangedLine ??= originalIndex + 1;
      diffLines.push(`+${editedIndex + 1} ${editedLines[editedIndex] ?? ""}`);
      editedIndex += 1;
    }
  }

  return { diff: diffLines.join("\n"), firstChangedLine };
}

function buildLcsLengths(a: string[], b: string[]): number[][] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  return lengths;
}

function trimTrailingSplitLine(lines: string[]): string[] {
  if (lines.at(-1) === "") return lines.slice(0, -1);
  return lines;
}

function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}
