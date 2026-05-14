import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettings } from "../state/settings";
import { droppedRunningIfShrinkTo, useCells } from "../state/cells";
import { useAppMachine } from "../state/appMachine";
import { BINDINGS } from "../state/hotkeys";
import { ptyKill } from "../ipc/pty";
import type { CellCount, HotkeyBinding, HotkeyGroup } from "../types";

export function Onboarding() {
  const settings = useSettings();
  const appState = useAppMachine((s) => s.state);
  const dispatchApp = useAppMachine((s) => s.dispatch);

  const [notesDir, setNotesDir] = useState(settings.notesDir);
  const [projectsDir, setProjectsDir] = useState(settings.projectsDir);
  const [projectsPrefix, setProjectsPrefix] = useState(settings.projectsPrefix);
  const [projectsSubpath, setProjectsSubpath] = useState(
    settings.projectsSubpath,
  );
  const [count, setCount] = useState<CellCount>(settings.defaultCellCount);

  // Onboarding only ever renders while appState.kind === "onboarding"; this
  // guard keeps TS narrow.
  if (appState.kind !== "onboarding") return null;
  const { mode, pendingShrink } = appState;
  const isRevisit = mode === "revisit";

  const pickDir = async (setter: (v: string) => void) => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setter(picked);
  };

  const canSave = !!notesDir.trim() && !!projectsDir.trim();

  const persistAndApplyCount = (nextCount: CellCount) => {
    settings.setNotesDir(notesDir.trim());
    settings.setProjectsDir(projectsDir.trim());
    settings.setProjectsPrefix(projectsPrefix.trim());
    settings.setProjectsSubpath(projectsSubpath.trim());
    settings.setDefaultCellCount(nextCount);
    if (!settings.onboarded) settings.finishOnboarding();

    const cellsState = useCells.getState();
    if (cellsState.visibleIds.length !== nextCount) {
      cellsState.setVisibleCount(nextCount);
    }
    dispatchApp({ type: "COMPLETE_ONBOARDING" });
  };

  const save = () => {
    if (!canSave) return;

    const cellsState = useCells.getState();
    const atRisk = droppedRunningIfShrinkTo(
      cellsState.visibleIds,
      cellsState.cells,
      count,
    );

    if (atRisk.length > 0) {
      dispatchApp({
        type: "REQUEST_SHRINK_CONFIRM",
        newCount: count,
        atRisk,
      });
      return;
    }
    persistAndApplyCount(count);
  };

  const confirmShrink = () => {
    const targetCount = pendingShrink?.newCount ?? count;
    const atRisk = pendingShrink?.atRisk ?? [];
    for (const id of atRisk) {
      ptyKill(id, "SIGKILL").catch(() => {});
    }
    dispatchApp({ type: "CONFIRM_SHRINK" });
    persistAndApplyCount(targetCount);
  };

  return (
    <div className="h-full w-full flex flex-col bg-neutral-900 text-neutral-200">
      <header className="h-9 shrink-0 border-b border-neutral-800 flex items-center px-3 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-200">Clank</span>
        <span className="ml-2 text-neutral-600">
          {isRevisit ? "settings" : "first-time setup"}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
          {!isRevisit && (
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold">Welcome to Clank</h1>
              <p className="text-neutral-400 text-sm leading-relaxed">
                A command centre for running up to four terminal agents (Claude
                Code, Codex, anything) side-by-side, with a markdown task list
                per cell.
              </p>
            </div>
          )}

          <Section
            title="Notes directory"
            hint="Folder containing your markdown notes. Clank reads `- [ ]` / `- [x]` task lines from a file you pick per cell."
          >
            <div className="flex gap-1">
              <input
                value={notesDir}
                onChange={(e) => setNotesDir(e.target.value)}
                placeholder="/Users/you/obsidian/notes"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-100 outline-none focus:border-green-600"
              />
              <button
                onClick={() => pickDir(setNotesDir)}
                className="px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300"
              >
                Browse…
              </button>
            </div>
          </Section>

          <Section
            title="Projects directory"
            hint="Top-level folder containing project subdirectories. Its children populate the working-directory dropdown so you can pick a project in one click."
          >
            <div className="flex gap-1">
              <input
                value={projectsDir}
                onChange={(e) => setProjectsDir(e.target.value)}
                placeholder="/Users/you/code"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-100 outline-none focus:border-green-600"
              />
              <button
                onClick={() => pickDir(setProjectsDir)}
                className="px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300"
              >
                Browse…
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <input
                value={projectsPrefix}
                onChange={(e) => setProjectsPrefix(e.target.value)}
                placeholder="Project name prefix (optional, e.g. myorg-)"
                className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-100 outline-none focus:border-green-600"
              />
              <span className="text-neutral-500 text-xs leading-relaxed">
                Only subdirectories whose name starts with this prefix become
                projects in the dropdown. Leave blank to include every
                subdirectory of the folder above.
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <input
                value={projectsSubpath}
                onChange={(e) => setProjectsSubpath(e.target.value)}
                placeholder="Subpath inside each project (optional, e.g. apps/bot)"
                className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-100 outline-none focus:border-green-600"
              />
              <span className="text-neutral-500 text-xs leading-relaxed">
                If your code lives deeper inside each project (e.g.{" "}
                <span className="font-mono">myorg-X/apps/bot</span>), put the
                inner path here. Clank will populate the launch form with the
                deeper path when it exists, and fall back to the project root
                when it doesn&apos;t.
              </span>
            </div>
          </Section>

          <Section
            title="Default terminal count"
            hint="How many cells appear on app launch. Add or remove cells anytime with the + / × buttons."
          >
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`p-3 border rounded text-center ${
                    count === n
                      ? "border-green-500 bg-green-950/30"
                      : "border-neutral-700 hover:border-neutral-500 bg-neutral-900"
                  }`}
                >
                  <div className="text-2xl font-bold">{n}</div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    {n === 1 && "full"}
                    {n === 2 && "side by side"}
                    {n === 3 && "2 top · 1 bottom"}
                    {n === 4 && "2 × 2 grid"}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <KeyboardShortcutsSection />

          <Section title="How to use Clank">
            <ol className="text-neutral-300 text-sm leading-relaxed list-decimal pl-5 space-y-1.5">
              <li>
                Click an empty cell. Pick a working directory (dropdown shows
                projects + notes subfolders), choose a command, optionally add
                args. Hit <b>Launch</b>.
              </li>
              <li>
                Each cell is a real terminal — claude, codex, zsh, anything.
                Type, scroll, paste like a regular shell.
              </li>
              <li>
                Pick a markdown file in the form to render its checkboxes in
                the right sidebar. Toggling writes back to disk.
              </li>
              <li>
                Header buttons per cell: <b>⠿</b> drag to swap cells, zoom,
                tasks toggle, stop, restart, remove.
              </li>
              <li>
                Borders: <span className="text-neutral-500">neutral</span>{" "}
                idle, <span className="text-orange-400">orange</span> active,{" "}
                <span className="text-green-400">green</span> done/asking,{" "}
                <span className="text-red-400">red</span> error keywords.
                Focused cell shows a blue inner overlay.
              </li>
              <li>
                Use <b>+</b> in the app header to add cells (up to 4); the
                layout button next to it switches presets (3 columns,
                2 top · 1 bottom, etc.).
              </li>
              <li>
                Re-open this page any time from the ⚙ icon in the app header.
              </li>
            </ol>
          </Section>
        </div>
      </div>

      <div className="h-14 shrink-0 border-t border-neutral-800 flex items-center justify-end gap-2 px-4 bg-neutral-900">
        {isRevisit && (
          <button
            onClick={() => dispatchApp({ type: "CLOSE_SETTINGS" })}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </button>
        )}
        <button
          onClick={save}
          disabled={!canSave}
          className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed rounded text-sm font-semibold"
        >
          {isRevisit ? "Save" : "Get started"}
        </button>
      </div>

      {pendingShrink && (
        <ShrinkConfirmDialog
          atRisk={pendingShrink.atRisk}
          newCount={pendingShrink.newCount}
          onCancel={() => dispatchApp({ type: "CANCEL_SHRINK" })}
          onConfirm={confirmShrink}
        />
      )}
    </div>
  );
}

