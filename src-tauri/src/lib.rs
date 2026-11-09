mod savestore;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

struct App { store: Mutex<savestore::Store>, dir: PathBuf }

fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

#[derive(Serialize)]
struct BackupInfo { name: String, size: u64, modified: u64 }

#[tauri::command]
fn db_load(app: State<App>) -> Result<Vec<(String, String)>, String> {
    app.store.lock().map_err(|e| e.to_string())?.get_all()
}
#[tauri::command]
fn db_save(app: State<App>, items: Vec<(String, String)>) -> Result<(), String> {
    app.store.lock().map_err(|e| e.to_string())?.set_many(&items)
}
#[tauri::command]
fn db_wipe(app: State<App>) -> Result<(), String> {
    app.store.lock().map_err(|e| e.to_string())?.wipe()
}
fn backups_dir(app: &App) -> Result<PathBuf, String> {
    let d = app.dir.join("backups");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
#[tauri::command]
fn db_backup(app: State<App>, label: String) -> Result<String, String> {
    let clean: String = label.chars().filter(|c| c.is_alphanumeric() || *c == '-').take(24).collect();
    let name = format!("save-{}-{}.sqlite", now(), clean);
    let p = backups_dir(&app)?.join(&name);
    app.store.lock().map_err(|e| e.to_string())?.backup_to(p.to_str().ok_or("bad path")?)?;
    Ok(name)
}
#[tauri::command]
fn db_list_backups(app: State<App>) -> Result<Vec<BackupInfo>, String> {
    let mut out = vec![];
    for ent in std::fs::read_dir(backups_dir(&app)?).map_err(|e| e.to_string())? {
        let ent = ent.map_err(|e| e.to_string())?;
        let n = ent.file_name().to_string_lossy().to_string();
        if !n.ends_with(".sqlite") { continue; }
        let md = ent.metadata().map_err(|e| e.to_string())?;
        let m = md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        out.push(BackupInfo { name: n, size: md.len(), modified: m });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}
#[tauri::command]
fn db_restore(app: State<App>, name: String) -> Result<usize, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") { return Err("invalid name".into()); }
    let p = backups_dir(&app)?.join(&name);
    app.store.lock().map_err(|e| e.to_string())?.restore_from(p.to_str().ok_or("bad path")?)
}
/// Copies the save to the user's Documents folder so it can be moved to another computer.
#[tauri::command]
fn db_export(app: State<App>, handle: tauri::AppHandle) -> Result<String, String> {
    let docs = handle.path().document_dir().map_err(|e| e.to_string())?;
    let dir = docs.join("PokemonTCGSim");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(format!("save-export-{}.sqlite", now()));
    app.store.lock().map_err(|e| e.to_string())?.backup_to(p.to_str().ok_or("bad path")?)?;
    Ok(p.to_string_lossy().to_string())
}
#[tauri::command]
fn db_import(app: State<App>, handle: tauri::AppHandle, file_name: String) -> Result<usize, String> {
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") { return Err("invalid name".into()); }
    let docs = handle.path().document_dir().map_err(|e| e.to_string())?;
    let p = docs.join("PokemonTCGSim").join(file_name);
    app.store.lock().map_err(|e| e.to_string())?.restore_from(p.to_str().ok_or("bad path")?)
}
#[tauri::command]
fn list_exports(handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let docs = handle.path().document_dir().map_err(|e| e.to_string())?;
    let dir = docs.join("PokemonTCGSim");
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() { let n = e.file_name().to_string_lossy().to_string(); if n.ends_with(".sqlite") { out.push(n); } }
    }
    out.sort(); out.reverse();
    Ok(out)
}
/// Plain HTTP GET used by the optional online price-update data sources.
#[tauri::command]
async fn http_get(url: String) -> Result<String, String> {
    if !(url.starts_with("https://api.pokemontcg.io/") || url.starts_with("https://tcgcsv.com/") || url.starts_with("https://raw.githubusercontent.com/")) {
        return Err("host not allowed".into());
    }
    let c = reqwest::Client::builder().user_agent("pokesim/1.0").timeout(std::time::Duration::from_secs(60)).build().map_err(|e| e.to_string())?;
    let r = c.get(&url).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() { return Err(format!("HTTP {}", r.status())); }
    r.text().await.map_err(|e| e.to_string())
}


fn music_path(app: &App) -> Result<PathBuf, String> {
    let d = app.dir.join("music");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
#[tauri::command]
fn music_dir(app: State<App>) -> Result<String, String> { Ok(music_path(&app)?.to_string_lossy().to_string()) }
/// Lists audio files in the music folder (downloaded tracks and any files the player drops in).
#[tauri::command]
fn music_list(app: State<App>) -> Result<Vec<String>, String> {
    let mut out = vec![];
    for e in std::fs::read_dir(music_path(&app)?).map_err(|e| e.to_string())?.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        let l = n.to_lowercase();
        if (l.ends_with(".mp3") || l.ends_with(".ogg") || l.ends_with(".m4a") || l.ends_with(".wav") || l.ends_with(".flac")) && e.metadata().map(|m| m.len() > 20000).unwrap_or(false) { out.push(n); }
    }
    out.sort();
    Ok(out)
}
/// Downloads one track from archive.org into the music folder (skips if already present).
#[tauri::command]
async fn music_download(app: State<'_, App>, url: String, name: String) -> Result<(), String> {
    if !url.starts_with("https://archive.org/download/") { return Err("host not allowed".into()); }
    if name.contains('/') || name.contains('\\') || name.contains("..") { return Err("invalid name".into()); }
    let dest = music_path(&app)?.join(&name);
    if dest.exists() && std::fs::metadata(&dest).map(|m| m.len() > 20000).unwrap_or(false) { return Ok(()); }
    let c = reqwest::Client::builder().user_agent("pokesim/1.0").timeout(std::time::Duration::from_secs(300)).build().map_err(|e| e.to_string())?;
    let r = c.get(&url).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() { return Err(format!("HTTP {}", r.status())); }
    let b = r.bytes().await.map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, &b).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = savestore::Store::open(dir.join("savegame.sqlite").to_str().unwrap()).map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(App { store: Mutex::new(store), dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db_load, db_save, db_wipe, db_backup, db_list_backups, db_restore, db_export, db_import, list_exports, http_get, music_dir, music_list, music_download])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
