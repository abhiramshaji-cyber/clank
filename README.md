# Clank

A multi-terminal command centre desktop app for running up to four CLI agents
(Claude Code, Codex, anything) side-by-side, with a per-cell markdown task
list and quick access to the editor and notes.

Named after the little robot in Ratchet & Clank — green eyes, grey body, that
vibe.

## Quickstart

Prerequisites: Rust (`rustup`), Node ≥ 20, pnpm.

```sh
pnpm install
pnpm tauri dev          # dev with HMR (frontend) + cargo watch (backend)
pnpm tauri build        # release .app / .dmg
pnpm test               # Vitest suite (frontend stores + pure helpers)
```

First launch shows the onboarding page. Set your notes folder, projects folder,
optional projects prefix, optional **project subpath** (e.g.
`apps/bot` — Clank will populate the launch form with the deeper path
when it exists), and default cell count. Use the ⚙ gear icon in the header to
revisit these later.

## What lives where

- `src/` — Vite + React + TypeScript frontend
- `src-tauri/` — Rust backend (Tauri v2, portable-pty for PTY hosting)
- `docs/` — architecture + design notes
- `CLAUDE.md` — context for future Claude Code sessions

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full architectural
breakdown.

## Stack

| Layer        | Choice                                     |
| ------------ | ------------------------------------------ |
| Desktop      | Tauri v2 (Rust core, WebView frontend)     |
| Frontend     | Vite + React 19 + TypeScript (strict mode) |
| Terminal     | xterm.js + `@xterm/addon-fit`              |
| PTY backend  | `portable-pty` (cross-platform PTY in Rust) |
| State        | zustand                                    |
| Styling      | Tailwind v3                                |
| Markdown     | regex parser for task lines                |
| Persistence  | localStorage (frontend) + filesystem (Rust) |

## Features

- 1 / 2 / 3 / 4 cells with multiple layout presets per count (e.g. 3 = `2 top · 1 bottom`, `1 left · 2 right`, `3 columns`, etc.)
- `⠿` drag handle to swap any two cells; layout slots stay fixed, cells move between them
- Per-cell launch form: working-dir dropdown auto-populated from your projects + notes folders, command picker (claude / codex / zed / adk / zsh / bash), args list with `+` button + dropdown of common flags, optional tasks-file picker
- Presets: claude, claude (yolo), claude --continue, codex, zsh, zed, adk dev --logs, adk chat
- Activity-coloured borders: orange = streaming, red = error keywords, green = idle / asking
- Blue overlay = focused cell (independent of activity colour)
- Tasks sidebar reads `- [ ]` / `- [x]` lines from a markdown file; toggling writes back
- "Open in Zed" / "Open in Obsidian" buttons under each task list (uses `open -a` on macOS)
- Restart, stop (SIGINT → SIGKILL after 2s), zoom (3 font sizes), per-cell collapse of tasks sidebar
- Force-restart cleans up the old PTY transparently — no `cell already running` errors

## Keyboard shortcuts

Cmd-prefix global shortcuts win over xterm. Ctrl is left to the inner CLI
(claude, codex). The full table also renders inside the settings page, sourced
from the same `BINDINGS` declaration so it never drifts.

| Shortcut | Action |
| --- | --- |
| `⌘1` – `⌘4` | Focus cell N |
| `⌘]` / `⌘[` | Cycle focus forward / backward |
| `⌘⇧1` – `⌘⇧4` | Set visible cell count (prompts before dropping live cells) |
| `⌘.` | Stop focused cell |
| `⌘R` | Restart focused cell |
| `⌘E` | Edit config (focused cell must have exited) |
| `⌘⌫` | Remove focused cell (when more than one is visible) |
| `⌘,` | Toggle settings |
| `⌘B` | Toggle the tasks sidebar |
| `⌘=` / `⌘+` / `⌘−` | Cycle font size up / down |
| `⌘0` | Reset font size to 14 px |
| `⌘K` | Clear focused terminal |
| `⌘F` | Find in focused terminal |
| `⌘G` | Next search match (while search is open) |
| `Esc` | Close search bar |
| `⌘C` | Copy selection (xterm) |
| `⌘V` | Paste — reads via Tauri clipboard plugin, writes to PTY |

## Distribution

`pnpm tauri build` produces an unsigned `.dmg` at
`src-tauri/target/release/bundle/dmg/`. Teammates need to right-click → Open
on first launch (Gatekeeper).
