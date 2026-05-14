import type { CellCount } from "./settings";

export type LayoutTemplate = {
  columns: string;
  rows: string;
  areas: string;
};

export type Layout = {
  id: string;
  label: string;
  cellCount: CellCount;
  template: LayoutTemplate;
  areaNames: string[];
  preview: string;
};
