use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkingDirOption {
    pub label: String,
    pub path: String,
    pub source: String,
}

fn list_subdirs(base: &Path, prefix: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(base) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() && !ft.is_symlink() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(String::from) else { continue };
        if name.starts_with('.') {
            continue;
        }
        if !prefix.is_empty() && !name.starts_with(prefix) {
            continue;
        }
        out.push((name, path.to_string_lossy().into_owned()));
    }
    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    out
}

/// Append `subpath` to `base` if the resulting path exists and is a directory;
/// otherwise return `base` unchanged. Empty subpath is a no-op.
fn resolve_with_subpath(base: &str, subpath: &str) -> String {
    let trimmed = subpath.trim().trim_matches('/');
    if trimmed.is_empty() {
        return base.to_string();
    }
    let candidate = Path::new(base).join(trimmed);
    if candidate.is_dir() {
        candidate.to_string_lossy().into_owned()
    } else {
        base.to_string()
    }
}

#[tauri::command]
pub fn scan_working_dirs(
    projects_dir: String,
    notes_dir: String,
    projects_prefix: String,
    projects_subpath: String,
) -> Vec<WorkingDirOption> {
    let mut options: Vec<WorkingDirOption> = Vec::new();

    if !projects_dir.is_empty() {
        for (name, path) in list_subdirs(Path::new(&projects_dir), &projects_prefix) {
            let short = if !projects_prefix.is_empty() {
                name.strip_prefix(projects_prefix.as_str())
                    .unwrap_or(&name)
                    .trim_start_matches(['-', '_'])
                    .to_string()
            } else {
                name.clone()
            };
            let label = if short.is_empty() { name.clone() } else { short };
            let resolved = resolve_with_subpath(&path, &projects_subpath);
            options.push(WorkingDirOption {
                label: format!("project · {}", label),
                path: resolved,
                source: "projects".to_string(),
            });
        }
    }

    if !notes_dir.is_empty() && notes_dir != projects_dir {
        for (name, path) in list_subdirs(Path::new(&notes_dir), "") {
            options.push(WorkingDirOption {
                label: format!("notes · {}", name),
                path,
                source: "notes".to_string(),
            });
        }
    }

    options
}
