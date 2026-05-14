import { useCallback, useEffect, useRef, useState } from "react";
import { loadTasks, toggleTask } from "../ipc/tasks";
import { openExternal } from "../ipc/external";
import type { ExternalApp, TaskLine } from "../types";

type Props = {
  filePath: string | null;
  cwd: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

const POLL_MS = 2000;

function basename(path: string): string {
  const ix = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return ix >= 0 ? path.slice(ix + 1) : path;
}

export function TaskSidebar({ filePath, cwd, collapsed, onToggleCollapse }: Props) {
  const [tasks, setTasks] = useState<TaskLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const writingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!filePath) {
      setTasks([]);
      return;
    }
    if (writingRef.current) return;
    try {
      const next = await loadTasks(filePath);
      setTasks(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [filePath]);

  useEffect(() => {
    void reload();
    if (collapsed || !filePath) return;
    const t = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(t);
  }, [reload, collapsed, filePath]);

  const handleToggle = useCallback(
    async (task: TaskLine) => {
      if (!filePath) return;
      const next = !task.checked;
      setTasks((prev) =>
        prev.map((t) => (t.lineNumber === task.lineNumber ? { ...t, checked: next } : t)),
      );
      writingRef.current = true;
      try {
        await toggleTask(filePath, task.lineNumber, next);
      } catch (e) {
        console.error("toggleTask failed:", e);
        setTasks((prev) =>
          prev.map((t) => (t.lineNumber === task.lineNumber ? { ...t, checked: !next } : t)),
        );
        setError(String(e));
      } finally {
        writingRef.current = false;
      }
    },
    [filePath],
  );

  const handleOpen = useCallback(
    async (app: ExternalApp) => {
      if (!cwd) {
        setOpenError("No working directory set");
        return;
      }
      setOpenError(null);
      try {
        await openExternal(cwd, app);
      } catch (e) {
        setOpenError(String(e));
      }
    },
    [cwd],
  );

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="w-6 shrink-0 bg-neutral-900 border-l border-neutral-800 hover:bg-neutral-800 flex items-start justify-center pt-2 text-neutral-500 text-[10px]"
        title="Expand tasks"
        style={{ writingMode: "vertical-rl" }}
      >
        Tasks
      </button>
    );
  }

  return (
    <div className="w-60 shrink-0 bg-neutral-900 border-l border-neutral-800 flex flex-col text-sm">
      <div className="h-7 shrink-0 flex items-center justify-between px-2 border-b border-neutral-800 text-xs text-neutral-400">
        <span className="truncate" title={filePath ?? ""}>
          {filePath ? basename(filePath) : "Tasks"}
        </span>
        <button
          onClick={onToggleCollapse}
          className="text-neutral-500 hover:text-neutral-200 px-1"
          title="Collapse"
        >
          ›
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {!filePath && (
          <div className="px-3 py-2 text-neutral-500 text-xs">
            No tasks file selected. Pick one in the launch form.
          </div>
        )}
        {filePath && tasks.length === 0 && !error && (
          <div className="px-3 py-2 text-neutral-500 text-xs">
            No tasks found in this file.
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-red-400 text-xs">{error}</div>
        )}
        {tasks.map((task) => (
          <label
            key={task.lineNumber}
            className="flex items-start gap-2 px-2 py-1 hover:bg-neutral-800 cursor-pointer"
            style={{ paddingLeft: 8 + task.indent.length * 4 }}
          >
            <input
              type="checkbox"
              checked={task.checked}
              onChange={() => void handleToggle(task)}
              className="mt-1 accent-green-500"
            />
            <span
              className={
                task.checked
                  ? "line-through text-neutral-500 break-words"
                  : "text-neutral-200 break-words"
              }
            >
              {task.text}
            </span>
          </label>
        ))}
      </div>
      <div className="shrink-0 border-t border-neutral-800 p-1.5 flex flex-col gap-1">
        {openError && (
          <div className="text-red-400 text-[10px] px-1">{openError}</div>
        )}
        <div className="flex gap-1">
          <button
            onClick={() => void handleOpen("zed")}
            disabled={!cwd}
            className="flex-1 px-2 py-1 text-[11px] bg-neutral-900 hover:bg-green-900/40 border border-neutral-700 hover:border-green-700 disabled:border-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed rounded text-neutral-300"
            title="open -a Zed <cwd>"
          >
            ▸ Zed
          </button>
          <button
            onClick={() => void handleOpen("obsidian")}
            disabled={!cwd}
            className="flex-1 px-2 py-1 text-[11px] bg-neutral-900 hover:bg-green-900/40 border border-neutral-700 hover:border-green-700 disabled:border-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed rounded text-neutral-300"
            title="open -a Obsidian <cwd>"
          >
            ▸ Obsidian
          </button>
        </div>
      </div>
    </div>
  );
}
