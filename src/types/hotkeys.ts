import type { CellStatus } from "./cells";

export type HotkeyAction =
  | { type: "focusCell"; cellId: string }
  | { type: "cycleFocus"; direction: 1 | -1 }
  | { type: "setVisibleCount"; n: 1 | 2 | 3 | 4 }
  | { type: "stop"; cellId: string }
  | { type: "restart"; cellId: string }
  | { type: "resetConfig"; cellId: string }
  | { type: "removeCell"; cellId: string }
  | { type: "toggleSettings" }
  | { type: "toggleTaskSidebar"; cellId: string }
  | { type: "cycleFontSize"; cellId: string; direction: 1 | -1 }
  | { type: "resetFontSize"; cellId: string }
  | { type: "clearTerminal"; cellId: string }
  | { type: "openSearch"; cellId: string }
  | { type: "searchNext"; cellId: string }
  | { type: "closeSearch"; cellId: string }
  | { type: "paste"; cellId: string };

export type HotkeyGroup = "navigation" | "lifecycle" | "content" | "view";

export type HotkeyBinding = {
  /** Display label, e.g. "⌘1" or "⌘⇧4". Used in onboarding render. */
  display: string;
  /** Human-readable action description for onboarding. */
  description: string;
  group: HotkeyGroup;
};

export type HotkeyContext = {
  appReady: boolean;
  /** True while onboarding/settings overlay is active (no pending shrink). */
  onboardingOpen: boolean;
  /** True while a pending shrink-confirm dialog is showing. */
  pendingShrink: boolean;
  focusedCellId: string | null;
  visibleIds: string[];
  /** Per-cell process status for FSM-aware gating. */
  cellStatus: Record<string, CellStatus>;
  /** Per-cell has a non-null config (for restart eligibility). */
  cellHasConfig: Record<string, boolean>;
  /** Per-cell search open state. */
  searchOpen: Record<string, boolean>;
  /** Whether event target is a non-xterm input/textarea (let native paste/typing through). */
  targetIsFormField: boolean;
};

export type HotkeyEventLike = {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
};
