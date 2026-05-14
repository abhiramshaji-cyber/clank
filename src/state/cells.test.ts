import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CellConfig } from "../types";

const cfg: CellConfig = {
  cwd: "/x",
  command: "claude",
  args: [],
  tasksFile: null,
};

async function freshStore() {
  vi.resetModules();
  return await import("./cells");
}

describe("cells store — initial state", () => {
  beforeEach(() => localStorage.clear());

  it("starts with 2 visible cells when localStorage is empty", async () => {
    const { useCells } = await freshStore();
    expect(useCells.getState().visibleIds).toEqual(["cell-1", "cell-2"]);
  });

  it("restores visibleIds from localStorage when present", async () => {
    localStorage.setItem(
      "clank:visible-cells",
      JSON.stringify(["cell-2", "cell-3"]),
    );
    const { useCells } = await freshStore();
    expect(useCells.getState().visibleIds).toEqual(["cell-2", "cell-3"]);
  });

  it("starts every cell in idle with no config", async () => {
    const { useCells, ALL_CELL_IDS } = await freshStore();
    const cells = useCells.getState().cells;
    for (const id of ALL_CELL_IDS) {
      expect(cells[id].process.status).toBe("idle");
      expect(cells[id].process.config).toBeNull();
      expect(cells[id].fontSize).toBe(14);
      expect(cells[id].activity).toBe("none");
      expect(cells[id].taskSidebarCollapsed).toBe(false);
    }
  });
});

describe("cells store — dispatchCell lifecycle", () => {
  beforeEach(() => localStorage.clear());

  it("LAUNCH transitions idle → spawning with the new config", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    const p = useCells.getState().cells["cell-1"].process;
    expect(p.status).toBe("spawning");
    if (p.status === "spawning") expect(p.config).toEqual(cfg);
  });

  it("SPAWN_SUCCEEDED carries spawning → running", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-1", { type: "SPAWN_SUCCEEDED" });
    expect(useCells.getState().cells["cell-1"].process.status).toBe("running");
  });

  it("PROCESS_EXITED records exit code and resets activity", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-1", { type: "SPAWN_SUCCEEDED" });
    useCells.getState().setActivity("cell-1", "active");
    useCells.getState().dispatchCell("cell-1", {
      type: "PROCESS_EXITED",
      exitCode: 0,
    });
    const cell = useCells.getState().cells["cell-1"];
    expect(cell.process.status).toBe("exited");
    if (cell.process.status === "exited") {
      expect(cell.process.exitCode).toBe(0);
    }
    expect(cell.activity).toBe("none");
  });

  it("SPAWN_FAILED moves spawning → exited with the error string", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-1", {
      type: "SPAWN_FAILED",
      error: "boom",
    });
    const p = useCells.getState().cells["cell-1"].process;
    expect(p.status).toBe("exited");
    if (p.status === "exited") expect(p.error).toBe("boom");
  });

  it("RESET on exited returns to idle keeping the config", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-1", {
      type: "SPAWN_FAILED",
      error: "x",
    });
    useCells.getState().dispatchCell("cell-1", { type: "RESET" });
    const p = useCells.getState().cells["cell-1"].process;
    expect(p.status).toBe("idle");
    expect(p.config).toEqual(cfg);
  });

  it("dispatchCell is a no-op for invalid transitions", async () => {
    const { useCells } = await freshStore();
    const before = useCells.getState().cells["cell-1"];
    useCells.getState().dispatchCell("cell-1", { type: "SPAWN_SUCCEEDED" });
    expect(useCells.getState().cells["cell-1"]).toBe(before);
  });
});

