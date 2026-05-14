export type CellConfig = {
  cwd: string;
  command: string;
  args: string[];
  tasksFile: string | null;
};

/**
 * Per-cell FSM state. See `state/cellMachine.ts` for the transition table.
 */
export type CellProcess =
  | { status: "idle"; config: CellConfig | null }
  | { status: "spawning"; config: CellConfig }
  | { status: "running"; config: CellConfig }
  | { status: "stopping"; config: CellConfig }
  | {
      status: "exited";
      config: CellConfig;
      exitCode: number | null;
      error: string | null;
    };

export type CellStatus = CellProcess["status"];

export type CellEvent =
  | { type: "LAUNCH"; config: CellConfig }
  | { type: "SPAWN_SUCCEEDED" }
  | { type: "SPAWN_FAILED"; error: string }
  | { type: "PROCESS_EXITED"; exitCode: number | null }
  | { type: "REQUEST_STOP" }
  | { type: "FORCE_KILL" }
  | { type: "RESET" }
  | { type: "REMOVED" };

export type ActivityState = "none" | "active" | "error" | "question" | "done";

export type CellState = {
  id: string;
  process: CellProcess;
  fontSize: number;
  taskSidebarCollapsed: boolean;
  activity: ActivityState;
};
