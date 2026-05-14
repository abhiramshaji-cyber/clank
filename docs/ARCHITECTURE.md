# Clank Architecture

Companion to the top-level [`README.md`](../README.md). Describes how Clank is
put together so a fresh contributor (or fresh Claude session) can navigate the
code.

## Process model

```
┌─────────────────────────────────────────────────────────┐
│  Clank.app (single window)                              │
│                                                         │
│  ┌────────────────── WebView ───────────────────┐       │
│  │  Vite + React + TypeScript                   │       │
│  │  • CellGrid (CSS-grid layouts)               │       │
│  │  • Cell (header + Terminal | LaunchForm | …) │       │
│  │  • LayoutPicker, Onboarding, TaskSidebar     │       │
│  │  • zustand stores: cells, settings           │       │
│  └────────────┬─────────────────────────┬───────┘       │
│               │ Tauri invoke + events   │               │
│  ┌────────────┴─────────────────────────┴───────┐       │
│  │  Rust core (Tauri v2)                        │       │
│  │  • portable-pty PTY host (pty.rs)            │       │
│  │  • dir scanner (dirs.rs)                     │       │
│  │  • external launcher (external.rs)           │       │
│  │  • plugin: dialog, fs, log                   │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

There is no Node sidecar. Every cell is a raw PTY running whatever binary the
user picked — `claude`, `codex`, `zsh`, anything. The Claude Agent SDK is *not*
used (deferred to a future hybrid mode; see "Future work").

## Source tree

```
src/
├── App.tsx                         # routes between Onboarding and CellGrid, mounts useHotkeys
├── main.tsx                        # React root
├── index.css                       # Tailwind base + global styles
├── components/
│   ├── CellGrid.tsx                # CSS-grid layout driver
│   ├── Cell.tsx                    # one cell: header + body + focus overlay
│   ├── CellHeader.tsx              # drag handle, status dot, buttons
│   ├── LayoutPicker.tsx            # dropdown of layouts for current count
│   ├── LaunchForm.tsx              # idle-cell form: cwd, command, args, tasks
│   ├── SearchBar.tsx               # floating xterm search input
│   ├── Terminal.tsx                # xterm.js + pty IPC, drives activity classifier
│   ├── activity.ts                 # pure helpers: classifyOnData / classifyOnIdle
│   └── TaskSidebar.tsx             # markdown checkbox list + Open in Zed/Obsidian
├── hooks/
│   ├── useHotkeys.ts               # window-level Cmd-prefix keydown listener
│   └── hotkeyDispatch.ts           # action → side effects (FSM, ptyKill, clipboard)
├── routes/
│   └── Onboarding.tsx              # one-page settings wizard + Keyboard shortcuts section
├── state/
│   ├── cells.ts                    # zustand: cells, visibleIds, layout, drag, focus, searchOpen
│   ├── cellMachine.ts              # pure per-cell FSM (idle/spawning/running/stopping/exited)
│   ├── appMachine.ts               # zustand + pure FSM: onboarding ↔ ready, shrink-confirm
│   ├── hotkeys.ts                  # BINDINGS table + pure keyEventToAction mapper
│   ├── settings.ts                 # zustand: onboarding + paths + projectsSubpath
│   ├── layouts.ts                  # layout preset library
│   └── terminalRegistry.ts         # imperative xterm handle map (clear, search next/prev)
├── ipc/                            # typed wrappers around Tauri invoke/listen
│   ├── clipboard.ts                # plugin-clipboard-manager wrapper (paste fix)
│   ├── pty.ts
│   ├── dirs.ts
│   ├── tasks.ts                    # tasks read/parse/toggle (uses fs plugin)
│   └── external.ts
└── types/                          # all shared types (strict mode)
    ├── cells.ts                    # CellStatus, CellConfig, ActivityState, CellState
    ├── hotkeys.ts                  # HotkeyAction, HotkeyBinding, HotkeyContext, HotkeyEventLike
    ├── settings.ts                 # Settings, CellCount
    ├── layouts.ts                  # Layout, LayoutTemplate
    ├── pty.ts                      # PtyDataEvent, PtyExitEvent, PtySignal
    ├── tasks.ts                    # TaskLine
    ├── dirs.ts                     # WorkingDirOption, WorkingDirSource
    ├── external.ts                 # ExternalApp
    └── index.ts                    # barrel re-export