describe("cells store — visibility + layout", () => {
  beforeEach(() => localStorage.clear());

  it("addCell appends the next unused cell id and caps at the maximum", async () => {
    const { useCells, ALL_CELL_IDS } = await freshStore();
    useCells.getState().addCell();
    useCells.getState().addCell();
    expect(useCells.getState().visibleIds).toEqual([...ALL_CELL_IDS]);
    useCells.getState().addCell();
    expect(useCells.getState().visibleIds).toEqual([...ALL_CELL_IDS]);
  });

  it("removeCell drops the requested id and refuses to go below one", async () => {
    const { useCells } = await freshStore();
    useCells.getState().removeCell("cell-1");
    expect(useCells.getState().visibleIds).toEqual(["cell-2"]);
    useCells.getState().removeCell("cell-2");
    expect(useCells.getState().visibleIds).toEqual(["cell-2"]);
  });

  it("removeCell clears focus if the removed cell was focused", async () => {
    const { useCells } = await freshStore();
    useCells.getState().setFocused("cell-1");
    useCells.getState().removeCell("cell-1");
    expect(useCells.getState().focusedCellId).toBeNull();
  });

  it("removeCell resets a running cell's process back to idle", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-1", { type: "SPAWN_SUCCEEDED" });
    expect(useCells.getState().cells["cell-1"].process.status).toBe("running");
    useCells.getState().removeCell("cell-1");
    expect(useCells.getState().cells["cell-1"].process.status).toBe("idle");
    expect(useCells.getState().cells["cell-1"].activity).toBe("none");
  });

  it("removeCell preserves the config so the cell can quick-relaunch later", async () => {
    const { useCells } = await freshStore();
    useCells.getState().dispatchCell("cell-1", {
      type: "LAUNCH",
      config: { ...cfg, args: ["--continue"] },
    });
    useCells.getState().removeCell("cell-1");
    const p = useCells.getState().cells["cell-1"].process;
    expect(p.status).toBe("idle");
    expect(p.config?.command).toBe("claude");
    expect(p.config?.args).toEqual(["--continue"]);
  });

  it("setLayout writes through to localStorage", async () => {
    const { useCells } = await freshStore();
    useCells.getState().setLayout("2-v");
    expect(useCells.getState().selectedLayoutId).toBe("2-v");
    expect(localStorage.getItem("clank:selected-layout")).toBe("2-v");
  });

  it("swapCells swaps positions in visibleIds and persists", async () => {
    const { useCells } = await freshStore();
    useCells.getState().swapCells("cell-1", "cell-2");
    expect(useCells.getState().visibleIds).toEqual(["cell-2", "cell-1"]);
    expect(JSON.parse(localStorage.getItem("clank:visible-cells")!)).toEqual([
      "cell-2",
      "cell-1",
    ]);
  });

  it("swapCells is a no-op when either id is not visible", async () => {
    const { useCells } = await freshStore();
    useCells.getState().swapCells("cell-1", "cell-4");
    expect(useCells.getState().visibleIds).toEqual(["cell-1", "cell-2"]);
  });
});

