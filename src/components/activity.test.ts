import { describe, expect, it } from "vitest";
import {
  classifyOnData,
  classifyOnIdle,
  lastNonEmptyLine,
  stripAnsi,
} from "./activity";

describe("stripAnsi", () => {
  it("removes SGR escape sequences", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m text")).toBe("red text");
  });

  it("leaves plain text untouched", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });
});

describe("lastNonEmptyLine", () => {
  it("returns the last line with non-whitespace content", () => {
    expect(lastNonEmptyLine("foo\nbar\n   \n")).toBe("bar");
  });

  it("returns an empty string when input is blank", () => {
    expect(lastNonEmptyLine("   \n\n")).toBe("");
  });
});

describe("classifyOnData", () => {
  const baseTime = 1_000_000;

  it("marks output as active when no error tokens are present", () => {
    const r = classifyOnData({
      tail: "",
      incoming: "hello",
      now: baseTime,
      errorUntil: 0,
    });
    expect(r.activity).toBe("active");
    expect(r.errorUntil).toBe(0);
    expect(r.tail).toBe("hello");
  });

  it("trips the error state on an error keyword in the tail", () => {
    const r = classifyOnData({
      tail: "",
      incoming: "build failed at step 3",
      now: baseTime,
      errorUntil: 0,
    });
    expect(r.activity).toBe("error");
    expect(r.errorUntil).toBeGreaterThan(baseTime);
  });

  it("trips the error state on a red ANSI sequence even without keywords", () => {
    const r = classifyOnData({
      tail: "",
      incoming: "\x1b[31msomething\x1b[0m",
      now: baseTime,
      errorUntil: 0,
    });
    expect(r.activity).toBe("error");
  });

  it("stays in error while the sticky window is open", () => {
    const r = classifyOnData({
      tail: "",
      incoming: "all good now",
      now: baseTime,
      errorUntil: baseTime + 1000,
    });
    expect(r.activity).toBe("error");
    expect(r.errorUntil).toBe(baseTime + 1000);
  });
});

describe("classifyOnIdle", () => {
  const now = 1_000_000;

  it("returns null when no data has been seen yet", () => {
    expect(
      classifyOnIdle({ tail: "", lastDataAt: 0, errorUntil: 0, now }),
    ).toBeNull();
  });

  it("returns error when the sticky window is still open", () => {
    expect(
      classifyOnIdle({
        tail: "ok",
        lastDataAt: now - 500,
        errorUntil: now + 1,
        now,
      }),
    ).toBe("error");
  });

  it("returns active for very recent data", () => {
    expect(
      classifyOnIdle({
        tail: "running",
        lastDataAt: now - 200,
        errorUntil: 0,
        now,
      }),
    ).toBe("active");
  });

  it("returns question when the last non-empty line ends with '?'", () => {
    expect(
      classifyOnIdle({
        tail: "Are you sure?",
        lastDataAt: now - 2000,
        errorUntil: 0,
        now,
      }),
    ).toBe("question");
  });

  it("returns done after the long-idle window", () => {
    expect(
      classifyOnIdle({
        tail: "All good.",
        lastDataAt: now - 5000,
        errorUntil: 0,
        now,
      }),
    ).toBe("done");
  });

  it("returns active in the medium-idle window without a question mark", () => {
    expect(
      classifyOnIdle({
        tail: "Still going",
        lastDataAt: now - 2000,
        errorUntil: 0,
        now,
      }),
    ).toBe("active");
  });
});