function ShrinkConfirmDialog({
  atRisk,
  newCount,
  onCancel,
  onConfirm,
}: {
  atRisk: string[];
  newCount: CellCount;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded shadow-xl p-4 flex flex-col gap-3">
        <h3 className="text-base font-semibold text-neutral-100">
          Stop running terminals?
        </h3>
        <p className="text-sm text-neutral-300 leading-relaxed">
          Switching to <b>{newCount}</b> {newCount === 1 ? "cell" : "cells"}{" "}
          will drop and stop {atRisk.length}{" "}
          {atRisk.length === 1 ? "terminal" : "terminals"}:
        </p>
        <ul className="text-xs font-mono text-neutral-400 pl-4 list-disc">
          {atRisk.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
          The processes will be force-killed (SIGKILL). This can&apos;t be
          undone.
        </p>
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm font-semibold text-neutral-100"
          >
            Stop and apply
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && (
        <p className="text-neutral-500 text-xs leading-relaxed">{hint}</p>
      )}
      <div>{children}</div>
    </div>
  );
}

const GROUP_ORDER: readonly HotkeyGroup[] = [
  "navigation",
  "lifecycle",
  "view",
  "content",
];
const GROUP_LABEL: Record<HotkeyGroup, string> = {
  navigation: "Navigation",
  lifecycle: "Lifecycle",
  view: "View",
  content: "Content",
};

function KeyboardShortcutsSection() {
  const grouped = useMemo(() => {
    const out: Record<HotkeyGroup, HotkeyBinding[]> = {
      navigation: [],
      lifecycle: [],
      view: [],
      content: [],
    };
    for (const b of BINDINGS) out[b.group].push(b);
    return out;
  }, []);

  return (
    <Section
      title="Keyboard shortcuts"
      hint="All shortcuts use ⌘. Ctrl-prefix is reserved for the inner CLI (claude, codex)."
    >
      <div className="flex flex-col gap-4">
        {GROUP_ORDER.map((group) => (
          <div key={group} className="flex flex-col gap-1.5">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {GROUP_LABEL[group]}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {grouped[group].map((b) => (
                <div key={b.display} className="contents">
                  <kbd className="self-start whitespace-nowrap font-mono text-xs text-green-300 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5">
                    {b.display}
                  </kbd>
                  <span className="text-neutral-300 leading-relaxed">
                    {b.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
