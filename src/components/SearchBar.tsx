import { useEffect, useRef } from "react";
import { useCells } from "../state/cells";
import { getTerminal } from "../state/terminalRegistry";

type Props = { cellId: string };

const DEBOUNCE_MS = 120;

/**
 * Floating search input pinned to the top-right of the terminal area. Talks
 * directly to the registered xterm `TerminalApi` via `terminalRegistry`.
 * The query lives in the cells store so the Cmd+G hotkey can read it.
 *
 * Stops `keydown` propagation while focused so global Cmd-prefix hotkeys
 * don't fire while the user is typing in the box.
 */
export function SearchBar({ cellId }: Props) {
  const closeSearch = useCells((s) => s.closeSearch);
  const setSearchQuery = useCells((s) => s.setSearchQuery);
  const query = useCells((s) => s.searchQuery[cellId] ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [cellId]);

  useEffect(() => {
    if (!query) return;
    const t = window.setTimeout(() => {
      getTerminal(cellId)?.searchNext(query);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [cellId, query]);

  return (
    <div className="absolute top-1 right-2 z-20 flex items-center gap-1 bg-neutral-900/95 border border-neutral-700 rounded shadow px-1.5 py-1">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setSearchQuery(cellId, e.target.value)}
        onKeyDown={(e) => {
          // Don't let global hotkeys fire while typing into the search box.
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            closeSearch(cellId);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (!query) return;
            if (e.shiftKey) getTerminal(cellId)?.searchPrevious(query);
            else getTerminal(cellId)?.searchNext(query);
          }
        }}
        placeholder="search…"
        className="bg-transparent text-xs font-mono text-neutral-100 outline-none placeholder-neutral-600 w-40"
      />
      <button
        onClick={() => closeSearch(cellId)}
        className="text-neutral-500 hover:text-neutral-200 text-xs px-1"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
