export type PtyDataEvent = { cellId: string; data: string };
export type PtyExitEvent = { cellId: string; exitCode: number | null };
export type PtySignal = "SIGINT" | "SIGKILL";
