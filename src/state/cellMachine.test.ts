import { describe, expect, it } from "vitest";
import {
  initialProcess,
  isLive,
  isPending,
  transitionCell,
} from "./cellMachine";
import type { CellConfig, CellProcess } from "../types";

const cfg: CellConfig = {
  cwd: "/x",
  command: "claude",
  args: [],
  tasksFile: null,
};

const cfg2: CellConfig = {
  cwd: "/y",
  command: "codex",
  args: ["--continue"],
  tasksFile: null,
};

describe("initialProcess", () => {
  it("starts idle with the given config (may be null)", () => {
    expect(initialProcess(null)).toEqual({ status: "idle", config: null });
    expect(initialProcess(cfg)).toEqual({ status: "idle", config: cfg });
  });
});

describe("transitionCell — happy path", () => {
  it("idle → LAUNCH → spawning", () => {
    const s = transitionCell(initialProcess(null), {
      type: "LAUNCH",
      config: cfg,
    });
    expect(s).toEqual({ status: "spawning", config: cfg });
  });

  it("spawning → SPAWN_SUCCEEDED → running", () => {
    const spawning: CellProcess = { status: "spawning", config: cfg };
    expect(transitionCell(spawning, { type: "SPAWN_SUCCEEDED" })).toEqual({
      status: "running",
      config: cfg,
    });
  });

  it("running → REQUEST_STOP → stopping", () => {
    const running: CellProcess = { status: "running", config: cfg };
    expect(transitionCell(running, { type: "REQUEST_STOP" })).toEqual({
      status: "stopping",
      config: cfg,
    });
  });

  it("stopping → PROCESS_EXITED → exited", () => {
    const stopping: CellProcess = { status: "stopping", config: cfg };
    const next = transitionCell(stopping, {
      type: "PROCESS_EXITED",
      exitCode: 130,
    });
    expect(next).toEqual({
      status: "exited",
      config: cfg,
      exitCode: 130,
      error: null,
    });
  });

  it("exited → LAUNCH → spawning (relaunch with new config)", () => {
    const exited: CellProcess = {
      status: "exited",
      config: cfg,
      exitCode: 0,
      error: null,
    };
    expect(transitionCell(exited, { type: "LAUNCH", config: cfg2 })).toEqual({
      status: "spawning",
      config: cfg2,
    });
  });

  it("exited → RESET → idle (config preserved)", () => {
    const exited: CellProcess = {
      status: "exited",
      config: cfg,
      exitCode: 1,
      error: null,
    };
    expect(transitionCell(exited, { type: "RESET" })).toEqual({
      status: "idle",
      config: cfg,
    });
  });
});

describe("transitionCell — failures and shortcuts", () => {
  it("spawning → SPAWN_FAILED → exited with error", () => {
    const spawning: CellProcess = { status: "spawning", config: cfg };
    expect(transitionCell(spawning, { type: "SPAWN_FAILED", error: "boom" }))
      .toEqual({
        status: "exited",
        config: cfg,
        exitCode: null,
        error: "boom",
      });
  });

  it("running → FORCE_KILL → exited (no exit code, no error)", () => {
    const running: CellProcess = { status: "running", config: cfg };
    expect(transitionCell(running, { type: "FORCE_KILL" })).toEqual({
      status: "exited",
      config: cfg,
      exitCode: null,
      error: null,
    });
  });

  it("running → PROCESS_EXITED preserves config and records exit code", () => {
    const running: CellProcess = { status: "running", config: cfg };
    expect(
      transitionCell(running, { type: "PROCESS_EXITED", exitCode: 0 }),
    ).toEqual({
      status: "exited",
      config: cfg,
      exitCode: 0,
      error: null,
    });
  });

  it("running → LAUNCH allows force-restart with a new config", () => {
    const running: CellProcess = { status: "running", config: cfg };
    expect(transitionCell(running, { type: "LAUNCH", config: cfg2 })).toEqual({
      status: "spawning",
      config: cfg2,
    });
  });
});

describe("transitionCell — REMOVED universal handler", () => {
  it("REMOVED collapses any state back to idle, preserving config", () => {
    const states: CellProcess[] = [
      { status: "idle", config: cfg },
      { status: "spawning", config: cfg },
      { status: "running", config: cfg },
      { status: "stopping", config: cfg },
      { status: "exited", config: cfg, exitCode: 1, error: null },
    ];
    for (const s of states) {
      expect(transitionCell(s, { type: "REMOVED" })).toEqual({
        status: "idle",
        config: cfg,
      });
    }
  });

  it("REMOVED on idle keeps config null when it was null", () => {
    expect(
      transitionCell({ status: "idle", config: null }, { type: "REMOVED" }),
    ).toEqual({ status: "idle", config: null });
  });
});

describe("transitionCell — invalid transitions are no-ops", () => {
  it("idle ignores SPAWN_SUCCEEDED, PROCESS_EXITED, etc.", () => {
    const idle: CellProcess = { status: "idle", config: null };
    expect(transitionCell(idle, { type: "SPAWN_SUCCEEDED" })).toBe(idle);
    expect(
      transitionCell(idle, { type: "PROCESS_EXITED", exitCode: 0 }),
    ).toBe(idle);
    expect(transitionCell(idle, { type: "REQUEST_STOP" })).toBe(idle);
    expect(transitionCell(idle, { type: "RESET" })).toBe(idle);
  });

  it("spawning ignores REQUEST_STOP (we haven't started yet)", () => {
    const spawning: CellProcess = { status: "spawning", config: cfg };
    expect(transitionCell(spawning, { type: "REQUEST_STOP" })).toBe(spawning);
  });

  it("stopping is idempotent on REQUEST_STOP", () => {
    const stopping: CellProcess = { status: "stopping", config: cfg };
    expect(transitionCell(stopping, { type: "REQUEST_STOP" })).toBe(stopping);
  });

  it("exited ignores SPAWN_SUCCEEDED / PROCESS_EXITED", () => {
    const exited: CellProcess = {
      status: "exited",
      config: cfg,
      exitCode: 0,
      error: null,
    };
    expect(transitionCell(exited, { type: "SPAWN_SUCCEEDED" })).toBe(exited);
    expect(
      transitionCell(exited, { type: "PROCESS_EXITED", exitCode: 0 }),
    ).toBe(exited);
  });
});

describe("isLive / isPending", () => {
  it("isLive is true only for running and stopping", () => {
    expect(isLive({ status: "idle", config: null })).toBe(false);
    expect(isLive({ status: "spawning", config: cfg })).toBe(false);
    expect(isLive({ status: "running", config: cfg })).toBe(true);
    expect(isLive({ status: "stopping", config: cfg })).toBe(true);
    expect(
      isLive({ status: "exited", config: cfg, exitCode: 0, error: null }),
    ).toBe(false);
  });

  it("isPending is true only for spawning", () => {
    expect(isPending({ status: "spawning", config: cfg })).toBe(true);
    expect(isPending({ status: "running", config: cfg })).toBe(false);
  });
});
