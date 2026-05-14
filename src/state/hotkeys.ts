import type {
  HotkeyAction,
  HotkeyBinding,
  HotkeyContext,
  HotkeyEventLike,
} from "../types";

/**
 * Source of truth for keyboard shortcuts. Both the pure mapper and the
 * onboarding renderer consume this — do not duplicate the table in JSX.
 */
export const BINDINGS: readonly HotkeyBinding[] = [
  // navigation
  {
    display: "⌘1 – ⌘4",
    description: "Focus cell N (no-op if N > visible count)",
    group: "navigation",
  },
  {
    display: "⌘]",
    description: "Cycle focus forward",
    group: "navigation",
  },
  {
    display: "⌘[",
    description: "Cycle focus backward",
    group: "navigation",
  },
  {
    display: "⌘⇧1 – ⌘⇧4",
    description: "Set visible cell count (prompts before dropping live cells)",
    group: "navigation",
  },
  // lifecycle
  {
    display: "⌘.",
    description: "Stop focused cell (SIGINT → SIGKILL after 2 s)",
    group: "lifecycle",
  },
  {
    display: "⌘R",
    description: "Restart focused cell with its last config",
    group: "lifecycle",
  },
  {
    display: "⌘E",
    description: "Edit config (only when the cell has exited)",
    group: "lifecycle",
  },
  {
    display: "⌘⌫",
    description: "Remove focused cell (only if more than one is visible)",
    group: "lifecycle",
  },
  // view
  { display: "⌘,", description: "Toggle settings", group: "view" },
  {
    display: "⌘B",
    description: "Toggle the tasks sidebar on the focused cell",
    group: "view",
  },
  // content
  {
    display: "⌘= / ⌘+",
    description: "Cycle font size up on the focused cell",
    group: "content",
  },
  {
    display: "⌘−",
    description: "Cycle font size down on the focused cell",
    group: "content",
  },
  {
    display: "⌘0",
    description: "Reset focused cell's font size to 14 px",
    group: "content",
  },
  {
    display: "⌘K",
    description: "Clear the focused terminal",
    group: "content",
  },
  {
    display: "⌘F",
    description: "Find in the focused terminal",
    group: "content",
  },
  {
    display: "⌘G",
    description: "Next match (while search bar is open)",
    group: "content",
  },
  {
    display: "Esc",
    description: "Close the search bar (while it is open)",
    group: "content",
  },
  {
    display: "⌘C",
    description: "Copy selection (handled by xterm)",
    group: "content",
  },
  {
    display: "⌘V",
    description:
      "Paste — reads clipboard via Tauri plugin and writes to the PTY",
    group: "content",
  },
];

const isLiveStatus = (s: string | undefined): boolean =>
  s === "running" || s === "stopping";

const SHIFT_DIGIT: Record<string, 1 | 2 | 3 | 4> = {
  "!": 1,
  "1": 1,
  "@": 2,
  "2": 2,
  "#": 3,
  "3": 3,
  $: 4,
  "4": 4,
};

/**
 * Pure mapping from a key event to an action (or null, meaning "do nothing,
 * let the browser handle it"). Tested exhaustively in `hotkeys.test.ts`.
 *
 * The window listener should only call `preventDefault()` when this returns a
 * non-null action — otherwise native form behaviours (input typing, native
 * paste on `<input>`) break.
 */
