import { useEffect, useRef } from "react";
import { useCells, nextFontSize } from "../state/cells";
import { isLive } from "../state/cellMachine";
import type { CellConfig } from "../types";
import { CellHeader } from "./CellHeader";
import { LaunchForm } from "./LaunchForm";
import { SearchBar } from "./SearchBar";
import { TaskSidebar } from "./TaskSidebar";
import { Terminal } from "./Terminal";
import { ptyKill, ptySpawn } from "../ipc/pty";

type Props = { cellId: string };

function activityBorderClass(activity: string): string {
  switch (activity) {
    case "error":
      return "border-2 border-red-500";
    case "active":
      return "border-2 border-orange-500";
    case "question":
      return "border-2 border-green-500";
    case "done":
      return "border-2 border-green-700";
    default:
      return "border-2 border-neutral-800";
  }
}

export function Cell({ cellId }: Props) {
  const cell = useCells((s) => s.cells[cellId]);
  const visibleCount = useCells((s) => s.visibleIds.length);
  const focusedCellId = useCells((s) => s.focusedCellId);
  const searchOpen = useCells((s) => s.searchOpen[cellId] === true);
  const dispatchCell = useCells((s) => s.dispatchCell);
  const setFontSize = useCells((s) => s.setFontSize);
  const toggleTaskSidebar = useCells((s) => s.toggleTaskSidebar);
  const setFocused = useCells((s) => s.setFocused);
  const removeCell = useCells((s) => s.removeCell);
  const draggedCellId = useCells((s) => s.draggedCellId);
  const draggedOverCellId = useCells((s) => s.draggedOverCellId);
  const hoverDrag = useCells((s) => s.hoverDrag);
  const endDrag = useCells((s) => s.endDrag);
  const swapCells = useCells((s) => s.swapCells);

  const proc = cell.process;
  // Track in-flight spawn per status transition to avoid double-spawn under
  // React strict-mode + repeated re-renders.
  const spawningRef = useRef(false);

  useEffect(() => {
    if (proc.status !== "spawning") {
      spawningRef.current = false;
      return;
    }
    if (spawningRef.current) return;
    spawningRef.current = true;
    const cfg = proc.config;
    ptySpawn(cellId, cfg.cwd, cfg.command, cfg.args).then(
      () => {
        spawningRef.current = false;
        dispatchCell(cellId, { type: "SPAWN_SUCCEEDED" });
      },
      (err) => {
        spawningRef.current = false;
        dispatchCell(cellId, { type: "SPAWN_FAILED", error: String(err) });
      },
    );
  }, [proc, cellId, dispatchCell]);

  const onLaunch = (cfg: CellConfig) =>
    dispatchCell(cellId, { type: "LAUNCH", config: cfg });

  const onStop = () => {
    ptyKill(cellId, "SIGINT").catch((e) => console.error("ptyKill:", e));
    dispatchCell(cellId, { type: "REQUEST_STOP" });
  };

  const onRestart = () => {
    if (!proc.config) return;
    if (isLive(proc)) {
      ptyKill(cellId, "SIGKILL").catch(() => {});
    }
    dispatchCell(cellId, { type: "LAUNCH", config: proc.config });
  };

  const onZoom = () => setFontSize(cellId, nextFontSize(cell.fontSize));

  const onRemove = () => {
    if (isLive(proc)) {
      ptyKill(cellId, "SIGKILL").catch(() => {});
    }
    removeCell(cellId);
  };

  const onTerminalExit = (code: number | null) =>
    dispatchCell(cellId, { type: "PROCESS_EXITED", exitCode: code });

  const onEditConfig = () => dispatchCell(cellId, { type: "RESET" });

  const isFocused = focusedCellId === cellId;
  const isDropTarget =
    draggedCellId !== null &&
    draggedCellId !== cellId &&
    draggedOverCellId === cellId;
  const isDragSource = draggedCellId === cellId;
  const border = isDropTarget
    ? "border-2 border-dashed border-sky-400"
    : activityBorderClass(cell.activity);

  return (
    <div
      className={`relative h-full w-full flex flex-col bg-neutral-900 overflow-hidden ${border} ${
        isDragSource ? "opacity-60" : ""
      }`}
      onMouseDown={() => setFocused(cellId)}
      onDragOver={(e) => {
        if (draggedCellId && draggedCellId !== cellId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (draggedOverCellId !== cellId) hoverDrag(cellId);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (draggedOverCellId === cellId) hoverDrag(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const src = e.dataTransfer.getData("text/plain") || draggedCellId;
        if (src && src !== cellId) swapCells(src, cellId);
        endDrag();
      }}
    >
      <CellHeader
        cellId={cellId}
        status={proc.status}
        command={proc.config?.command ?? null}
        cwd={proc.config?.cwd ?? null}
        fontSize={cell.fontSize}
        canRemove={visibleCount > 1}
        onStop={onStop}
        onRestart={onRestart}
        onZoom={onZoom}
        onToggleTasks={() => toggleTaskSidebar(cellId)}
        onRemove={onRemove}
      />
      <div className="flex-1 flex min-h-0">
        {proc.status === "idle" && (
          <LaunchForm
            cellId={cellId}
            lastConfig={proc.config}
            error={null}
            onLaunch={onLaunch}
          />
        )}
        {proc.status === "spawning" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-neutral-400 text-sm">
            <div className="text-neutral-300 font-mono truncate max-w-full">
              ▶ {proc.config.command} {proc.config.args.join(" ")}
            </div>
            <div className="text-neutral-500 text-xs">starting…</div>
          </div>
        )}
        {(proc.status === "running" || proc.status === "stopping") && (
          <>
            <div className="flex-1 min-w-0 min-h-0 relative">
              <Terminal
                cellId={cellId}
                fontSize={cell.fontSize}
                onExit={onTerminalExit}
              />
              {proc.status === "stopping" && (
                <div className="absolute top-1 right-2 z-10 text-[10px] font-mono text-amber-400 bg-black/40 px-1.5 py-0.5 rounded">
                  stopping…
                </div>
              )}
              {searchOpen && <SearchBar cellId={cellId} />}
            </div>
            <TaskSidebar
              filePath={proc.config.tasksFile ?? null}
              cwd={proc.config.cwd ?? null}
              collapsed={cell.taskSidebarCollapsed}
              onToggleCollapse={() => toggleTaskSidebar(cellId)}
            />
          </>
        )}
        {proc.status === "exited" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="text-neutral-300 text-sm">
              {proc.error
                ? `Failed to launch: ${proc.error}`
                : `Process exited (code: ${proc.exitCode ?? "?"})`}
            </div>
            {proc.config && (
              <button
                onClick={onRestart}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-sm text-neutral-100"
              >
                Restart
              </button>
            )}
            <button
              onClick={onEditConfig}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300"
            >
              Edit config
            </button>
          </div>
        )}
      </div>
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 border-2 border-blue-500"
        />
      )}
    </div>
  );
}
