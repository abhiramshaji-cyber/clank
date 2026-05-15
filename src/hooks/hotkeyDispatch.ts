import {
  droppedRunningIfShrinkTo,
  FONT_SIZES,
  useCells,
  type FontSize,
} from "../state/cells";
import { useAppMachine } from "../state/appMachine";
import { isLive } from "../state/cellMachine";
import { getTerminal } from "../state/terminalRegistry";
import { ptyKill, ptyWrite } from "../ipc/pty";
import { readClipboardText } from "../ipc/clipboard";
import type { HotkeyAction } from "../types";

/**
 * Per-action throttle for destructive shortcuts. Holding Cmd+R or Cmd+. should
 * not fire the action repeatedly via auto-repeat.
 */
const DESTRUCTIVE_THROTTLE_MS = 300;
const DESTRUCTIVE: ReadonlySet<HotkeyAction["type"]> = new Set([
  "stop",
  "restart",
  "resetConfig",
  "removeCell",
]);
const lastFiredAt = new Map<string, number>();

function shouldThrottle(action: HotkeyAction): boolean {
  if (!DESTRUCTIVE.has(action.type)) return false;
  const key =
    "cellId" in action ? `${action.type}:${action.cellId}` : action.type;
  const now = Date.now();
  const prev = lastFiredAt.get(key) ?? 0;
  if (now - prev < DESTRUCTIVE_THROTTLE_MS) return true;
  lastFiredAt.set(key, now);
  return false;
}

function prevFontSize(current: number): FontSize {
  const idx = FONT_SIZES.indexOf(current as FontSize);
  // -1 → wrap to last
  const next = idx <= 0 ? FONT_SIZES.length - 1 : idx - 1;
  return FONT_SIZES[next];
}

function cycleFocus(direction: 1 | -1): void {
  const cells = useCells.getState();
  const ids = cells.visibleIds;
  if (ids.length === 0) return;
  const cur = cells.focusedCellId;
  let idx = cur ? ids.indexOf(cur) : -1;
  if (idx < 0) idx = direction === 1 ? -1 : ids.length;
  const next = (idx + direction + ids.length) % ids.length;
  cells.setFocused(ids[next]);
}

function handleSetVisibleCount(n: 1 | 2 | 3 | 4): void {
  const cells = useCells.getState();
  const app = useAppMachine.getState();
  const atRisk = droppedRunningIfShrinkTo(cells.visibleIds, cells.cells, n);
  if (atRisk.length === 0) {
    cells.setVisibleCount(n);
    return;
  }
  // Live cells will be force-killed — route through the existing
  // shrink-confirm dialog in onboarding so the user gets a chance to back out.
  if (app.state.kind === "ready") {
    app.dispatch({ type: "OPEN_SETTINGS" });
  }
  app.dispatch({
    type: "REQUEST_SHRINK_CONFIRM",
    newCount: n,
    atRisk,
  });
}

function handleToggleSettings(): void {
  const app = useAppMachine.getState();
  if (app.state.kind === "ready") {
    app.dispatch({ type: "OPEN_SETTINGS" });
    return;
  }
  if (app.state.kind === "onboarding" && app.state.mode === "revisit") {
    app.dispatch({ type: "CLOSE_SETTINGS" });
  }
  // First-time onboarding: can't dismiss with Cmd+,. No-op is fine.
}

function handleStop(cellId: string): void {
  ptyKill(cellId, "SIGINT").catch((e) => console.error("ptyKill:", e));
  useCells.getState().dispatchCell(cellId, { type: "REQUEST_STOP" });
}

function handleRestart(cellId: string): void {
  const cell = useCells.getState().cells[cellId];
  if (!cell) return;
  const cfg = cell.process.config;
  if (!cfg) return;
  if (isLive(cell.process)) {
    ptyKill(cellId, "SIGKILL").catch((e) => console.error("ptyKill:", e));
  }
  useCells.getState().dispatchCell(cellId, { type: "LAUNCH", config: cfg });
}

function handleRemoveCell(cellId: string): void {
  const cell = useCells.getState().cells[cellId];
  if (cell && isLive(cell.process)) {
    ptyKill(cellId, "SIGKILL").catch((e) => console.error("ptyKill:", e));
  }
  useCells.getState().removeCell(cellId);
}

async function handlePaste(cellId: string): Promise<void> {
  try {
    const text = await readClipboardText();
    if (!text) return;
    await ptyWrite(cellId, text);
  } catch (e) {
    console.error("paste failed:", e);
  }
}

export function dispatchAction(action: HotkeyAction): void {
  if (shouldThrottle(action)) return;

  const cells = useCells.getState();
  switch (action.type) {
    case "focusCell":
      cells.setFocused(action.cellId);
      return;
    case "cycleFocus":
      cycleFocus(action.direction);
      return;
    case "setVisibleCount":
      handleSetVisibleCount(action.n);
      return;
    case "stop":
      handleStop(action.cellId);
      return;
    case "restart":
      handleRestart(action.cellId);
      return;
    case "resetConfig":
      cells.dispatchCell(action.cellId, { type: "RESET" });
      return;
    case "removeCell":
      handleRemoveCell(action.cellId);
      return;
    case "toggleSettings":
      handleToggleSettings();
      return;
    case "toggleTaskSidebar":
      cells.toggleTaskSidebar(action.cellId);
      return;
    case "cycleFontSize": {
      const current = cells.cells[action.cellId]?.fontSize ?? 14;
      const next =
        action.direction === 1
          ? FONT_SIZES[(FONT_SIZES.indexOf(current as FontSize) + 1) %
              FONT_SIZES.length]
          : prevFontSize(current);
      cells.setFontSize(action.cellId, next);
      return;
    }
    case "resetFontSize":
      cells.setFontSize(action.cellId, 14);
      return;
    case "clearTerminal":
      getTerminal(action.cellId)?.clear();
      return;
    case "openSearch":
      cells.openSearch(action.cellId);
      return;
    case "searchNext": {
      const q = cells.searchQuery[action.cellId] ?? "";
      if (q) getTerminal(action.cellId)?.searchNext(q);
      return;
    }
    case "closeSearch":
      cells.closeSearch(action.cellId);
      return;
    case "paste":
      void handlePaste(action.cellId);
      return;
  }
}
