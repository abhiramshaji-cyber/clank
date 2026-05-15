import { create } from "zustand";
import type { CellCount } from "../types";
import { SETTINGS_STORAGE_KEY } from "./storageKeys";

export type ShrinkRequest = {
  newCount: CellCount;
  atRisk: string[];
};

/**
 * Top-level UI state. Keeps onboarding/settings/modal flow in one place
 * instead of scattered `useState` flags.
 *
 *   onboarding(first)   ── COMPLETE_ONBOARDING ──→ ready
 *   ready               ── OPEN_SETTINGS ────────→ onboarding(revisit)
 *   onboarding(revisit) ── CLOSE_SETTINGS ───────→ ready
 *   onboarding(revisit) ── REQUEST_SHRINK ──────→ onboarding(revisit, pending)
 *   onboarding(pending) ── CANCEL_SHRINK ────────→ onboarding(no pending)
 *   onboarding(pending) ── CONFIRM_SHRINK ──────→ ready
 */
export type AppState =
  | {
      kind: "onboarding";
      mode: "first" | "revisit";
      pendingShrink: ShrinkRequest | null;
    }
  | { kind: "ready" };

export type AppEvent =
  | { type: "OPEN_SETTINGS" }
  | { type: "CLOSE_SETTINGS" }
  | { type: "COMPLETE_ONBOARDING" }
  | {
      type: "REQUEST_SHRINK_CONFIRM";
      newCount: CellCount;
      atRisk: string[];
    }
  | { type: "CANCEL_SHRINK" }
  | { type: "CONFIRM_SHRINK" };

export function initialAppState(onboarded: boolean): AppState {
  if (!onboarded) {
    return { kind: "onboarding", mode: "first", pendingShrink: null };
  }
  return { kind: "ready" };
}

export function transitionApp(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "OPEN_SETTINGS":
      if (state.kind === "ready") {
        return { kind: "onboarding", mode: "revisit", pendingShrink: null };
      }
      return state;

    case "CLOSE_SETTINGS":
      if (
        state.kind === "onboarding" &&
        state.mode === "revisit" &&
        state.pendingShrink === null
      ) {
        return { kind: "ready" };
      }
      return state;

    case "COMPLETE_ONBOARDING":
      if (state.kind === "onboarding" && state.pendingShrink === null) {
        return { kind: "ready" };
      }
      return state;

    case "REQUEST_SHRINK_CONFIRM":
      if (state.kind === "onboarding") {
        return {
          ...state,
          pendingShrink: { newCount: event.newCount, atRisk: event.atRisk },
        };
      }
      return state;

    case "CANCEL_SHRINK":
      if (state.kind === "onboarding") {
        return { ...state, pendingShrink: null };
      }
      return state;

    case "CONFIRM_SHRINK":
      if (state.kind === "onboarding") {
        return { kind: "ready" };
      }
      return state;
  }
}

type Store = {
  state: AppState;
  dispatch: (event: AppEvent) => void;
};

/**
 * Read the initial `onboarded` flag straight from localStorage to avoid a
 * circular import with `state/settings.ts`. Keeps appMachine pure-ish.
 */
function readOnboardedFlag(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { onboarded?: boolean };
    return parsed.onboarded === true;
  } catch {
    return false;
  }
}

export const useAppMachine = create<Store>((set) => ({
  state: initialAppState(readOnboardedFlag()),
  dispatch: (event) =>
    set((s) => ({ state: transitionApp(s.state, event) })),
}));
