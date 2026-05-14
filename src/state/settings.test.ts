import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "clank:settings";

async function freshStore() {
  vi.resetModules();
  const mod = await import("./settings");
  return mod.useSettings;
}

describe("settings store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads defaults when localStorage is empty", async () => {
    const useSettings = await freshStore();
    const s = useSettings.getState();
    expect(s.onboarded).toBe(false);
    expect(s.notesDir).toBe("");
    expect(s.projectsDir).toBe("");
    expect(s.projectsPrefix).toBe("");
    expect(s.projectsSubpath).toBe("");
    expect(s.defaultCellCount).toBe(2);
  });

  it("merges partial persisted settings over defaults", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notesDir: "/n", onboarded: true }),
    );
    const useSettings = await freshStore();
    const s = useSettings.getState();
    expect(s.notesDir).toBe("/n");
    expect(s.onboarded).toBe(true);
    expect(s.projectsDir).toBe("");
    expect(s.defaultCellCount).toBe(2);
  });

  it("setters update state and persist without onboarding methods", async () => {
    const useSettings = await freshStore();
    useSettings.getState().setNotesDir("/notes");
    useSettings.getState().setProjectsDir("/code");
    useSettings.getState().setProjectsPrefix("foo-");
    useSettings.getState().setProjectsSubpath("apps/bot");
    useSettings.getState().setDefaultCellCount(4);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw!);
    expect(stored).toEqual({
      onboarded: false,
      notesDir: "/notes",
      projectsDir: "/code",
      projectsPrefix: "foo-",
      projectsSubpath: "apps/bot",
      defaultCellCount: 4,
    });
  });

  it("finishOnboarding + resetOnboarding flip the onboarded flag and persist", async () => {
    const useSettings = await freshStore();
    useSettings.getState().finishOnboarding();
    expect(useSettings.getState().onboarded).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).onboarded).toBe(true);

    useSettings.getState().resetOnboarding();
    expect(useSettings.getState().onboarded).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).onboarded).toBe(false);
  });

  it("survives malformed JSON in localStorage by falling back to defaults", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const useSettings = await freshStore();
    expect(useSettings.getState().defaultCellCount).toBe(2);
    expect(useSettings.getState().onboarded).toBe(false);
  });
});
