import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import {
  onPtyData,
  onPtyExit,
  ptyResize,
  ptyWrite,
} from "../ipc/pty";
import { useCells } from "../state/cells";
import {
  registerTerminal,
  unregisterTerminal,
} from "../state/terminalRegistry";
import { classifyOnData, classifyOnIdle } from "./activity";

export type TerminalProps = {
  cellId: string;
  fontSize: number;
  onExit?: (code: number | null) => void;
};

const THEME = {
  background: "#161618",
  foreground: "#e5e5e5",
  cursor: "#86efac",
  cursorAccent: "#161618",
  selectionBackground: "#1f5132",
  black: "#161618",
  red: "#cd3131",
  green: "#22c55e",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#4ade80",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

const FONT_FAMILY = "Menlo, Monaco, 'Courier New', monospace";

export function Terminal({ cellId, fontSize, onExit }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onExitRef = useRef<typeof onExit>(onExit);
  const setActivity = useCells((s) => s.setActivity);
  const setFocused = useCells((s) => s.setFocused);
  const tailBufferRef = useRef<string>("");
  const lastDataAtRef = useRef<number>(0);
  const errorUntilRef = useRef<number>(0);

  // Keep latest onExit without re-running the mount effect
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  // Mount xterm + wire up listeners. Run once per cellId.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: FONT_FAMILY,
      fontSize,
      theme: THEME,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    const webLinks = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinks);
    term.loadAddon(searchAddon);

    registerTerminal(cellId, {
      clear: () => term.clear(),
      searchNext: (q) => {
        if (!q) return;
        searchAddon.findNext(q, { incremental: false, caseSensitive: false });
      },
      searchPrevious: (q) => {
        if (!q) return;
        searchAddon.findPrevious(q, {
          incremental: false,
          caseSensitive: false,
        });
      },
    });

    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    try {
      fitAddon.fit();
    } catch {
      // container may not be measurable yet; ResizeObserver will retry
    }

    // user input -> pty
    const dataSub = term.onData((data) => {
      void ptyWrite(cellId, data);
    });

    // Subscribe to global pty:data events, filter by cellId
    let disposed = false;
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    onPtyData((e) => {
      if (e.cellId !== cellId) return;
      term.write(e.data);

      const now = Date.now();
      lastDataAtRef.current = now;
      const next = classifyOnData({
        tail: tailBufferRef.current,
        incoming: e.data,
        now,
        errorUntil: errorUntilRef.current,
      });
      tailBufferRef.current = next.tail;
      errorUntilRef.current = next.errorUntil;
      setActivity(cellId, next.activity);
    })
      .then((un) => {
        if (disposed) un();
        else unlistenData = un;
      })
      .catch(() => {});

    onPtyExit((e) => {
      if (e.cellId !== cellId) return;
      onExitRef.current?.(e.exitCode);
    })
      .then((un) => {
        if (disposed) un();
        else unlistenExit = un;
      })
      .catch(() => {});

    // Debounced fit + resize on container changes
    let resizeTimer: number | null = null;
    const scheduleResize = () => {
      if (resizeTimer != null) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        const t = termRef.current;
        const fa = fitAddonRef.current;
        if (!t || !fa) return;
        try {
          fa.fit();
        } catch {
          return;
        }
        void ptyResize(cellId, t.cols, t.rows);
      }, 50);
    };

    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(container);

    // Initial resize push to backend after first paint
    scheduleResize();

    // Idle classifier — runs every 500ms
    const idleTimer = window.setInterval(() => {
      const next = classifyOnIdle({
        tail: tailBufferRef.current,
        lastDataAt: lastDataAtRef.current,
        errorUntil: errorUntilRef.current,
        now: Date.now(),
      });
      if (next) setActivity(cellId, next);
    }, 500);

    // Focus tracking via xterm textarea events
    const onFocus = () => setFocused(cellId);
    const ta = term.textarea;
    ta?.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      window.clearInterval(idleTimer);
      observer.disconnect();
      dataSub.dispose();
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
      ta?.removeEventListener("focus", onFocus);
      unregisterTerminal(cellId);
      searchAddon.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId]);

  // React to fontSize changes: update term, refit, push resize
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = fontSize;
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    void ptyResize(cellId, term.cols, term.rows);
  }, [cellId, fontSize]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: THEME.background,
        overflow: "hidden",
      }}
    />
  );
}

export default Terminal;
