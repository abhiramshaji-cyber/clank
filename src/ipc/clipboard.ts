import {
  readText as pluginReadText,
  writeText as pluginWriteText,
} from "@tauri-apps/plugin-clipboard-manager";

export const readClipboardText = (): Promise<string> =>
  pluginReadText().then((t) => t ?? "");

export const writeClipboardText = (s: string): Promise<void> =>
  pluginWriteText(s);
