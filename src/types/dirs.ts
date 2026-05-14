export type WorkingDirSource = "projects" | "notes";

export type WorkingDirOption = {
  label: string;
  path: string;
  source: WorkingDirSource;
};
