import type { Layout } from "../types";

export const LAYOUTS: Layout[] = [
  // 1 cell
  {
    id: "1-full",
    label: "Full",
    cellCount: 1,
    template: { columns: "1fr", rows: "1fr", areas: `"a"` },
    areaNames: ["a"],
    preview: "▢",
  },

  // 2 cells
  {
    id: "2-h",
    label: "Side by side",
    cellCount: 2,
    template: { columns: "1fr 1fr", rows: "1fr", areas: `"a b"` },
    areaNames: ["a", "b"],
    preview: "▢ ▢",
  },
  {
    id: "2-v",
    label: "Stacked",
    cellCount: 2,
    template: { columns: "1fr", rows: "1fr 1fr", areas: `"a" "b"` },
    areaNames: ["a", "b"],
    preview: "▢ / ▢",
  },

  // 3 cells
  {
    id: "3-2top-1bot",
    label: "2 top · 1 bottom",
    cellCount: 3,
    template: {
      columns: "1fr 1fr",
      rows: "1fr 1fr",
      areas: `"a b" "c c"`,
    },
    areaNames: ["a", "b", "c"],
    preview: "▢▢ / ▢▢",
  },
  {
    id: "3-1top-2bot",
    label: "1 top · 2 bottom",
    cellCount: 3,
    template: {
      columns: "1fr 1fr",
      rows: "1fr 1fr",
      areas: `"a a" "b c"`,
    },
    areaNames: ["a", "b", "c"],
    preview: "▢▢ / ▢▢",
  },
  {
    id: "3-1left-2right",
    label: "1 left · 2 right",
    cellCount: 3,
    template: {
      columns: "1fr 1fr",
      rows: "1fr 1fr",
      areas: `"a b" "a c"`,
    },
    areaNames: ["a", "b", "c"],
    preview: "▢▢ / ▢▢",
  },
  {
    id: "3-cols",
    label: "3 columns",
    cellCount: 3,
    template: { columns: "1fr 1fr 1fr", rows: "1fr", areas: `"a b c"` },
    areaNames: ["a", "b", "c"],
    preview: "▢▢▢",
  },
  {
    id: "3-rows",
    label: "3 rows",
    cellCount: 3,
    template: { columns: "1fr", rows: "1fr 1fr 1fr", areas: `"a" "b" "c"` },
    areaNames: ["a", "b", "c"],
    preview: "▢/▢/▢",
  },

  // 4 cells
  {
    id: "4-grid",
    label: "2 × 2 grid",
    cellCount: 4,
    template: { columns: "1fr 1fr", rows: "1fr 1fr", areas: `"a b" "c d"` },
    areaNames: ["a", "b", "c", "d"],
    preview: "▢▢ / ▢▢",
  },
  {
    id: "4-1top-3bot",
    label: "1 top · 3 bottom",
    cellCount: 4,
    template: {
      columns: "1fr 1fr 1fr",
      rows: "1fr 1fr",
      areas: `"a a a" "b c d"`,
    },
    areaNames: ["a", "b", "c", "d"],
    preview: "▢▢▢ / ▢▢▢",
  },
  {
    id: "4-1left-3right",
    label: "1 left · 3 right",
    cellCount: 4,
    template: {
      columns: "1fr 2fr",
      rows: "1fr 1fr 1fr",
      areas: `"a b" "a c" "a d"`,
    },
    areaNames: ["a", "b", "c", "d"],
    preview: "▢|▢▢▢",
  },
  {
    id: "4-cols",
    label: "4 columns",
    cellCount: 4,
    template: { columns: "1fr 1fr 1fr 1fr", rows: "1fr", areas: `"a b c d"` },
    areaNames: ["a", "b", "c", "d"],
    preview: "▢▢▢▢",
  },
  {
    id: "4-rows",
    label: "4 rows",
    cellCount: 4,
    template: {
      columns: "1fr",
      rows: "1fr 1fr 1fr 1fr",
      areas: `"a" "b" "c" "d"`,
    },
    areaNames: ["a", "b", "c", "d"],
    preview: "▢/▢/▢/▢",
  },
];

const DEFAULT_BY_COUNT: Record<number, string> = {
  1: "1-full",
  2: "2-h",
  3: "3-2top-1bot",
  4: "4-grid",
};

export function layoutsForCount(count: number): Layout[] {
  return LAYOUTS.filter((l) => l.cellCount === count);
}

export function defaultLayoutFor(count: number): Layout {
  const id = DEFAULT_BY_COUNT[count] ?? "1-full";
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export function findLayout(id: string | null, count: number): Layout {
  if (id) {
    const found = LAYOUTS.find((l) => l.id === id && l.cellCount === count);
    if (found) return found;
  }
  return defaultLayoutFor(count);
}
