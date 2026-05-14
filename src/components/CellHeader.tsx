import { useCells } from "../state/cells";
import type { CellStatus } from "../types";

type Props = {
  cellId: string;
  status: CellStatus;
  command: string | null;
  cwd: string | null;
  fontSize: number;
  canRemove: boolean;
  onStop: () => void;
  onRestart: () => void;
  onZoom: () => void;
  onToggleTasks: () => void;
  onRemove: () => void;
};

const STATUS_DOT: Record<CellStatus, string> = {
  idle: "bg-neutral-600",
  spawning: "bg-yellow-500 animate-pulse",
  running: "bg-green-500",
  stopping: "bg-amber-500 animate-pulse",
  exited: "bg-red-500",
};

function shortPath(p: string | null): string {
  if (!p) return "";
  const parts = p.split(/[\\/]/);
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}

export function CellHeader({
  cellId,
  status,
  command,
  cwd,
  fontSize,
  canRemove,
  onStop,
  onRestart,
  onZoom,
  onToggleTasks,
  onRemove,
}: Props) {
  const beginDrag = useCells((s) => s.beginDrag);
  const endDrag = useCells((s) => s.endDrag);

  const isLive = status === "running" || status === "stopping";
  const canRestart =
    (status === "exited" || status === "idle" || isLive) && !!command;

  return (
    <div className="h-7 shrink-0 flex items-center gap-2 px-2 bg-neutral-900 border-b border-neutral-800 text-xs">
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", cellId);
          e.dataTransfer.effectAllowed = "move";
          beginDrag(cellId);
        }}
        onDragEnd={() => endDrag()}
        className="px-1 -ml-1 text-neutral-600 hover:text-green-400 cursor-grab active:cursor-grabbing select-none"
        title="Drag to swap with another cell"
      >
        ⠿
      </button>
      <span
        className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`}
        title={status}
      />
      <span className="text-neutral-400 font-semibold">{cellId}</span>
      {command && (
        <>
          <span className="text-neutral-700">·</span>
          <span
            className="text-neutral-300 font-mono truncate max-w-[120px]"
            title={command}
          >
            {command}
          </span>
        </>
      )}
      {cwd && (
        <>
          <span className="text-neutral-700">·</span>
          <span className="text-neutral-500 font-mono truncate" title={cwd}>
            {shortPath(cwd)}
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onZoom}
          className="px-1.5 py-0.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded"
          title="Cycle font size"
        >
          {fontSize}px
        </button>
        <button
          onClick={onToggleTasks}
          className="px-1.5 py-0.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded"
          title="Toggle tasks sidebar"
        >
          ☰
        </button>
        {status === "running" && (
          <button
            onClick={onStop}
            className="px-1.5 py-0.5 text-red-400 hover:text-red-200 hover:bg-neutral-800 rounded"
            title="Stop (SIGINT, then SIGKILL after 2s)"
          >
            stop
          </button>
        )}
        {status === "stopping" && (
          <span
            className="px-1.5 py-0.5 text-amber-400 font-mono"
            title="Sending SIGINT — process will be force-killed after 2s"
          >
            stopping…
          </span>
        )}
        {canRestart && (
          <button
            onClick={onRestart}
            className="px-1.5 py-0.5 text-green-400 hover:text-green-200 hover:bg-neutral-800 rounded"
            title="Restart with same config"
          >
            restart
          </button>
        )}
        {canRemove && (
          <button
            onClick={onRemove}
            className="px-1.5 py-0.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded"
            title="Remove cell (stops PTY if running)"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
