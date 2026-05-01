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

export function applyExactTextEdits(
  originalContent: string,
  edits: ExactTextEdit[],
):
  | {
      ok: true;
      content: string;
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
  return { ok: true, content };
}

function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}
