import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  defaultLayoutFor,
  findLayout,
  layoutsForCount,
} from "./layouts";

describe("layoutsForCount", () => {
  it("returns only layouts matching the given cell count", () => {
    for (const count of [1, 2, 3, 4] as const) {
      const out = layoutsForCount(count);
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((l) => l.cellCount === count)).toBe(true);
    }
  });

  it("returns an empty list for unsupported counts", () => {
    expect(layoutsForCount(0)).toEqual([]);
    expect(layoutsForCount(5)).toEqual([]);
  });
});

describe("defaultLayoutFor", () => {
  it("returns the documented default per count", () => {
    expect(defaultLayoutFor(1).id).toBe("1-full");
    expect(defaultLayoutFor(2).id).toBe("2-h");
    expect(defaultLayoutFor(3).id).toBe("3-2top-1bot");
    expect(defaultLayoutFor(4).id).toBe("4-grid");
  });

  it("falls back to a stable layout for unknown counts", () => {
    expect(defaultLayoutFor(99).id).toBe(LAYOUTS[0].id);
  });
});

describe("findLayout", () => {
  it("returns the matching layout when id + count match", () => {
    expect(findLayout("2-v", 2).id).toBe("2-v");
    expect(findLayout("3-rows", 3).id).toBe("3-rows");
  });

  it("falls back to the default for the count when id is null", () => {
    expect(findLayout(null, 2).id).toBe("2-h");
  });

  it("falls back when id is valid but does not match the count", () => {
    expect(findLayout("4-grid", 2).id).toBe("2-h");
  });

  it("falls back when id is unknown", () => {
    expect(findLayout("not-a-real-id", 3).id).toBe("3-2top-1bot");
  });
});

describe("LAYOUTS catalog", () => {
  it("has unique ids", () => {
    const ids = LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares areaNames matching cellCount for every layout", () => {
    for (const layout of LAYOUTS) {
      expect(layout.areaNames.length).toBe(layout.cellCount);
    }
  });
});
