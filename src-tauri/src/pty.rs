use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use once_cell::sync::{Lazy, OnceCell};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Global app handle, set once during `setup`, used by reader threads to
/// emit events back to the frontend.
static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

/// One running PTY cell.
struct CellHandle {
    /// PTY master — kept so we can resize. Wrapped in a Mutex because the
    /// `resize` method takes `&self` but `MasterPty` is not `Sync` on all
    /// platforms.
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// Writer for the PTY (user keystrokes). Separate from master because
    /// `take_writer` consumes a writer handle distinct from the master.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Child process — kept so we can kill it.
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    /// Flag the reader thread checks to stop early on forced kill.
    stop_flag: Arc<AtomicBool>,
    /// If set, the reader thread will NOT emit pty:exit on cleanup. Used when
    /// a force-restart replaces this PTY with a new one for the same cell_id.
    suppress_exit: Arc<AtomicBool>,
    /// Generation marker — when the reader thread cleans up, it only removes
    /// itself from the registry if the entry's generation still matches. This
    /// prevents an old reader from evicting a newer PTY that reused the cell_id.
    generation: u64,
}

static NEXT_GENERATION: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(1);

/// Cell registry: cell_id -> CellHandle.
static CELLS: Lazy<Mutex<HashMap<String, CellHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Serialize)]
struct PtyDataPayload {
    #[serde(rename = "cellId")]
    cell_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExitPayload {
    #[serde(rename = "cellId")]
    cell_id: String,
    #[serde(rename = "exitCode")]
    exit_code: Option<i32>,
}

/// Called once from `lib.rs` setup. Stashes the app handle so reader threads
/// can emit events.
pub fn setup(app: AppHandle) {
    // `set` returns Err if already set; we just ignore — setup should only
    // be called once but we don't want to panic on hot-reload during dev.
    let _ = APP_HANDLE.set(app);
}

/// Force-terminate a child and (on Unix) every process in its session/group.
///
/// `child.kill()` on its own only signals the direct child. portable_pty calls
/// `setsid()` in the spawned process so the child is a session/process-group
/// leader; sending the signal to the negative pid hits every descendant, which
/// is what makes the PTY slave actually close (and lets the reader EOF).
fn force_terminate_child(child: &mut Box<dyn Child + Send + Sync>) {
    #[cfg(unix)]
    {
        if let Some(pid) = child.process_id() {
            // Best effort: SIGTERM first, then SIGKILL to the whole group.
            // Negative pid → process group.
            let pgid = -(pid as libc::pid_t);
            unsafe {
                let _ = libc::kill(pgid, libc::SIGTERM);
                let _ = libc::kill(pgid, libc::SIGKILL);
            }
        }
    }
    let _ = child.kill();
}

fn emit_data(app: &AppHandle, cell_id: &str, data: String) {
    let _ = app.emit(
        "pty:data",
        PtyDataPayload {
            cell_id: cell_id.to_string(),
            data,
        },
    );
}

fn emit_exit(app: &AppHandle, cell_id: &str, exit_code: Option<i32>) {
    let _ = app.emit(
        "pty:exit",
        PtyExitPayload {
            cell_id: cell_id.to_string(),
            exit_code,
        },
    );
}

#[tauri::command]
pub fn pty_spawn(
    cell_id: String,
    cwd: String,
    command: String,
    args: Vec<String>,
) -> Result<(), String> {
    // If a cell with this id is already in the registry (stale from a previous
    // run that hasn't fully cleaned up yet), force-clean it before spawning a
    // new one. This makes restart "just work" without races.
    {
        let mut cells = CELLS.lock();
        if let Some(old) = cells.remove(&cell_id) {
            // Tell the old reader thread not to emit pty:exit (it would
            // confuse the frontend by marking the brand-new PTY as exited).
            old.suppress_exit.store(true, Ordering::Relaxed);
            old.stop_flag.store(true, Ordering::Relaxed);
            // Kill the old child *group* so the reader's read() returns EOF
            // even if the child had spawned subprocesses (zsh + a command,
            // claude + helpers, etc.). The orphaned reader will wind down
            // on its own and its final registry-remove is a no-op since
            // we've already removed the entry above.
            force_terminate_child(&mut old.child.lock());
        }
    }

    // Validate cwd.
    let cwd_path = Path::new(&cwd);
    if !cwd_path.exists() {
        return Err(format!("cwd does not exist: {}", cwd));
    }
    if !cwd_path.is_dir() {
        return Err(format!("cwd is not a directory: {}", cwd));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {}", e))?;

    // Build the command.
    let mut cmd = CommandBuilder::new(&command);
    for a in &args {
        cmd.arg(a);
    }
    cmd.cwd(cwd_path);
    cmd.env("TERM", "xterm-256color");

    // Spawn the child via the slave side.
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {}", e))?;

    // Drop the slave so the reader sees EOF when the child exits.
    drop(pair.slave);

    // Grab a clonable reader and a writer from the master.
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader failed: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer failed: {}", e))?;

    let master = Arc::new(Mutex::new(pair.master));
    let writer = Arc::new(Mutex::new(writer));
    let child = Arc::new(Mutex::new(child));
    let stop_flag = Arc::new(AtomicBool::new(false));
    let suppress_exit = Arc::new(AtomicBool::new(false));
    let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);

    let handle = CellHandle {
        master: master.clone(),
        writer: writer.clone(),
        child: child.clone(),
        stop_flag: stop_flag.clone(),
        suppress_exit: suppress_exit.clone(),
        generation,
    };

    // Spawn the reader thread before inserting into the registry so a failed
    // spawn doesn't leave a zombie handle with no reader.
    let reader_cell_id = cell_id.clone();
    let reader_stop = stop_flag.clone();
    let reader_child = child.clone();
    let reader_suppress = suppress_exit.clone();
    let reader_generation = generation;
    thread::Builder::new()
        .name(format!("pty-reader-{}", cell_id))
        .spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                if reader_stop.load(Ordering::Relaxed) {
                    break;
                }
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        if reader_suppress.load(Ordering::Relaxed) {
                            // Old PTY being torn down; don't relay its trailing
                            // output to the (now new) cell of the same id.
                            continue;
                        }
                        let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if let Some(app) = APP_HANDLE.get() {
                            emit_data(app, &reader_cell_id, chunk);
                        }
                    }
                    Err(_) => break,
                }
            }

            // Wait for child to fully exit so we can grab the exit code.
            let exit_code = {
                let mut child_lock = reader_child.lock();
                match child_lock.wait() {
                    Ok(status) => status.exit_code() as i32,
                    Err(_) => -1,
                }
            };

            // Remove from registry only if this entry's generation still
            // matches — otherwise a newer PTY has replaced us under the
            // same cell_id and we shouldn't evict it.
            {
                let mut cells = CELLS.lock();
                if let Some(current) = cells.get(&reader_cell_id) {
                    if current.generation == reader_generation {
                        cells.remove(&reader_cell_id);
                    }
                }
            }

            if !reader_suppress.load(Ordering::Relaxed) {
                if let Some(app) = APP_HANDLE.get() {
                    emit_exit(app, &reader_cell_id, Some(exit_code));
                }
            }
        })
        .map_err(|e| format!("failed to spawn reader thread: {}", e))?;

    // Insert into registry only after the reader thread is confirmed running,
    // so a failed spawn never leaves a zombie handle with no reader.
    CELLS.lock().insert(cell_id.clone(), handle);

    // Suppress unused warnings — we keep `master` and `writer` Arcs around
    // via the CellHandle in the registry.
    let _ = master;
    let _ = writer;

    Ok(())
}

