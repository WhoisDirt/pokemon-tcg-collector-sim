// Persistence + native bridge. Uses Tauri commands (SQLite) in the desktop app and a localStorage mock otherwise (tests/browser).
const isTauri = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
/** Tauri passes camelCase JS args as snake_case Rust args; the mock mirrors that. */
export const snake = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()), v]));
const LS = () => window.localStorage;
const P = "pokesim:";
export interface BackupInfo { name: string; size: number; modified: number }

export const api = {
  isTauri,
  async load(): Promise<Record<string, string>> {
    if (isTauri()) { const rows = await call<[string, string][]>("db_load"); return Object.fromEntries(rows); }
    const out: Record<string, string> = {};
    for (let i = 0; i < LS().length; i++) { const k = LS().key(i)!; if (k.startsWith(P)) out[k.slice(P.length)] = LS().getItem(k)!; }
    return out;
  },
  async save(items: [string, string][]): Promise<void> {
    if (isTauri()) return call("db_save", { items });
    for (const [k, v] of items) LS().setItem(P + k, v);
  },
  async wipe(): Promise<void> {
    if (isTauri()) return call("db_wipe");
    const ks: string[] = []; for (let i = 0; i < LS().length; i++) { const k = LS().key(i)!; if (k.startsWith(P)) ks.push(k); } ks.forEach((k) => LS().removeItem(k));
  },
  async backup(label: string): Promise<string> {
    if (isTauri()) return call("db_backup", { label });
    const name = `save-${Math.floor(Date.now() / 1000)}-${label}.sqlite`; LS().setItem("pokesim_bk:" + name, JSON.stringify(await api.load())); return name;
  },
  async listBackups(): Promise<BackupInfo[]> {
    if (isTauri()) return call("db_list_backups");
    const out: BackupInfo[] = [];
    for (let i = 0; i < LS().length; i++) { const k = LS().key(i)!; if (k.startsWith("pokesim_bk:")) out.push({ name: k.slice(11), size: LS().getItem(k)!.length, modified: Number(k.split("-")[1]) || 0 }); }
    return out.sort((a, b) => b.modified - a.modified);
  },
  async restore(name: string): Promise<number> {
    if (isTauri()) return call("db_restore", { name });
    const raw = LS().getItem("pokesim_bk:" + name); if (!raw) throw new Error("backup not found");
    await api.wipe(); const o = JSON.parse(raw) as Record<string, string>; await api.save(Object.entries(o)); return Object.keys(o).length;
  },
  async exportSave(): Promise<string> {
    if (isTauri()) return call("db_export");
    return "(browser mode) saved in localStorage";
  },
  async listExports(): Promise<string[]> { return isTauri() ? call("list_exports") : []; },
  async importSave(fileName: string): Promise<number> { return isTauri() ? call("db_import", { fileName }) : 0; },
  async httpGet(url: string): Promise<string> {
    if (isTauri()) return call("http_get", { url });
    const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.text();
  },
  async musicDir(): Promise<string> { return isTauri() ? call("music_dir") : "(browser mode)"; },
  async musicList(): Promise<string[]> { return isTauri() ? call("music_list") : []; },
  async musicDownload(url: string, name: string): Promise<void> { if (isTauri()) await call("music_download", { url, name }); },
  async musicSrc(dir: string, name: string): Promise<string> {
    if (!isTauri()) return name;
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const sep = dir.includes("\\") ? "\\" : "/";
    return convertFileSrc(dir + sep + name);
  },
};
