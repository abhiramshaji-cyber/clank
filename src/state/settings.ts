import { create } from "zustand";
import type { CellCount, Settings } from "../types";
import { SETTINGS_STORAGE_KEY as STORAGE_KEY } from "./storageKeys";

const DEFAULTS: Settings = {
  onboarded: false,
  notesDir: "",
  projectsDir: "",
  projectsPrefix: "",
  projectsSubpath: "",
  defaultCellCount: 2,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

type Store = Settings & {
  setNotesDir: (v: string) => void;
  setProjectsDir: (v: string) => void;
  setProjectsPrefix: (v: string) => void;
  setProjectsSubpath: (v: string) => void;
  setDefaultCellCount: (v: CellCount) => void;
  finishOnboarding: () => void;
  resetOnboarding: () => void;
};

function toSettings(s: Store): Settings {
  return {
    onboarded: s.onboarded,
    notesDir: s.notesDir,
    projectsDir: s.projectsDir,
    projectsPrefix: s.projectsPrefix,
    projectsSubpath: s.projectsSubpath,
    defaultCellCount: s.defaultCellCount,
  };
}

export const useSettings = create<Store>((set) => ({
  ...load(),
  setNotesDir: (v) =>
    set((s) => {
      const next: Store = { ...s, notesDir: v };
      save(toSettings(next));
      return next;
    }),
  setProjectsDir: (v) =>
    set((s) => {
      const next: Store = { ...s, projectsDir: v };
      save(toSettings(next));
      return next;
    }),
  setProjectsPrefix: (v) =>
    set((s) => {
      const next: Store = { ...s, projectsPrefix: v };
      save(toSettings(next));
      return next;
    }),
  setProjectsSubpath: (v) =>
    set((s) => {
      const next: Store = { ...s, projectsSubpath: v };
      save(toSettings(next));
      return next;
    }),
  setDefaultCellCount: (v) =>
    set((s) => {
      const next: Store = { ...s, defaultCellCount: v };
      save(toSettings(next));
      return next;
    }),
  finishOnboarding: () =>
    set((s) => {
      const next: Store = { ...s, onboarded: true };
      save(toSettings(next));
      return next;
    }),
  resetOnboarding: () =>
    set((s) => {
      const next: Store = { ...s, onboarded: false };
      save(toSettings(next));
      return next;
    }),
}));
