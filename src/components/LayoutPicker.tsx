import { useState } from "react";
import { useCells } from "../state/cells";
import { layoutsForCount, findLayout } from "../state/layouts";

export function LayoutPicker() {
  const [open, setOpen] = useState(false);
  const visibleCount = useCells((s) => s.visibleIds.length);
  const selectedLayoutId = useCells((s) => s.selectedLayoutId);
  const setLayout = useCells((s) => s.setLayout);

  const options = layoutsForCount(visibleCount);
  const current = findLayout(selectedLayoutId, visibleCount);

  if (options.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-0.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded text-xs"
        title={`Layout: ${current.label}`}
      >
        {current.preview}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-neutral-900 border border-neutral-700 rounded shadow-lg min-w-[180px]">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setLayout(opt.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-800 flex items-center gap-3 ${
                  opt.id === current.id
                    ? "text-green-300"
                    : "text-neutral-300"
                }`}
              >
                <span className="w-12 text-neutral-500 font-mono">{opt.preview}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
