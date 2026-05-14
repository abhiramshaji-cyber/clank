export type CellCount = 1 | 2 | 3 | 4;

export type Settings = {
  onboarded: boolean;
  notesDir: string;
  projectsDir: string;
  projectsPrefix: string;
  /**
   * Optional subpath appended to each matched project dir. If `projectsDir`
   * holds `myorg-X / myorg-Y` and the real code is in `myorg-X/apps/bot`,
   * set this to `apps/bot` and the dropdown will populate cwd with the
   * deeper path when it exists.
   */
  projectsSubpath: string;
  defaultCellCount: CellCount;
};
