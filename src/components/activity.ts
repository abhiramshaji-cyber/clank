import type { ActivityState } from "../types";

export const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;
export const ANSI_RED_RE = /\x1b\[(31|91|41|101)(;[0-9]+)*m/;
export const ERROR_RE =
  /\b(error|errored|failed|failure|exception|traceback|fatal|panic)\b/i;

export const TAIL_CHARS = 800;
export const ERROR_STICKY_MS = 10_000;
export const ACTIVE_WINDOW_MS = 1_500;
export const DONE_AFTER_MS = 3_000;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_SGR_RE, "");
}

export function lastNonEmptyLine(s: string): string {
  const lines = s.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return "";
}

export type ChunkInput = {
  tail: string;
  incoming: string;
  now: number;
  errorUntil: number;
};

export type ChunkResult = {
  tail: string;
  errorUntil: number;
  activity: ActivityState;
};

/**
 * Pure version of "what should the activity be after this chunk arrived?"
 * Returns the next tail buffer + errorUntil deadline + activity.
 */
export function classifyOnData({
  tail,
  incoming,
  now,
  errorUntil,
}: ChunkInput): ChunkResult {
  const combined = (tail + incoming).slice(-TAIL_CHARS);
  const stripped = stripAnsi(combined);
  const isError = ANSI_RED_RE.test(incoming) || ERROR_RE.test(stripped);

  if (isError) {
    return {
      tail: combined,
      errorUntil: now + ERROR_STICKY_MS,
      activity: "error",
    };
  }
  if (errorUntil > now) {
    return { tail: combined, errorUntil, activity: "error" };
  }
  return { tail: combined, errorUntil, activity: "active" };
}

export type IdleInput = {
  tail: string;
  lastDataAt: number;
  errorUntil: number;
  now: number;
};

/**
 * Pure version of the idle-classifier tick. Returns the activity that should
 * be set right now, or `null` if the cell has not seen any data yet.
 */
export function classifyOnIdle({
  tail,
  lastDataAt,
  errorUntil,
  now,
}: IdleInput): ActivityState | null {
  if (lastDataAt === 0) return null;
  if (errorUntil > now) return "error";
  const sinceData = now - lastDataAt;
  if (sinceData < ACTIVE_WINDOW_MS) return "active";
  const last = lastNonEmptyLine(stripAnsi(tail));
  if (last.endsWith("?")) return "question";
  if (sinceData > DONE_AFTER_MS) return "done";
  return "active";
}
