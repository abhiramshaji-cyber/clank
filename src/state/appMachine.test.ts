import { describe, expect, it } from "vitest";
import {
  initialAppState,
  transitionApp,
  type AppState,
} from "./appMachine";

describe("initialAppState", () => {
  it("starts in first-run onboarding when not onboarded", () => {
    expect(initialAppState(false)).toEqual({
      kind: "onboarding",
      mode: "first",
      pendingShrink: null,
    });
  });

  it("starts ready when onboarded", () => {
    expect(initialAppState(true)).toEqual({ kind: "ready" });
  });
});

describe("transitionApp — settings flow", () => {
  it("ready → OPEN_SETTINGS → onboarding(revisit)", () => {
    expect(transitionApp({ kind: "ready" }, { type: "OPEN_SETTINGS" })).toEqual(
      { kind: "onboarding", mode: "revisit", pendingShrink: null },
    );
  });

  it("onboarding(revisit) → CLOSE_SETTINGS → ready", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: null,
    };
    expect(transitionApp(s, { type: "CLOSE_SETTINGS" })).toEqual({
      kind: "ready",
    });
  });

  it("CLOSE_SETTINGS does nothing on first-run onboarding", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "first",
      pendingShrink: null,
    };
    expect(transitionApp(s, { type: "CLOSE_SETTINGS" })).toBe(s);
  });

  it("CLOSE_SETTINGS does nothing while a shrink confirm is pending", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: { newCount: 2, atRisk: ["cell-3"] },
    };
    expect(transitionApp(s, { type: "CLOSE_SETTINGS" })).toBe(s);
  });

  it("COMPLETE_ONBOARDING moves first-run to ready", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "first",
      pendingShrink: null,
    };
    expect(transitionApp(s, { type: "COMPLETE_ONBOARDING" })).toEqual({
      kind: "ready",
    });
  });

  it("COMPLETE_ONBOARDING is a no-op while a shrink confirm is pending", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: { newCount: 1, atRisk: ["cell-2"] },
    };
    expect(transitionApp(s, { type: "COMPLETE_ONBOARDING" })).toBe(s);
  });
});

describe("transitionApp — shrink confirm flow", () => {
  const base: AppState = {
    kind: "onboarding",
    mode: "revisit",
    pendingShrink: null,
  };

  it("REQUEST_SHRINK_CONFIRM sets the pending shrink", () => {
    expect(
      transitionApp(base, {
        type: "REQUEST_SHRINK_CONFIRM",
        newCount: 2,
        atRisk: ["cell-3", "cell-4"],
      }),
    ).toEqual({
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: { newCount: 2, atRisk: ["cell-3", "cell-4"] },
    });
  });

  it("CANCEL_SHRINK clears the pending shrink without leaving onboarding", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: { newCount: 1, atRisk: ["cell-2"] },
    };
    expect(transitionApp(s, { type: "CANCEL_SHRINK" })).toEqual({
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: null,
    });
  });

  it("CONFIRM_SHRINK moves from onboarding to ready", () => {
    const s: AppState = {
      kind: "onboarding",
      mode: "revisit",
      pendingShrink: { newCount: 1, atRisk: ["cell-2"] },
    };
    expect(transitionApp(s, { type: "CONFIRM_SHRINK" })).toEqual({
      kind: "ready",
    });
  });

  it("REQUEST_SHRINK_CONFIRM has no effect once already ready", () => {
    expect(
      transitionApp(
        { kind: "ready" },
        { type: "REQUEST_SHRINK_CONFIRM", newCount: 2, atRisk: ["cell-3"] },
      ),
    ).toEqual({ kind: "ready" });
  });
});
