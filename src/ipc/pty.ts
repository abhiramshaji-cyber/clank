import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { PtyDataEvent, PtyExitEvent, PtySignal } from "../types";

export const ptySpawn = (
  cellId: string,
  cwd: string,
  command: string,
  args: string[],
): Promise<void> =>
  invoke<void>("pty_spawn", { cellId, cwd, command, args });

export const ptyWrite = (cellId: string, data: string): Promise<void> =>
  invoke<void>("pty_write", { cellId, data });

export const ptyResize = (
  cellId: string,
  cols: number,
  rows: number,
): Promise<void> => invoke<void>("pty_resize", { cellId, cols, rows });

export const ptyKill = (cellId: string, signal: PtySignal): Promise<void> =>
  invoke<void>("pty_kill", { cellId, signal });

export const onPtyData = (
  cb: (e: PtyDataEvent) => void,
): Promise<UnlistenFn> =>
  listen<PtyDataEvent>("pty:data", (ev) => cb(ev.payload));

export const onPtyExit = (
  cb: (e: PtyExitEvent) => void,
): Promise<UnlistenFn> =>
  listen<PtyExitEvent>("pty:exit", (ev) => cb(ev.payload));
