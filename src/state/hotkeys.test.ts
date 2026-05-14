import { describe, expect, it } from "vitest";
import { keyEventToAction, BINDINGS } from "./hotkeys";
import type { CellStatus, HotkeyContext, HotkeyEventLike } from "../types";

const baseCtx: HotkeyContext = {
  appReady: true,
  onboardingOpen: false,
  pendingShrink: false,
  focusedCellId: "cell-1",
  visibleIds: ["cell-1", "cell-2"],
  cellStatus: { "cell-1": "running", "cell-2": "running" } as Record<
    string,
    CellStatus
  >,
  cellHasConfig: { "cell-1": true, "cell-2": true },
  searchOpen: {},
  targetIsFormField: false,
};

const cmd = (
  key: string,
  overrides: Partial<HotkeyEventLike> = {},
): HotkeyEventLike => ({
  key,
  metaKey: true,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...overrides,
});

const ctxWith = (
  overrides: Partial<HotkeyContext>,
  base: HotkeyContext = baseCtx,
): HotkeyContext => ({
  ...base,
  ...overrides,
});

describe("BINDINGS table", () => {
  it("includes every hotkey group with at least one entry", () => {
    const groups = new Set(BINDINGS.map((b) => b.group));
    expect(groups.has("navigation")).toBe(true);
    expect(groups.has("lifecycle")).toBe(true);
    expect(groups.has("content")).toBe(true);
    expect(groups.has("view")).toBe(true);
  });
});

describe("keyEventToAction — navigation", () => {
  it("⌘1 focuses cell-1", () => {
    expect(keyEventToAction(cmd("1"), baseCtx)).toEqual({
      type: "focusCell",
      cellId: "cell-1",
    });
  });

  it("⌘2 focuses cell-2", () => {
    expect(keyEventToAction(cmd("2"), baseCtx)).toEqual({
      type: "focusCell",
      cellId: "cell-2",
    });
  });

  it("⌘3 is a no-op when only 2 cells are visible", () => {
    expect(keyEventToAction(cmd("3"), baseCtx)).toBeNull();
  });

  it("⌘] cycles focus forward", () => {
    expect(keyEventToAction(cmd("]"), baseCtx)).toEqual({
      type: "cycleFocus",
      direction: 1,
    });
  });

  it("⌘[ cycles focus backward", () => {
    expect(keyEventToAction(cmd("["), baseCtx)).toEqual({
      type: "cycleFocus",
      direction: -1,
    });
  });

  it("⌘⇧! sets visible count to 1", () => {
    expect(
      keyEventToAction(cmd("!", { shiftKey: true }), baseCtx),
    ).toEqual({ type: "setVisibleCount", n: 1 });
  });

  it("⌘⇧4 (raw digit + shift) sets visible count to 4", () => {
    expect(
      keyEventToAction(cmd("4", { shiftKey: true }), baseCtx),
    ).toEqual({ type: "setVisibleCount", n: 4 });
  });
});

describe("keyEventToAction — lifecycle", () => {
  it("⌘. stops a running focused cell", () => {
    expect(keyEventToAction(cmd("."), baseCtx)).toEqual({
      type: "stop",
      cellId: "cell-1",
    });
  });

  it("⌘. is a no-op when the focused cell is not running", () => {
    const ctx = ctxWith({
      cellStatus: { "cell-1": "idle", "cell-2": "running" },
    });
    expect(keyEventToAction(cmd("."), ctx)).toBeNull();
  });

  it("⌘. is a no-op when the focused cell is stopping", () => {
    const ctx = ctxWith({
      cellStatus: { "cell-1": "stopping", "cell-2": "running" },
    });
    expect(keyEventToAction(cmd("."), ctx)).toBeNull();
  });

  it("⌘R restarts when the focused cell has a config", () => {
    expect(keyEventToAction(cmd("r"), baseCtx)).toEqual({
      type: "restart",
      cellId: "cell-1",
    });
  });

  it("⌘R is a no-op when the cell has no config", () => {
    const ctx = ctxWith({ cellHasConfig: { "cell-1": false } });
    expect(keyEventToAction(cmd("r"), ctx)).toBeNull();
  });

  it("⌘E resets config only when the cell has exited", () => {
    const ctx = ctxWith({
      cellStatus: { "cell-1": "exited", "cell-2": "running" },
    });
    expect(keyEventToAction(cmd("e"), ctx)).toEqual({
      type: "resetConfig",
      cellId: "cell-1",
    });
    expect(keyEventToAction(cmd("e"), baseCtx)).toBeNull();
  });

  it("⌘⌫ removes the focused cell when there are multiple visible", () => {
    expect(keyEventToAction(cmd("Backspace"), baseCtx)).toEqual({
      type: "removeCell",
      cellId: "cell-1",
    });
  });

  it("⌘⌫ is a no-op when only one cell is visible", () => {
    const ctx = ctxWith({ visibleIds: ["cell-1"] });
    expect(keyEventToAction(cmd("Backspace"), ctx)).toBeNull();
  });

  it("⌘⌫ is a no-op when the focused cell is not in visibleIds", () => {
    const ctx = ctxWith({ focusedCellId: "cell-3" });
    expect(keyEventToAction(cmd("Backspace"), ctx)).toBeNull();
  });
});