src-tauri/
├── tauri.conf.json                 # window, bundle id (com.clank.app), capabilities
├── capabilities/default.json       # plugin permissions
└── src/
    ├── main.rs                     # entry, calls lib::run()
    ├── lib.rs                      # builder, plugin init, invoke handler list
    ├── pty.rs                      # PTY host (portable-pty + reader threads)
    ├── dirs.rs                     # scan_working_dirs command
    └── external.rs                 # open_external command (open -a)
```

## IPC contract

### Tauri commands (frontend → Rust)

| Command              | Args                                          | Returns                 |
| -------------------- | --------------------------------------------- | ----------------------- |
| `pty_spawn`          | `cellId, cwd, command, args[]`                | `()` or error string    |
| `pty_write`          | `cellId, data`                                | `()`                    |
| `pty_resize`         | `cellId, cols, rows`                          | `()`                    |
| `pty_kill`           | `cellId, signal: "SIGINT" \| "SIGKILL"`       | `()`                    |
| `scan_working_dirs`  | `projectsDir, notesDir, projectsPrefix, projectsSubpath` | `WorkingDirOption[]` |
| `open_external`      | `cwd, app: "zed" \| "obsidian" \| "cursor" \| "code"` | `()`            |

Tauri v2 converts camelCase JS keys to snake_case Rust params automatically.

### Events (Rust → frontend)

| Event       | Payload                              | Notes                                          |
| ----------- | ------------------------------------ | ---------------------------------------------- |
| `pty:data`  | `{ cellId, data }` (UTF-8 string)    | Emitted per ~4 KB chunk from PTY reader thread |
| `pty:exit`  | `{ cellId, exitCode: number \| null }` | Emitted once per cell when child exits          |

Listeners are global; each `Terminal` filters by `cellId === props.cellId` to
avoid cross-talk.

## PTY host (`pty.rs`)

- One reader `std::thread` per PTY, blocking on `master.read()`
- Registry: `Lazy<Mutex<HashMap<String, CellHandle>>>` keyed by `cellId`
- Each `CellHandle` holds: master (for resize), writer (for stdin), child (for kill), `stop_flag`, `suppress_exit`, and a `generation` u64
- On force-restart (re-spawning into a `cellId` already in the registry):
  1. The old handle is removed from the registry first
  2. `suppress_exit` is set to true so the old reader thread stays silent
  3. Old child is killed; old reader will see EOF and wind down on its own
  4. New PTY spawns immediately with a fresh `generation`
  5. The dying old reader's final `CELLS.lock().remove()` is a no-op (entry already gone)
- The `generation` marker prevents an old reader from evicting a newer PTY that
  happens to reuse the same `cellId`

## Activity-state heuristic (`components/activity.ts`)

`Terminal.tsx` drives a small pure module (`activity.ts`) that classifies cells
between `active / error / question / done / none` based on raw terminal output:

- `active` — any data received in the last 1.5s
- `error` — ANSI red sequences in last chunk OR `error|failed|exception|traceback|fatal|panic` in last ~800 chars of stripped output; sticky for 10s
- `question` — idle ≥1.5s and last visible (stripped) line ends with `?`
- `done` — idle ≥3s (and not a question)
- `none` — no data yet

`classifyOnData` and `classifyOnIdle` are pure — `Terminal.tsx` just feeds them
the tail buffer + timestamps and applies the returned activity. Heuristics and
constants (`TAIL_CHARS`, `ERROR_STICKY_MS`, etc.) live in `activity.ts` so they
can be unit-tested.

This is intentionally a heuristic. The "correct" version requires structured
SDK events (see Future work).

## State machines

Two hand-rolled finite-state machines drive Clank's UX. Both live in
`src/state/` as pure modules (`transitionCell`, `transitionApp`) plus a thin
zustand wrapper that exposes a `dispatch()` action. Pure transitions mean
every edge is unit-tested in `*.test.ts` next to the module.

### Per-cell FSM (`state/cellMachine.ts`)

States (see the `CellProcess` discriminated union in `src/types/cells.ts`):

```
idle ──LAUNCH──→ spawning ──SPAWN_SUCCEEDED──→ running
                  │                              │
                  │SPAWN_FAILED                  │REQUEST_STOP        ┌──RESET──┐
                  ▼                              ▼                    ▼         │
              exited ◀─PROCESS_EXITED── stopping ──FORCE_KILL──→ exited ────────┘
                  │                                                  │
                  └────────────────LAUNCH (relaunch)────────────────→ spawning
{any state} ──REMOVED──→ idle (config preserved)
```

Key invariants:

- Config travels with the state — `running.config` is required, `idle.config` is nullable.
- `transitionCell` is total: invalid (state, event) pairs return the same state.
- The store's `dispatchCell(id, event)` calls `transitionCell` then resets `activity` when leaving live states.
- PTY side effects (`ptySpawn`, `ptyKill`) are the **caller's** job — `Cell.tsx` runs them from its `useEffect` based on the new state.

### App FSM (`state/appMachine.ts`)

```
onboarding(first)   ──COMPLETE_ONBOARDING──→ ready
ready               ──OPEN_SETTINGS────────→ onboarding(revisit)
onboarding(revisit) ──CLOSE_SETTINGS───────→ ready
onboarding(*)       ──REQUEST_SHRINK_CONFIRM(atRisk)──→ onboarding(* | pendingShrink)
onboarding(pending) ──CANCEL_SHRINK──→ onboarding(no pending)
onboarding(pending) ──CONFIRM_SHRINK──→ ready
```

The `pendingShrink` payload (`{ newCount, atRisk: string[] }`) carries which
live cells the user is about to drop. `Onboarding.tsx` reads it from
`useAppMachine`, renders the confirm dialog, and `Cell.tsx` is not involved.

## Layout system

- `state/layouts.ts` exports `LAYOUTS: Layout[]` — preset library
- Each `Layout` declares `cellCount: 1|2|3|4`, a CSS grid `{columns, rows, areas}` template, and an `areaNames` array matching `cellCount`
- `CellGrid` reads `visibleIds[]` from the cells store. `visibleIds[i]` is placed into `areaNames[i]`.
- Drag-to-swap (`Cell.tsx` + `CellHeader.tsx`) swaps positions in `visibleIds`; CSS grid handles the visual move. xterm instances are keyed by `cellId` so they don't unmount during a swap.

Defaults per count: 1=full, 2=side-by-side, 3=`2 top · 1 bottom`, 4=2×2 grid.

## Settings + onboarding

- Single-page form (`routes/Onboarding.tsx`); the form's mode and shrink-confirm overlay are read from the app FSM, not local component state.
- Persisted to localStorage under `clank:settings`. Fields: `onboarded`, `notesDir`, `projectsDir`, `projectsPrefix`, `projectsSubpath`, `defaultCellCount`.
- ⚙ gear in app header dispatches `OPEN_SETTINGS`; the FSM flips to `onboarding(revisit)` without resetting `onboarded`.
- `projectsSubpath` (e.g. `apps/bot`) is appended to each matched project path *if it exists on disk*, else the bare project dir is used. Lets you keep "one project root per client" while populating the launch form with the deeper code dir.

## Persistence

| Key                            | Where    | Contents                                    |
| ------------------------------ | -------- | ------------------------------------------- |
| `clank:settings`               | localStorage | `Settings` (paths, prefix, subpath, default count, onboarded) |
| `clank:cell:cell-1` (…cell-4)  | localStorage | Per-cell: last `config`, `fontSize`, `taskSidebarCollapsed` |
| `clank:visible-cells`          | localStorage | Ordered `visibleIds[]`                      |
| `clank:selected-layout`        | localStorage | Currently selected layout id                |

Tauri-side state (`CELLS` registry) is in-memory only. App close kills all PTYs
because the children are descendants of the app process.

## Strict TypeScript

`tsconfig.app.json` has `"strict": true` plus `noUnusedLocals` and
`noUnusedParameters`. No `any` types anywhere in `src/`. All shared types
live in `src/types/` and are imported via `import type { ... } from "../types"`.
Test files (`src/**/*.test.ts`) are excluded from the production build.

## Testing

`pnpm test` runs Vitest in jsdom mode. Coverage is intentionally focused on
non-React surface area:

- `state/cellMachine.ts` — per-cell FSM transition table (every edge)
- `state/appMachine.ts` — top-level FSM (onboarding / shrink-confirm)
- `state/cells.ts`, `state/settings.ts`, `state/layouts.ts` — store integration + helpers
- `ipc/tasks.ts::parseTasks` — markdown task parser
- `components/activity.ts` — pure activity classifier

Component-level tests are deferred; the React layer is thin glue around the
two FSMs and the stores tested above.

## Future work (deferred)

- Hybrid SDK chat cells (per the original planning doc) — needs API key and a Node sidecar
- ADK port allocator + custom `clank-test` MCP for cross-bot testing
- Resizable splitter bars between cells (current splits are fixed by layout preset)
- Settings page diagnostic: live "rescan" button + listing of which subdirs matched the prefix
- Code signing + notarization for distribution beyond hand-delivered DMGs
