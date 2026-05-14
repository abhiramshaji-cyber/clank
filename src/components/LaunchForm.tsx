import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { scanWorkingDirs } from "../ipc/dirs";
import { useSettings } from "../state/settings";
import type { CellConfig, WorkingDirOption } from "../types";

type Props = {
  cellId: string;
  lastConfig: CellConfig | null;
  error: string | null;
  onLaunch: (cfg: CellConfig) => void;
};

type Preset = { label: string; command: string; args: string[] };

const PRESETS: Preset[] = [
  { label: "claude", command: "claude", args: [] },
  { label: "claude (yolo)", command: "claude", args: ["--dangerously-skip-permissions"] },
  { label: "claude --continue", command: "claude", args: ["--continue"] },
  { label: "codex", command: "codex", args: [] },
  { label: "zsh", command: "/bin/zsh", args: ["-l"] },
  { label: "zed", command: "zed", args: ["."] },
  { label: "adk dev --logs", command: "adk", args: ["dev", "--logs"] },
  { label: "adk chat", command: "adk", args: ["chat"] },
];

const COMMAND_OPTIONS: { label: string; value: string }[] = [
  { label: "claude", value: "claude" },
  { label: "codex", value: "codex" },
  { label: "zed", value: "zed" },
  { label: "adk", value: "adk" },
  { label: "/bin/zsh", value: "/bin/zsh" },
  { label: "/bin/bash", value: "/bin/bash" },
];

const ARG_OPTIONS: string[] = [
  "--dangerously-skip-permissions",
  "--continue",
  "--resume",
  "--model sonnet",
  "--model opus",
  "--model haiku",
  "--permission-mode plan",
  "--permission-mode acceptEdits",
  "--no-update-check",
  "-l",
  ".",
  "dev",
  "chat",
  "--logs",
  "--port 3000",
  "--port-console 3001",
];

