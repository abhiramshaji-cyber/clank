import type { CellConfig, CellProcess, CellEvent } from "../types";

/**
 * Pure transition function for one cell's lifecycle FSM.
 *
 * States: idle → spawning → running → stopping → exited
 *
 *   idle      ── LAUNCH ──────────────────────────→ spawning
 *   spawning  ── SPAWN_SUCCEEDED ─────────────────→ running
 *   spawning  ── SPAWN_FAILED ────────────────────→ exited (with error)
 *   running   ── PROCESS_EXITED ──────────────────→ exited
 *   running   ── REQUEST_STOP (SIGINT) ───────────→ stopping
 *   running   ── FORCE_KILL  (SIGKILL) ───────────→ exited
 *   running   ── LAUNCH (force-restart) ──────────→ spawning
 *   stopping  ── PROCESS_EXITED ──────────────────→ exited
 *   stopping  ── FORCE_KILL ──────────────────────→ exited
 *   exited    ── LAUNCH ──────────────────────────→ spawning
 *   exited    ── RESET (edit config) ─────────────→ idle
 *   {any}     ── REMOVED (× button) ──────────────→ idle (config kept)
 *
 * Unknown event/state pairs return the input state unchanged, so the FSM is
 * safe to call from React effects that may fire stale events.
 */
export function transitionCell(
  state: CellProcess,
  event: CellEvent,
): CellProcess {
  // REMOVED + FORCE_KILL are universal — handled outside the per-state switch
  // so we don't repeat them everywhere.
  if (event.type === "REMOVED") {
    return { status: "idle", config: stateConfig(state) };
  }
  if (event.type === "FORCE_KILL") {
    if (state.status === "idle" || state.status === "exited") return state;
    return {
      status: "exited",
      config: state.config,
      exitCode: null,
      error: null,
    };
  }

  switch (state.status) {
    case "idle":
      if (event.type === "LAUNCH") {
        return { status: "spawning", config: event.config };
      }
      return state;

    case "spawning":
      if (event.type === "SPAWN_SUCCEEDED") {
        return { status: "running", config: state.config };
      }
      if (event.type === "SPAWN_FAILED") {
        return {
          status: "exited",
          config: state.config,
          exitCode: null,
          error: event.error,
        };
      }
      return state;

    case "running":
      if (event.type === "PROCESS_EXITED") {
        return {
          status: "exited",
          config: state.config,
          exitCode: event.exitCode,
          error: null,
        };
      }
      if (event.type === "REQUEST_STOP") {
        return { status: "stopping", config: state.config };
      }
      if (event.type === "LAUNCH") {
        return { status: "spawning", config: event.config };
      }
      return state;

    case "stopping":
      if (event.type === "PROCESS_EXITED") {
        return {
          status: "exited",
          config: state.config,
          exitCode: event.exitCode,
          error: null,
        };
      }
      return state;

    case "exited":
      if (event.type === "LAUNCH") {
        return { status: "spawning", config: event.config };
      }
      if (event.type === "RESET") {
        return { status: "idle", config: state.config };
      }
      return state;
  }
}

export function initialProcess(config: CellConfig | null): CellProcess {
  return { status: "idle", config };
}

function stateConfig(state: CellProcess): CellConfig | null {
  return state.config;
}

/** True if the cell currently has a live PTY (running or being stopped). */
export function isLive(state: CellProcess): boolean {
  return state.status === "running" || state.status === "stopping";
}

/** True if a PTY spawn is in flight. */
export function isPending(state: CellProcess): boolean {
  return state.status === "spawning";
}