describe("keyEventToAction — view", () => {
  it("⌘, toggles settings when ready", () => {
    expect(keyEventToAction(cmd(","), baseCtx)).toEqual({
      type: "toggleSettings",
    });
  });

  it("⌘, also fires while onboarding is open", () => {
    const ctx = ctxWith({ onboardingOpen: true, appReady: false });
    expect(keyEventToAction(cmd(","), ctx)).toEqual({
      type: "toggleSettings",
    });
  });

  it("⌘, does NOT fire while a pending shrink dialog is up", () => {
    const ctx = ctxWith({ pendingShrink: true });
    expect(keyEventToAction(cmd(","), ctx)).toBeNull();
  });

  it("⌘B toggles the task sidebar on a live cell", () => {
    expect(keyEventToAction(cmd("b"), baseCtx)).toEqual({
      type: "toggleTaskSidebar",
      cellId: "cell-1",
    });
  });

  it("⌘B is a no-op when the focused cell is idle", () => {
    const ctx = ctxWith({ cellStatus: { "cell-1": "idle" } });
    expect(keyEventToAction(cmd("b"), ctx)).toBeNull();
  });
});

describe("keyEventToAction — content", () => {
  it("⌘= cycles font size forward", () => {
    expect(keyEventToAction(cmd("="), baseCtx)).toEqual({
      type: "cycleFontSize",
      cellId: "cell-1",
      direction: 1,
    });
  });

  it("⌘+ (shifted) also cycles font size forward", () => {
    expect(
      keyEventToAction(cmd("+", { shiftKey: true }), baseCtx),
    ).toEqual({ type: "cycleFontSize", cellId: "cell-1", direction: 1 });
  });

  it("⌘− cycles font size backward", () => {
    expect(keyEventToAction(cmd("-"), baseCtx)).toEqual({
      type: "cycleFontSize",
      cellId: "cell-1",
      direction: -1,
    });
  });

  it("⌘0 resets font size", () => {
    expect(keyEventToAction(cmd("0"), baseCtx)).toEqual({
      type: "resetFontSize",
      cellId: "cell-1",
    });
  });

  it("⌘K clears the focused terminal when live", () => {
    expect(keyEventToAction(cmd("k"), baseCtx)).toEqual({
      type: "clearTerminal",
      cellId: "cell-1",
    });
  });

  it("⌘K is a no-op when the focused cell is exited", () => {
    const ctx = ctxWith({ cellStatus: { "cell-1": "exited" } });
    expect(keyEventToAction(cmd("k"), ctx)).toBeNull();
  });

  it("⌘F opens the search bar on a live cell", () => {
    expect(keyEventToAction(cmd("f"), baseCtx)).toEqual({
      type: "openSearch",
      cellId: "cell-1",
    });
  });

  it("⌘G fires searchNext only while search is open", () => {
    const open = ctxWith({ searchOpen: { "cell-1": true } });
    expect(keyEventToAction(cmd("g"), open)).toEqual({
      type: "searchNext",
      cellId: "cell-1",
    });
    expect(keyEventToAction(cmd("g"), baseCtx)).toBeNull();
  });

  it("Esc closes search when it is open", () => {
    const open = ctxWith({ searchOpen: { "cell-1": true } });
    expect(
      keyEventToAction(
        { key: "Escape", metaKey: false, shiftKey: false, altKey: false, ctrlKey: false },
        open,
      ),
    ).toEqual({ type: "closeSearch", cellId: "cell-1" });
  });

  it("Esc does nothing when search is closed", () => {
    expect(
      keyEventToAction(
        { key: "Escape", metaKey: false, shiftKey: false, altKey: false, ctrlKey: false },
        baseCtx,
      ),
    ).toBeNull();
  });

  it("⌘V on a live cell returns a paste action", () => {
    expect(keyEventToAction(cmd("v"), baseCtx)).toEqual({
      type: "paste",
      cellId: "cell-1",
    });
  });

  it("⌘V on a form-field target falls through to native paste", () => {
    const ctx = ctxWith({ targetIsFormField: true });
    expect(keyEventToAction(cmd("v"), ctx)).toBeNull();
  });

  it("⌘V is a no-op when the focused cell is idle", () => {
    const ctx = ctxWith({ cellStatus: { "cell-1": "idle" } });
    expect(keyEventToAction(cmd("v"), ctx)).toBeNull();
  });
});