#[tauri::command]
pub fn pty_write(cell_id: String, data: String) -> Result<(), String> {
    let writer_arc = {
        let cells = CELLS.lock();
        let handle = cells
            .get(&cell_id)
            .ok_or_else(|| "cell not found".to_string())?;
        handle.writer.clone()
    };
    let mut w = writer_arc.lock();
    w.write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {}", e))?;
    w.flush().map_err(|e| format!("flush failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(cell_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let master_arc = {
        let cells = CELLS.lock();
        let handle = cells
            .get(&cell_id)
            .ok_or_else(|| "cell not found".to_string())?;
        handle.master.clone()
    };
    let master = master_arc.lock();
    master
        .resize(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}

/// After force-kill, the reader thread *should* see EOF on the master and emit
/// `pty:exit` on its own. If it doesn't (rare: kernel quirks, or some FD still
/// pinning the slave open even after the process group is dead), this grace
/// period elapses and we manually evict the cell + emit `pty:exit` ourselves,
/// so the UI never stays stuck in `stopping`.
const READER_CLEANUP_GRACE: Duration = Duration::from_secs(3);

/// Time we give the child to exit cleanly on SIGINT before escalating to
/// SIGKILL of the whole process group.
const SIGINT_GRACE: Duration = Duration::from_secs(2);

/// Force-evict a cell from the registry and emit a synthetic `pty:exit` if the
/// reader thread hasn't already done so. Safe to call after `force_terminate`:
/// if the reader did its job we no-op, otherwise we unstick the frontend.
fn finalize_cell_if_orphaned(cell_id: &str, generation: u64, suppress_exit: &AtomicBool) {
    let evicted = {
        let mut cells = CELLS.lock();
        match cells.get(cell_id) {
            Some(h) if h.generation == generation => {
                cells.remove(cell_id);
                true
            }
            _ => false,
        }
    };
    if evicted && !suppress_exit.load(Ordering::Relaxed) {
        if let Some(app) = APP_HANDLE.get() {
            emit_exit(app, cell_id, None);
        }
    }
}

#[tauri::command]
pub fn pty_kill(cell_id: String, signal: String) -> Result<(), String> {
    // Look up the cell. Idempotent: missing cell is a no-op.
    let (writer_arc, child_arc, stop_flag, suppress_exit, generation) = {
        let cells = CELLS.lock();
        match cells.get(&cell_id) {
            Some(h) => (
                h.writer.clone(),
                h.child.clone(),
                h.stop_flag.clone(),
                h.suppress_exit.clone(),
                h.generation,
            ),
            None => return Ok(()),
        }
    };

    match signal.as_str() {
        "SIGINT" => {
            // Send Ctrl-C to the PTY so the child (e.g. claude) can clean up.
            {
                let mut w = writer_arc.lock();
                let _ = w.write_all(&[0x03]);
                let _ = w.flush();
            }
            // After SIGINT_GRACE, if the cell is still in the registry (i.e.
            // the child hasn't exited yet), kill the whole process group so
            // descendants release the PTY slave and the reader can EOF.
            let cell_id_clone = cell_id.clone();
            thread::Builder::new()
                .name(format!("pty-sigint-timeout-{}", cell_id))
                .spawn(move || {
                    thread::sleep(SIGINT_GRACE);
                    let still_present = CELLS.lock().contains_key(&cell_id_clone);
                    if !still_present {
                        return;
                    }
                    stop_flag.store(true, Ordering::Relaxed);
                    force_terminate_child(&mut child_arc.lock());
                    // Reader should EOF momentarily; if it doesn't, we'll
                    // synthesise an exit so the UI doesn't stay stuck.
                    thread::sleep(READER_CLEANUP_GRACE);
                    finalize_cell_if_orphaned(&cell_id_clone, generation, &suppress_exit);
                })
                .map_err(|e| format!("failed to spawn timeout thread: {}", e))?;
        }
        "SIGKILL" => {
            stop_flag.store(true, Ordering::Relaxed);
            force_terminate_child(&mut child_arc.lock());
            // Safety net: if reader cleanup doesn't run within the grace
            // period, drop the cell ourselves so the UI escapes `stopping`.
            let cell_id_clone = cell_id.clone();
            thread::Builder::new()
                .name(format!("pty-sigkill-watchdog-{}", cell_id))
                .spawn(move || {
                    thread::sleep(READER_CLEANUP_GRACE);
                    finalize_cell_if_orphaned(&cell_id_clone, generation, &suppress_exit);
                })
                .map_err(|e| format!("failed to spawn watchdog thread: {}", e))?;
        }
        other => return Err(format!("unsupported signal: {}", other)),
    }

    Ok(())
}