export function keyEventToAction(
  e: HotkeyEventLike,
  ctx: HotkeyContext,
): HotkeyAction | null {
  // Esc — close search. Works without any modifier; consumed only when the
  // search bar is open on the focused cell.
  if (e.key === "Escape") {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    if (ctx.pendingShrink) return null;
    const f = ctx.focusedCellId;
    if (f && ctx.searchOpen[f]) {
      return { type: "closeSearch", cellId: f };
    }
    return null;
  }

  // Pending shrink-confirm dialog swallows every hotkey.
  if (ctx.pendingShrink) return null;

  // All remaining bindings are Cmd-prefix (no Ctrl, no Alt).
  if (!e.metaKey || e.ctrlKey || e.altKey) return null;

  // Toggle settings is the only Cmd-binding that fires during onboarding.
  if (e.key === "," && !e.shiftKey) {
    return { type: "toggleSettings" };
  }

  // Hotkeys are disabled while onboarding/settings is open.
  if (ctx.onboardingOpen) return null;
  if (!ctx.appReady) return null;

  // Cmd+Shift+1..4 — set visible cell count. Handle both shifted (! @ # $) and
  // raw digits with shift (some layouts/browsers still send "1"..."4").
  if (e.shiftKey) {
    if (e.key in SHIFT_DIGIT) {
      return { type: "setVisibleCount", n: SHIFT_DIGIT[e.key] };
    }
    // Cmd+Shift+= → "+". Treat as font-size cycle forward (matches Cmd+= path).
    if (e.key === "+") {
      const f = ctx.focusedCellId;
      if (!f) return null;
      return { type: "cycleFontSize", cellId: f, direction: 1 };
    }
    return null;
  }

  // Cmd+1..4 — focus cell N (only if N ≤ visibleIds.length).
  if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
    const idx = Number(e.key) - 1;
    const cellId = ctx.visibleIds[idx];
    if (!cellId) return null;
    return { type: "focusCell", cellId };
  }

  // Cmd+] / Cmd+[ — cycle focus.
  if (e.key === "]") return { type: "cycleFocus", direction: 1 };
  if (e.key === "[") return { type: "cycleFocus", direction: -1 };

  const f = ctx.focusedCellId;

  // ---- everything below targets the focused cell ----
  if (e.key === ".") {
    if (!f) return null;
    if (ctx.cellStatus[f] !== "running") return null;
    return { type: "stop", cellId: f };
  }
  if (e.key === "r" || e.key === "R") {
    if (!f) return null;
    if (!ctx.cellHasConfig[f]) return null;
    return { type: "restart", cellId: f };
  }
  if (e.key === "e" || e.key === "E") {
    if (!f) return null;
    if (ctx.cellStatus[f] !== "exited") return null;
    return { type: "resetConfig", cellId: f };
  }
  if (e.key === "Backspace") {
    if (!f) return null;
    if (ctx.visibleIds.length <= 1) return null;
    if (!ctx.visibleIds.includes(f)) return null;
    return { type: "removeCell", cellId: f };
  }
  if (e.key === "b" || e.key === "B") {
    if (!f) return null;
    if (!isLiveStatus(ctx.cellStatus[f])) return null;
    return { type: "toggleTaskSidebar", cellId: f };
  }
  if (e.key === "=" || e.key === "+") {
    if (!f) return null;
    return { type: "cycleFontSize", cellId: f, direction: 1 };
  }
  if (e.key === "-") {
    if (!f) return null;
    return { type: "cycleFontSize", cellId: f, direction: -1 };
  }
  if (e.key === "0") {
    if (!f) return null;
    return { type: "resetFontSize", cellId: f };
  }
  if (e.key === "k" || e.key === "K") {
    if (!f) return null;
    if (!isLiveStatus(ctx.cellStatus[f])) return null;
    return { type: "clearTerminal", cellId: f };
  }
  if (e.key === "f" || e.key === "F") {
    if (!f) return null;
    if (!isLiveStatus(ctx.cellStatus[f])) return null;
    return { type: "openSearch", cellId: f };
  }
  if (e.key === "g" || e.key === "G") {
    if (!f) return null;
    if (!ctx.searchOpen[f]) return null;
    return { type: "searchNext", cellId: f };
  }
  if (e.key === "v" || e.key === "V") {
    if (ctx.targetIsFormField) return null; // fall through to native paste
    if (!f) return null;
    if (!isLiveStatus(ctx.cellStatus[f])) return null;
    return { type: "paste", cellId: f };
  }
  return null;
}
