use std::path::Path;
use std::process::{Command, Stdio};

#[tauri::command]
pub fn open_external(cwd: String, app: String) -> Result<(), String> {
    let path = Path::new(&cwd);
    if !path.exists() {
        return Err(format!("path does not exist: {}", cwd));
    }

    let app_name = match app.as_str() {
        "zed" => "Zed",
        "obsidian" => "Obsidian",
        "cursor" => "Cursor",
        "code" => "Visual Studio Code",
        _ => return Err(format!("unsupported app: {}", app)),
    };

    // `open -a <App> <path>` is the macOS-correct way to launch a GUI app
    // with a path argument. It avoids issues with the app's binary not being
    // a real CLI (Obsidian, Zed without the optional CLI installed, etc.)
    // and avoids PATH-inheritance problems when Tauri is launched from Finder.
    Command::new("open")
        .arg("-a")
        .arg(app_name)
        .arg(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to open in {}: {}", app_name, e))?;
    Ok(())
}
