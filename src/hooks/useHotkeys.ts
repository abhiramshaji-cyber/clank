import { useEffect } from "react";
import { keyEventToAction } from "../state/hotkeys";
import { useCells } from "../state/cells";
import { useAppMachine } from "../state/appMachine";
import { dispatchAction } from "./hotkeyDispatch";
import type { CellStatus, HotkeyContext } from "../types";

/**
 * `<textarea class="xterm-helper-textarea">` is the hidden IME textarea that
 * xterm.js renders for keystroke input. We do NOT want to treat it as a
 * "form field" — keys pressed while xterm has focus should still hit our
 * Cmd-prefix shortcuts.
 */
function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) {
    return !target.classList.contains("xterm-helper-textarea");
  }
  if (target.isContentEditable) return true;
  return false;
}

function buildContext(target: EventTarget | null): HotkeyContext {
  const cells = useCells.getState();
  const app = useAppMachine.getState();
  const cellStatus: Record<string, CellStatus> = {};
  const cellHasConfig: Record<string, boolean> = {};
  for (const id of Object.keys(cells.cells)) {
    cellStatus[id] = cells.cells[id].process.status;
    cellHasConfig[id] = cells.cells[id].process.config !== null;
  }
  const onboardingOpen =
    app.state.kind === "onboarding" &&
    (app.state.pendingShrink === null);
  const pendingShrink =
    app.state.kind === "onboarding" && app.state.pendingShrink !== null;
  return {
    appReady: app.state.kind === "ready",
    onboardingOpen,
    pendingShrink,
    focusedCellId: cells.focusedCellId,
    visibleIds: cells.visibleIds,
    cellStatus,
    cellHasConfig,
    searchOpen: cells.searchOpen,
    targetIsFormField: isFormFieldTarget(target),
  };
}

/**
 * Single global keydown listener for all of Clank's Cmd-prefix shortcuts.
 * Mount once at the app root. Capture-phase so we win over xterm's own
 * handlers (notably xterm's `Cmd+V` swallow, which gets us empty `text/plain`
 * on WKWebView — that's why paste goes through the clipboard plugin instead).
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyEventToAction(e, buildContext(e.target));
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      dispatchAction(action);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}
