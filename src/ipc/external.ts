import { invoke } from "@tauri-apps/api/core";
import type { ExternalApp } from "../types";

export const openExternal = (cwd: string, app: ExternalApp): Promise<void> =>
  invoke<void>("open_external", { cwd, app });
