import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import type { TaskLine } from "../types";

const TASK_RE = /^(\s*)-\s+\[([ xX])\]\s+(.*)$/;

/**
 * Parse a markdown string and return only lines that match a task pattern.
 * Matches lines like: "  - [ ] do thing" / "  - [x] done thing" / "- [X] yo".
 */
export function parseTasks(content: string): TaskLine[] {
  const lines = content.split("\n");
  const tasks: TaskLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineForMatch = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = lineForMatch.match(TASK_RE);
    if (!m) continue;

    const [, indent, mark, text] = m;
    tasks.push({
      lineNumber: i,
      rawLine: lineForMatch,
      checked: mark === "x" || mark === "X",
      text,
      indent,
    });
  }

  return tasks;
}

/**
 * Returns "\r\n" if any CRLF is found, otherwise "\n".
 */
function detectEol(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

export async function toggleTask(
  filePath: string,
  lineNumber: number,
  newChecked: boolean,
): Promise<void> {
  const content = await readTextFile(filePath);
  const eol = detectEol(content);
  const lines = content.split(eol);

  if (lineNumber < 0 || lineNumber >= lines.length) {
    throw new Error(
      `toggleTask: lineNumber ${lineNumber} out of range (file has ${lines.length} lines)`,
    );
  }

  const target = lines[lineNumber];
  const m = target.match(TASK_RE);
  if (!m) {
    throw new Error(
      `toggleTask: line ${lineNumber} is not a task line: ${JSON.stringify(target)}`,
    );
  }

  const replaced = target.replace(
    /\[([ xX])\]/,
    `[${newChecked ? "x" : " "}]`,
  );
  lines[lineNumber] = replaced;

  const next = lines.join(eol);
  await writeTextFile(filePath, next);
}

export async function loadTasks(filePath: string): Promise<TaskLine[]> {
  if (!(await exists(filePath))) return [];
  try {
    const content = await readTextFile(filePath);
    return parseTasks(content);
  } catch {
    // File may have been deleted between the exists() check and readTextFile().
    return [];
  }
}
