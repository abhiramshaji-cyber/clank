import { create } from "zustand";
import { defaultLayoutFor, findLayout } from "./layouts";
import { initialProcess, isLive, transitionCell } from "./cellMachine";
import type {
  ActivityState,
  CellCount,
  CellConfig,
  CellEvent,
  CellProcess,
  CellState,
} from "../types";

type Store = {
  cells: Record<string, CellState>;
  visibleIds: string[];
  focusedCellId: string | null;
  selectedLayoutId: string | null;
  draggedCellId: string | null;
  draggedOverCellId: string | null;
  /** Ephemeral: per-cell search-bar visibility. Not persisted. */
  searchOpen: Record<string, boolean>;
  /** Ephemeral: latest query typed into each cell's search bar. */
  searchQuery: Record<string, string>;
  /** Send a lifecycle event to a cell's FSM. */
  dispatchCell: (id: string, event: CellEvent) => void;
  setFontSize: (id: string, fontSize: number) => void;
  toggleTaskSidebar: (id: string) => void;
  setActivity: (id: string, activity: ActivityState) => void;
  setFocused: (id: string | null) => void;
  addCell: () => void;
  removeCell: (id: string) => void;
  setVisibleCount: (n: CellCount) => void;
  setLayout: (id: string) => void;
  beginDrag: (id: string) => void;
  hoverDrag: (id: string | null) => void;
  endDrag: () => void;
  swapCells: (a: string, b: string) => void;
  openSearch: (id: string) => void;
  closeSearch: (id: string) => void;
  setSearchQuery: (id: string, query: string) => void;
};

export const ALL_CELL_IDS = ["cell-1", "cell-2", "cell-3", "cell-4"] as const;
export const MAX_CELLS = ALL_CELL_IDS.length;
const STORAGE_PREFIX = "clank:cell:";
const VISIBLE_KEY = "clank:visible-cells";
const LAYOUT_KEY = "clank:selected-layout";

type Persisted = {
  config: CellConfig | null;
  fontSize: number;
  taskSidebarCollapsed: boolean;
};

function loadPersisted(id: string): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return { config: null, fontSize: 14, taskSidebarCollapsed: false };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      config: parsed.config ?? null,
      fontSize: parsed.fontSize ?? 14,
      taskSidebarCollapsed: parsed.taskSidebarCollapsed ?? false,
    };
  } catch {
    return { config: null, fontSize: 14, taskSidebarCollapsed: false };
  }
}