describe("cells store — setVisibleCount", () => {
  beforeEach(() => localStorage.clear());

  it("preserves current order when shrinking", async () => {
    const { useCells } = await freshStore();
    useCells.getState().swapCells("cell-1", "cell-2");
    useCells.getState().setVisibleCount(1);
    expect(useCells.getState().visibleIds).toEqual(["cell-2"]);
  });

  it("appends unused cells in canonical order when growing", async () => {
    const { useCells } = await freshStore();
    useCells.getState().setVisibleCount(4);
    expect(useCells.getState().visibleIds).toEqual([
      "cell-1",
      "cell-2",
      "cell-3",
      "cell-4",
    ]);
  });

  it("resets a dropped running cell back to idle", async () => {
    const { useCells } = await freshStore();
    useCells.getState().addCell();
    useCells.getState().dispatchCell("cell-3", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-3", { type: "SPAWN_SUCCEEDED" });
    expect(useCells.getState().cells["cell-3"].process.status).toBe("running");
    useCells.getState().setVisibleCount(2);
    expect(useCells.getState().visibleIds).toEqual(["cell-1", "cell-2"]);
    expect(useCells.getState().cells["cell-3"].process.status).toBe("idle");
    expect(useCells.getState().cells["cell-3"].activity).toBe("none");
  });

  it("clears focus when the focused cell is dropped", async () => {
    const { useCells } = await freshStore();
    useCells.getState().addCell();
    useCells.getState().setFocused("cell-3");
    useCells.getState().setVisibleCount(2);
    expect(useCells.getState().focusedCellId).toBeNull();
  });

  it("snaps the layout id to the default for the new count", async () => {
    const { useCells } = await freshStore();
    useCells.getState().setLayout("2-v");
    useCells.getState().setVisibleCount(4);
    expect(useCells.getState().selectedLayoutId).toBe("4-grid");
  });
});

describe("droppedRunningIfShrinkTo", () => {
  beforeEach(() => localStorage.clear());

  it("returns [] when the new count is the same or larger", async () => {
    const { useCells } = await freshStore();
    const { droppedRunningIfShrinkTo } = await import("./cells");
    const state = useCells.getState();
    expect(droppedRunningIfShrinkTo(state.visibleIds, state.cells, 2)).toEqual(
      [],
    );
    expect(droppedRunningIfShrinkTo(state.visibleIds, state.cells, 4)).toEqual(
      [],
    );
  });

  it("returns only the live cells that would be dropped", async () => {
    const { useCells } = await freshStore();
    const { droppedRunningIfShrinkTo } = await import("./cells");
    useCells.getState().addCell();
    useCells.getState().dispatchCell("cell-3", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-3", { type: "SPAWN_SUCCEEDED" });
    useCells.getState().dispatchCell("cell-2", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-2", { type: "SPAWN_SUCCEEDED" });
    const s = useCells.getState();
    expect(droppedRunningIfShrinkTo(s.visibleIds, s.cells, 2)).toEqual([
      "cell-3",
    ]);
    expect(droppedRunningIfShrinkTo(s.visibleIds, s.cells, 1)).toEqual([
      "cell-2",
      "cell-3",
    ]);
  });

  it("treats stopping as live (still attached to a PTY)", async () => {
    const { useCells } = await freshStore();
    const { droppedRunningIfShrinkTo } = await import("./cells");
    useCells.getState().addCell();
    useCells.getState().dispatchCell("cell-3", { type: "LAUNCH", config: cfg });
    useCells.getState().dispatchCell("cell-3", { type: "SPAWN_SUCCEEDED" });
    useCells.getState().dispatchCell("cell-3", { type: "REQUEST_STOP" });
    const s = useCells.getState();
    expect(droppedRunningIfShrinkTo(s.visibleIds, s.cells, 2)).toEqual([
      "cell-3",
    ]);
  });

  it("ignores idle cells in the dropped range", async () => {
    const { useCells } = await freshStore();
    const { droppedRunningIfShrinkTo } = await import("./cells");
    useCells.getState().addCell();
    const s = useCells.getState();
    expect(droppedRunningIfShrinkTo(s.visibleIds, s.cells, 2)).toEqual([]);
  });
});

describe("cells store — font sizes", () => {
  beforeEach(() => localStorage.clear());

  it("nextFontSize cycles 14 → 12 → 10 → 14", async () => {
    const { nextFontSize, FONT_SIZES } = await freshStore();
    expect(FONT_SIZES).toEqual([14, 12, 10]);
    expect(nextFontSize(14)).toBe(12);
    expect(nextFontSize(12)).toBe(10);
    expect(nextFontSize(10)).toBe(14);
  });

  it("setFontSize updates the cell and persists", async () => {
    const { useCells } = await freshStore();
    useCells.getState().setFontSize("cell-1", 10);
    expect(useCells.getState().cells["cell-1"].fontSize).toBe(10);
    const stored = JSON.parse(localStorage.getItem("clank:cell:cell-1")!);
    expect(stored.fontSize).toBe(10);
  });

  it("toggleTaskSidebar flips the cell flag and persists", async () => {
    const { useCells } = await freshStore();
    useCells.getState().toggleTaskSidebar("cell-1");
    expect(useCells.getState().cells["cell-1"].taskSidebarCollapsed).toBe(true);
    useCells.getState().toggleTaskSidebar("cell-1");
    expect(useCells.getState().cells["cell-1"].taskSidebarCollapsed).toBe(
      false,
    );
  });
});

describe("cells store — drag state", () => {
  beforeEach(() => localStorage.clear());

  it("beginDrag / hoverDrag / endDrag update the transient drag fields", async () => {
    const { useCells } = await freshStore();
    useCells.getState().beginDrag("cell-1");
    expect(useCells.getState().draggedCellId).toBe("cell-1");
    useCells.getState().hoverDrag("cell-2");
    expect(useCells.getState().draggedOverCellId).toBe("cell-2");
    useCells.getState().endDrag();
    expect(useCells.getState().draggedCellId).toBeNull();
    expect(useCells.getState().draggedOverCellId).toBeNull();
  });
});
