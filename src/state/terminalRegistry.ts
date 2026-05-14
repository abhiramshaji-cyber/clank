/**
 * Module-level registry of live xterm instances, keyed by cellId. Imperative
 * by design: xterm.js exposes its methods (`clear`, search addon, …) as plain
 * function calls — they're not reactive state and so don't belong in zustand.
 *
 * `Terminal.tsx` registers/unregisters on mount/unmount; the hotkey dispatcher
 * looks up a handle here when the user fires a content-action shortcut.
 */
export type TerminalApi = {
  clear: () => void;
  searchNext: (query: string) => void;
  searchPrevious: (query: string) => void;
};

const registry = new Map<string, TerminalApi>();

export const registerTerminal = (cellId: string, api: TerminalApi): void => {
  registry.set(cellId, api);
};

export const unregisterTerminal = (cellId: string): void => {
  registry.delete(cellId);
};

export const getTerminal = (cellId: string): TerminalApi | undefined =>
  registry.get(cellId);
