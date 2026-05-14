import { useEffect } from "react";
import { CellGrid } from "./components/CellGrid";
import { LayoutPicker } from "./components/LayoutPicker";
import { Onboarding } from "./routes/Onboarding";
import { useSettings } from "./state/settings";
import { useCells, MAX_CELLS } from "./state/cells";
import { useAppMachine } from "./state/appMachine";
import { useHotkeys } from "./hooks/useHotkeys";

export default function App() {
  useHotkeys();
  const onboarded = useSettings((s) => s.onboarded);
  const defaultCount = useSettings((s) => s.defaultCellCount);
  const visibleIds = useCells((s) => s.visibleIds);
  const addCell = useCells((s) => s.addCell);
  const setVisibleCount = useCells((s) => s.setVisibleCount);
  const appState = useAppMachine((s) => s.state);
  const dispatchApp = useAppMachine((s) => s.dispatch);

  useEffect(() => {
    if (!onboarded) return;
    const raw = localStorage.getItem("clank:visible-cells");
    if (!raw) setVisibleCount(defaultCount);
  }, [onboarded, defaultCount, setVisibleCount]);

  if (appState.kind === "onboarding") {
    return <Onboarding />;
  }

  return (
    <div className="h-full w-full flex flex-col">
      <header className="h-10 shrink-0 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-200 text-sm">Clank</span>
        <span className="ml-2 text-neutral-600">command centre</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-neutral-600 mr-1">
            {visibleIds.length} / {MAX_CELLS} cells
          </span>
          <LayoutPicker />
          <button
            onClick={addCell}
            disabled={visibleIds.length >= MAX_CELLS}
            className="px-2.5 py-1 text-base text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 disabled:text-neutral-700 disabled:cursor-not-allowed rounded"
            title="Add cell"
          >
            +
          </button>
          <button
            onClick={() => dispatchApp({ type: "OPEN_SETTINGS" })}
            className="px-2.5 py-1 text-lg text-neutral-300 hover:text-green-400 hover:bg-neutral-800 rounded"
            title="Settings"
          >
            ⚙
          </button>
        </span>
      </header>
      <main className="flex-1 overflow-hidden">
        <CellGrid />
      </main>
    </div>
  );
}
