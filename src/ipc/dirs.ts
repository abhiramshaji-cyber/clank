import { invoke } from "@tauri-apps/api/core";
import type { WorkingDirOption } from "../types";

export const scanWorkingDirs = (
  projectsDir: string,
  notesDir: string,
  projectsPrefix: string,
  projectsSubpath: string,
): Promise<WorkingDirOption[]> =>
  invoke<WorkingDirOption[]>("scan_working_dirs", {
    projectsDir,
    notesDir,
    projectsPrefix,
    projectsSubpath,
  });