export function LaunchForm({ cellId, lastConfig, error, onLaunch }: Props) {
  const projectsDir = useSettings((s) => s.projectsDir);
  const notesDir = useSettings((s) => s.notesDir);
  const projectsPrefix = useSettings((s) => s.projectsPrefix);
  const projectsSubpath = useSettings((s) => s.projectsSubpath);
  const [cwd, setCwd] = useState(lastConfig?.cwd ?? "");
  const [command, setCommand] = useState(lastConfig?.command ?? "claude");
  const [args, setArgs] = useState<string[]>(lastConfig?.args ?? []);
  const [tasksFile, setTasksFile] = useState(lastConfig?.tasksFile ?? "");
  const [dirOptions, setDirOptions] = useState<WorkingDirOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    scanWorkingDirs(projectsDir, notesDir, projectsPrefix, projectsSubpath)
      .then((opts) => {
        if (!cancelled) setDirOptions(opts);
      })
      .catch((e) => console.error("scan_working_dirs:", e));
    return () => {
      cancelled = true;
    };
  }, [projectsDir, notesDir, projectsPrefix, projectsSubpath]);

  const browseDir = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setCwd(picked);
  };

  const browseTasks = async () => {
    const picked = await open({
      defaultPath: notesDir || undefined,
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (typeof picked === "string") setTasksFile(picked);
  };

  const handleLaunch = () => {
    if (!cwd.trim() || !command.trim()) return;
    onLaunch({
      cwd: cwd.trim(),
      command: command.trim(),
      args: args.map((a) => a.trim()).filter(Boolean),
      tasksFile: tasksFile.trim() || null,
    });
  };

  const usePreset = (p: Preset) => {
    setCommand(p.command);
    setArgs(p.args);
  };

  const addArg = () => setArgs((prev) => [...prev, ""]);
  const updateArg = (i: number, v: string) =>
    setArgs((prev) => prev.map((a, idx) => (idx === i ? v : a)));
  const removeArg = (i: number) =>
    setArgs((prev) => prev.filter((_, idx) => idx !== i));

  // Quick relaunch from form recall
  const canQuickLaunch = !!lastConfig?.cwd && !!lastConfig?.command;

  const projectsCount = dirOptions.filter((o) => o.source === "projects").length;
  const notesCount = dirOptions.filter((o) => o.source === "notes").length;

  return (
    <div className="h-full w-full overflow-y-auto flex items-start justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-neutral-200 text-sm font-semibold">{cellId}</h2>
          <span className="text-neutral-500 text-xs">launch a terminal</span>
        </div>

        {canQuickLaunch && lastConfig && (
          <button
            onClick={() =>
              onLaunch({
                cwd: lastConfig.cwd,
                command: lastConfig.command,
                args: lastConfig.args,
                tasksFile: lastConfig.tasksFile,
              })
            }
            className="px-3 py-2 bg-green-700/30 hover:bg-green-700/50 border border-green-700 rounded text-left text-sm"
          >
            <div className="text-green-300 font-mono truncate">
              ▶ {lastConfig.command} {lastConfig.args.join(" ")}
            </div>
            <div className="text-green-400/60 text-xs font-mono truncate">
              in {lastConfig.cwd}
            </div>
          </button>
        )}

        {error && (
          <div className="text-red-400 text-xs bg-red-950/30 border border-red-900 rounded px-2 py-1">
            {error}
          </div>
        )}

        <Field label="Working directory">
          <div className="flex gap-1">
            <select
              value=""
              onChange={(e) => e.target.value && setCwd(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-1 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-500 max-w-[140px]"
              title="Quick pick from scanned folders"
            >
              <option value="">
                {dirOptions.length === 0
                  ? "no scan results"
                  : `pick… (${projectsCount}p · ${notesCount}n)`}
              </option>
              {dirOptions.map((o) => (
                <option key={o.path} value={o.path}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/Users/you/project"
              className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 outline-none focus:border-neutral-500"
            />
            <button
              onClick={browseDir}
              className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300"
            >
              Browse…
            </button>
          </div>
          <div className="text-[10px] mt-1 leading-tight font-mono flex flex-col gap-0.5">
            <span
              className={
                projectsCount > 0
                  ? "text-neutral-500"
                  : projectsDir
                  ? "text-amber-400/80"
                  : "text-neutral-600"
              }
            >
              projects: {projectsDir || "(not set)"}
              {projectsPrefix ? ` · prefix "${projectsPrefix}"` : ""}
              {" → "}
              {projectsCount} found
            </span>
            <span
              className={
                notesCount > 0
                  ? "text-neutral-500"
                  : notesDir
                  ? "text-amber-400/80"
                  : "text-neutral-600"
              }
            >
              notes: {notesDir || "(not set)"} → {notesCount} found
            </span>
          </div>
        </Field>

        <Field label="Command">
          <div className="flex gap-1">
            <select
              value=""
              onChange={(e) => e.target.value && setCommand(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-1 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-500"
              title="Quick pick"
            >
              <option value="">pick…</option>
              {COMMAND_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude"
              className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 outline-none focus:border-neutral-500"
            />
          </div>
        </Field>

        <Field label="Args">
          <div className="flex flex-col gap-1">
            {args.map((arg, i) => (
              <div key={i} className="flex gap-1">
                <select
                  value=""
                  onChange={(e) => e.target.value && updateArg(i, e.target.value)}
                  className="bg-neutral-900 border border-neutral-700 rounded px-1 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-500"
                  title="Quick pick"
                >
                  <option value="">pick…</option>
                  {ARG_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <input
                  value={arg}
                  onChange={(e) => updateArg(i, e.target.value)}
                  placeholder="--flag or value"
                  className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 outline-none focus:border-neutral-500"
                />
                <button
                  onClick={() => removeArg(i)}
                  className="px-2 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded text-neutral-500 hover:text-red-400"
                  title="Remove arg"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addArg}
              className="self-start px-2 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 border-dashed rounded text-neutral-400 hover:text-neutral-200"
            >
              + add arg
            </button>
          </div>
        </Field>

        <Field label="Tasks file (optional)">
          <div className="flex gap-1">
            <input
              value={tasksFile}
              onChange={(e) => setTasksFile(e.target.value)}
              placeholder="/path/to/tasks.md"
              className="flex-1 min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 outline-none focus:border-neutral-500"
            />
            <button
              onClick={browseTasks}
              className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300"
            >
              Browse…
            </button>
          </div>
        </Field>

        <div className="flex flex-col gap-1">
          <span className="text-neutral-500 text-xs">Presets (set command + args)</span>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => usePreset(p)}
                className="px-2 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded text-neutral-300 font-mono"
                title={`${p.command} ${p.args.join(" ")}`.trim()}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleLaunch}
          disabled={!cwd.trim() || !command.trim()}
          className="mt-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed rounded text-sm font-semibold text-neutral-100"
        >
          Launch
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-neutral-500 text-xs">{label}</span>
      {children}
    </label>
  );
}

