import { Cell } from "./Cell";
import { useCells } from "../state/cells";
import { findLayout } from "../state/layouts";

export function CellGrid() {
  const visibleIds = useCells((s) => s.visibleIds);
  const selectedLayoutId = useCells((s) => s.selectedLayoutId);
  const layout = findLayout(selectedLayoutId, visibleIds.length);

  return (
    <div
      className="grid gap-px bg-neutral-800 h-full w-full"
      style={{
        gridTemplateColumns: layout.template.columns,
        gridTemplateRows: layout.template.rows,
        gridTemplateAreas: layout.template.areas,
      }}
    >
      {visibleIds.map((id, idx) => {
        const area = layout.areaNames[idx];
        return (
          <div key={id} style={{ gridArea: area, minWidth: 0, minHeight: 0 }}>
            <Cell cellId={id} />
          </div>
        );
      })}
    </div>
  );
}