describe("keyEventToAction — gating", () => {
  it("returns null when not appReady (and not the toggleSettings exception)", () => {
    const ctx = ctxWith({ appReady: false, onboardingOpen: true });
    expect(keyEventToAction(cmd("1"), ctx)).toBeNull();
    expect(keyEventToAction(cmd("."), ctx)).toBeNull();
    expect(keyEventToAction(cmd("k"), ctx)).toBeNull();
  });

  it("rejects bindings without metaKey", () => {
    expect(
      keyEventToAction(cmd("1", { metaKey: false }), baseCtx),
    ).toBeNull();
    expect(
      keyEventToAction(cmd("r", { metaKey: false }), baseCtx),
    ).toBeNull();
  });

  it("rejects bindings when Ctrl is also held (Ctrl is reserved for the PTY)", () => {
    expect(
      keyEventToAction(cmd("1", { ctrlKey: true }), baseCtx),
    ).toBeNull();
  });

  it("returns null when no cell is focused for single-cell hotkeys", () => {
    const ctx = ctxWith({ focusedCellId: null });
    expect(keyEventToAction(cmd("."), ctx)).toBeNull();
    expect(keyEventToAction(cmd("r"), ctx)).toBeNull();
    expect(keyEventToAction(cmd("k"), ctx)).toBeNull();
    expect(keyEventToAction(cmd("v"), ctx)).toBeNull();
    expect(keyEventToAction(cmd("="), ctx)).toBeNull();
    expect(keyEventToAction(cmd("0"), ctx)).toBeNull();
  });

  it("navigation hotkeys still work without focus (they set focus)", () => {
    const ctx = ctxWith({ focusedCellId: null });
    expect(keyEventToAction(cmd("1"), ctx)).toEqual({
      type: "focusCell",
      cellId: "cell-1",
    });
    expect(keyEventToAction(cmd("]"), ctx)).toEqual({
      type: "cycleFocus",
      direction: 1,
    });
  });

  it("setVisibleCount fires without focus, even via raw shifted digit", () => {
    const ctx = ctxWith({ focusedCellId: null });
    expect(
      keyEventToAction(cmd("3", { shiftKey: true }), ctx),
    ).toEqual({ type: "setVisibleCount", n: 3 });
  });

  it("pendingShrink swallows every hotkey including ⌘,", () => {
    const ctx = ctxWith({ pendingShrink: true });
    expect(keyEventToAction(cmd(","), ctx)).toBeNull();
    expect(keyEventToAction(cmd("1"), ctx)).toBeNull();
    expect(
      keyEventToAction(
        { key: "Escape", metaKey: false, shiftKey: false, altKey: false, ctrlKey: false },
        ctx,
      ),
    ).toBeNull();
  });

  it("onboardingOpen blocks everything except ⌘,", () => {
    const ctx = ctxWith({ onboardingOpen: true, appReady: false });
    expect(keyEventToAction(cmd("1"), ctx)).toBeNull();
    expect(keyEventToAction(cmd("."), ctx)).toBeNull();
    expect(keyEventToAction(cmd("v"), ctx)).toBeNull(); // form-field → null too
    expect(keyEventToAction(cmd(","), ctx)).toEqual({
      type: "toggleSettings",
    });
  });
});