function persist(cell: CellState): void {
  try {
    const data: Persisted = {
      config: cell.process.config,
      fontSize: cell.fontSize,
      taskSidebarCollapsed: cell.taskSidebarCollapsed,
    };
    localStorage.setItem(STORAGE_PREFIX + cell.id, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadVisible(defaultCount: number): string[] {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const validated = parsed.filter((id) =>
        (ALL_CELL_IDS as readonly string[]).includes(id),
      );
      if (validated.length > 0) return validated.slice(0, MAX_CELLS);
    }
  } catch {
    // ignore
  }
  return ALL_CELL_IDS.slice(0, Math.max(1, Math.min(MAX_CELLS, defaultCount)));
}

function saveVisible(ids: string[]): void {
  try {
    localStorage.setItem(VISIBLE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function loadLayoutId(): string | null {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
}

function saveLayoutId(id: string): void {
  try {
    localStorage.setItem(LAYOUT_KEY, id);
  } catch {
    // ignore
  }
}

function initialCells(): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const id of ALL_CELL_IDS) {
    const p = loadPersisted(id);
    out[id] = {
      id,
      process: initialProcess(p.config),
      fontSize: p.fontSize,
      taskSidebarCollapsed: p.taskSidebarCollapsed,
      activity: "none",
    };
  }
  return out;
}

export const useCells = create<Store>((set) => {
  const initialVisible = loadVisible(2);
  const storedLayoutId = loadLayoutId();
  const startLayout = findLayout(storedLayoutId, initialVisible.length);
  return {
    cells: initialCells(),
    visibleIds: initialVisible,
    focusedCellId: null,
    selectedLayoutId: startLayout.id,
    draggedCellId: null,
    draggedOverCellId: null,
    searchOpen: {},
    searchQuery: {},
    dispatchCell: (id, event) =>
      set((state) => {
        const cell = state.cells[id];
        if (!cell) return state;
        const nextProcess = transitionCell(cell.process, event);
        if (nextProcess === cell.process) return state;

        // Reset activity when leaving live states.
        let nextActivity = cell.activity;
        if (
          !isLive(nextProcess) &&
          nextProcess.status !== "spawning" &&
          nextActivity !== "none"
        ) {
          nextActivity = "none";
        }

        const updated: CellState = {
          ...cell,
          process: nextProcess,
          activity: nextActivity,
        };
        persist(updated);

        // Close the search bar when the cell is no longer live.
        let nextSearch = state.searchOpen;
        if (!isLive(nextProcess) && nextSearch[id]) {
          nextSearch = { ...nextSearch };
          delete nextSearch[id];
        }

        return {
          cells: { ...state.cells, [id]: updated },
          searchOpen: nextSearch,
        };
      }),
    setFontSize: (id, fontSize) =>
      set((state) => {
        const cell = state.cells[id];
        if (!cell) return state;
        const updated: CellState = { ...cell, fontSize };
        persist(updated);
        return { cells: { ...state.cells, [id]: updated } };
      }),
    toggleTaskSidebar: (id) =>
      set((state) => {
        const cell = state.cells[id];
        if (!cell) return state;
        const updated: CellState = {
          ...cell,
          taskSidebarCollapsed: !cell.taskSidebarCollapsed,
        };
        persist(updated);
        return { cells: { ...state.cells, [id]: updated } };
      }),
    setActivity: (id, activity) =>
      set((state) => {
        const cell = state.cells[id];
        if (!cell) return state;
        if (cell.activity === activity) return state;
        return { cells: { ...state.cells, [id]: { ...cell, activity } } };
      }),
    setFocused: (id) =>
      set((state) => {
        if (state.focusedCellId === id) return state;
        return { focusedCellId: id };
      }),
    addCell: () =>
      set((state) => {
        if (state.visibleIds.length >= MAX_CELLS) return state;
        const next = ALL_CELL_IDS.find((id) => !state.visibleIds.includes(id));
        if (!next) return state;
        const visible = [...state.visibleIds, next];
        saveVisible(visible);
        const layout = defaultLayoutFor(visible.length);
        saveLayoutId(layout.id);
        return { visibleIds: visible, selectedLayoutId: layout.id };
      }),
    removeCell: (id) =>
      set((state) => {
        if (state.visibleIds.length <= 1) return state;
        const visible = state.visibleIds.filter((x) => x !== id);
        saveVisible(visible);
        const focused = state.focusedCellId === id ? null : state.focusedCellId;
        const layout = defaultLayoutFor(visible.length);
        saveLayoutId(layout.id);

        // Reset the removed cell back to idle via REMOVED event.
        const cell = state.cells[id];
        const cells = { ...state.cells };
        if (cell) {
          const nextProcess = transitionCell(cell.process, { type: "REMOVED" });
          cells[id] = {
            ...cell,
            process: nextProcess,
            activity: "none",
          };
          persist(cells[id]);
        }

        // Drop any open search for the removed cell.
        let searchOpen = state.searchOpen;
        if (searchOpen[id]) {
          searchOpen = { ...searchOpen };
          delete searchOpen[id];
        }

        return {
          visibleIds: visible,
          focusedCellId: focused,
          selectedLayoutId: layout.id,
          cells,
          searchOpen,
        };
      }),
    setVisibleCount: (n) =>
      set((state) => {
        const current = state.visibleIds;
        let next: string[];
        if (n <= current.length) {
          next = current.slice(0, n);
        } else {
          next = [...current];
          for (const id of ALL_CELL_IDS) {
            if (next.length >= n) break;
            if (!next.includes(id)) next.push(id);
          }
        }
        saveVisible(next);
        const layout = defaultLayoutFor(n);
        saveLayoutId(layout.id);

        // Reset dropped cells via REMOVED event. PTY-killing is the caller's
        // job (Onboarding does it on confirm-shrink).
        const dropped = current.filter((id) => !next.includes(id));
        const cells = { ...state.cells };
        for (const id of dropped) {
          const cell = cells[id];
          if (!cell) continue;
          const nextProcess = transitionCell(cell.process, { type: "REMOVED" });
          if (nextProcess === cell.process && cell.activity === "none") continue;
          cells[id] = { ...cell, process: nextProcess, activity: "none" };
          persist(cells[id]);
        }
        const focused =
          state.focusedCellId && dropped.includes(state.focusedCellId)
            ? null
            : state.focusedCellId;

        // Drop searchOpen entries for dropped cells.
        let searchOpen = state.searchOpen;
        for (const id of dropped) {
          if (searchOpen[id]) {
            if (searchOpen === state.searchOpen) searchOpen = { ...searchOpen };
            delete searchOpen[id];
          }
        }

        return {
          visibleIds: next,
          selectedLayoutId: layout.id,
          cells,
          focusedCellId: focused,
          searchOpen,
        };
      }),
    setLayout: (id) =>
      set(() => {
        saveLayoutId(id);
        return { selectedLayoutId: id };
      }),
    beginDrag: (id) => set({ draggedCellId: id, draggedOverCellId: null }),
    hoverDrag: (id) => set({ draggedOverCellId: id }),
    endDrag: () => set({ draggedCellId: null, draggedOverCellId: null }),
    swapCells: (a, b) =>
      set((state) => {
        if (a === b) return state;
        const ia = state.visibleIds.indexOf(a);
        const ib = state.visibleIds.indexOf(b);
        if (ia < 0 || ib < 0) return state;
        const next = [...state.visibleIds];
        next[ia] = b;
        next[ib] = a;
        saveVisible(next);
        return { visibleIds: next };
      }),
    openSearch: (id) =>
      set((state) => {
        if (state.searchOpen[id]) return state;
        return { searchOpen: { ...state.searchOpen, [id]: true } };
      }),
    closeSearch: (id) =>
      set((state) => {
        if (!state.searchOpen[id] && !(id in state.searchQuery)) return state;
        const nextOpen = { ...state.searchOpen };
        delete nextOpen[id];
        const nextQ = { ...state.searchQuery };
        delete nextQ[id];
        return { searchOpen: nextOpen, searchQuery: nextQ };
      }),
    setSearchQuery: (id, query) =>
      set((state) => {
        if (state.searchQuery[id] === query) return state;
        return { searchQuery: { ...state.searchQuery, [id]: query } };
      }),
  };
});

export const FONT_SIZES = [14, 12, 10] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export function nextFontSize(current: number): FontSize {
  const idx = FONT_SIZES.indexOf(current as FontSize);
  return FONT_SIZES[(idx + 1) % FONT_SIZES.length];
}

/**
 * Cells that have a live PTY (running or stopping) and would be dropped if
 * visible count shrinks to `n`. Returns [] when `n` does not shrink the set.
 *
 * Callers use this to decide whether to prompt before killing live terminals.
 */
export function droppedRunningIfShrinkTo(
  visibleIds: string[],
  cells: Record<string, CellState>,
  n: number,
): string[] {
  if (n >= visibleIds.length) return [];
  return visibleIds.slice(n).filter((id) => {
    const proc: CellProcess | undefined = cells[id]?.process;
    return proc !== undefined && isLive(proc);
  });
}
