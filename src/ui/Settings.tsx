import React, { useEffect, useState } from "react";
import { useGame, getCat, run, resetGame, reloadFromDisk, pushMsg, flush, getState } from "../store";
import { api, BackupInfo } from "../api";
import { Btn, Modal } from "./common";
import { SOURCES, parseCsv } from "../sources";
import { refreshMarketData } from "../refresh";
import { downloadSoundtrack, musicInfo, onMusicChange, nextTrack, startMusic, refreshTracks, PLAYLIST } from "../audio";
import { Settings as S } from "../types";
import { fmtDate } from "../util";

export function Settings() {
  const s = useGame(); const cat = getCat(); const st = s.settings;
  const set = (p: Partial<S>) => run((d) => { Object.assign(d.settings, p); }, { quiet: true });
  const [busy, setBusy] = useState(""); const [log, setLog] = useState("");
  const [backups, setBackups] = useState<BackupInfo[]>([]); const [exports, setExports] = useState<string[]>([]); const [confirmReset, setConfirmReset] = useState(false);
  const [csv, setCsv] = useState(""); const [csvMsg, setCsvMsg] = useState(""); const [edit, setEdit] = useState({ id: "", price: "" });
  const [, force] = useState(0); const [dl, setDl] = useState("");
  useEffect(() => { const off = onMusicChange(() => force((x) => x + 1)); return () => { off(); }; }, []);
  const loadB = () => { api.listBackups().then(setBackups).catch(() => {}); api.listExports().then(setExports).catch(() => {}); };
  useEffect(loadB, []);
  const mi = musicInfo();
  const refresh = async (scope: "recent" | "all") => { setBusy(scope); setLog("Starting…"); try { const r = await refreshMarketData(cat, scope, setLog); setLog(r); pushMsg("Market data refreshed"); } catch (e) { setLog(String(e)); pushMsg(String(e), "error"); } setBusy(""); };
  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="grid2">
        <section className="panel"><h3>Sound &amp; music</h3>
          <label className="chk"><input type="checkbox" checked={st.sfx} onChange={(e) => set({ sfx: e.target.checked })} /> Sound effects</label>
          <div className="row"><span>SFX volume</span><input type="range" min={0} max={1} step={0.05} value={st.sfxVol} onChange={(e) => set({ sfxVol: +e.target.value })} /></div>
          <label className="chk"><input type="checkbox" checked={st.music} onChange={(e) => set({ music: e.target.checked })} /> Background music</label>
          <div className="row"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={st.musicVol} onChange={(e) => set({ musicVol: +e.target.value })} /></div>
          <div className="muted small">Now playing: {mi.nowPlaying || (st.music ? "starting…" : "music off")} ({mi.mode}, {mi.files} track files)</div>
          <div className="row"><Btn small kind="blue" onClick={() => void nextTrack()}>⏭ Next track</Btn><Btn small kind="yellow" disabled={!!dl && !dl.startsWith("Done")} onClick={async () => { await downloadSoundtrack((d, t, m) => setDl(m)); }}>Download Pokémon game soundtrack ({PLAYLIST.length} tracks)</Btn></div>
          {dl && <div className="muted small">{dl}</div>}
          <div className="muted small">Tracks are downloaded to your computer (from archive.org) the first time the game runs online and are not stored in the game's code repository. You can also drop your own MP3 / OGG / M4A files into: <code>{mi.dir || "…"}</code> (restart music to pick them up).</div>
        </section>
        <section className="panel"><h3>Display &amp; gameplay</h3>
          <div className="row"><span>Theme</span><select value={st.theme} onChange={(e) => set({ theme: e.target.value })}><option value="kanto">Kanto (red &amp; blue)</option><option value="night">Night</option><option value="sunset">Sunset</option><option value="forest">Viridian Forest</option></select></div>
          <div className="row"><span>Interface scale</span><input type="range" min={0.8} max={1.4} step={0.05} value={st.scale} onChange={(e) => set({ scale: +e.target.value })} /><b>{Math.round(st.scale * 100)}%</b></div>
          <div className="row"><span>Animation speed</span><input type="range" min={0.5} max={3} step={0.25} value={st.animSpeed} onChange={(e) => set({ animSpeed: +e.target.value })} /><b>{st.animSpeed}×</b></div>
        </section>
      </div>
      <section className="panel"><h3>Market data &amp; sources</h3>
        <div className="row"><label className="chk"><input type="checkbox" checked={st.offline} onChange={(e) => set({ offline: e.target.checked })} /> Offline mode (use cached prices only)</label>
          <span>Auto-update</span><select value={st.updateFreq} onChange={(e) => set({ updateFreq: e.target.value as any })}><option value="manual">Manual only</option><option value="launch">On every launch</option><option value="daily">At most daily</option></select></div>
        <table className="tbl"><thead><tr><th>Use</th><th>Source</th><th>Last updated</th><th>Notes</th></tr></thead><tbody>{SOURCES.map((x) => <tr key={x.id}><td>{x.refresh ? <input type="checkbox" checked={st.sources[x.id] ?? true} onChange={(e) => set({ sources: { ...st.sources, [x.id]: e.target.checked } })} /> : "—"}</td><td><b>{x.name}</b></td>
          <td>{s.sourceUpdated[x.id] ? new Date(s.sourceUpdated[x.id]).toLocaleString() : x.kind === "api" ? "Bundled snapshot (build time)" : "—"}</td><td className="small">{x.blurb}</td></tr>)}</tbody></table>
        <div className="row"><Btn disabled={!!busy} onClick={() => refresh("recent")}>{busy === "recent" ? "Refreshing…" : "Refresh market data (recent sets + owned)"}</Btn><Btn kind="blue" disabled={!!busy} onClick={() => refresh("all")}>{busy === "all" ? "Refreshing…" : "Full refresh (all sets, slow)"}</Btn></div>
        {log && <pre className="log">{log}</pre>}
        <div className="muted small">Cached prices older than 14 days are flagged OUTDATED on card pages. Graded prices: no free source publishes per-card graded prices, so a labeled estimate model is used unless you import real ones.</div>
        <h4>CSV import (backup price source)</h4>
        <div className="muted small">Lines: <code>card_id,price_usd</code> for raw Near Mint, or <code>card_id,price_usd,PSA,10</code> for graded. Example: <code>base1-4,950.00</code> and <code>base1-4,52000,PSA,10</code>. Card ids are set id + number (e.g. sv3pt5-199).</div>
        <textarea rows={4} value={csv} placeholder="base1-4,950.00" onChange={(e) => setCsv(e.target.value)} />
        <div className="row"><input type="file" accept=".csv,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
          <Btn small onClick={() => { const r = parseCsv(csv, cat, s.day); run((d) => { Object.assign(d.overrides, r.cards); Object.assign(d.gradedOverrides, r.graded); d.sourceUpdated["csv"] = new Date().toISOString(); }, { quiet: true }); setCsvMsg(`Imported ${r.ok} price(s). ${r.errors.length} problem(s)${r.errors.length ? ": " + r.errors.slice(0, 4).join("; ") : ""}`); }}>Import CSV</Btn></div>
        {csvMsg && <div className="muted small">{csvMsg}</div>}
        <h4>Manual price edit</h4>
        <div className="row"><input placeholder="card id e.g. base1-4" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} /><input placeholder="Near Mint $" style={{ width: 110 }} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
          <Btn small onClick={() => { const r = parseCsv(`${edit.id},${edit.price}`, cat, s.day); if (r.ok) { run((d) => { Object.assign(d.overrides, r.cards); Object.values(d.overrides).forEach(() => {}); d.overrides[edit.id].src = "Manual edit"; }, { quiet: true }); pushMsg("Price updated"); } else pushMsg(r.errors[0] || "Invalid", "error"); }}>Set price</Btn></div>
      </section>
      <section className="panel"><h3>Save data &amp; backups</h3>
        <p className="muted">Progress saves automatically to a local SQLite database after every action (all changes of an action are written in one transaction, so money and inventory cannot desync).</p>
        <label className="chk"><input type="checkbox" checked={st.autoBackup} onChange={(e) => set({ autoBackup: e.target.checked })} /> Automatic backup every <input type="number" min={1} max={60} style={{ width: 54 }} value={st.backupEveryDays} onChange={(e) => set({ backupEveryDays: Math.max(1, +e.target.value || 7) })} /> in-game days</label>
        <div className="row"><Btn small onClick={async () => { await flush(); const n = await api.backup("manual"); pushMsg("Backup created: " + n); loadB(); }}>Create backup now</Btn>
          <Btn small kind="blue" onClick={async () => { await flush(); const p = await api.exportSave(); pushMsg("Exported to " + p); loadB(); }}>Export save to Documents/PokemonTCGSim</Btn></div>
        {backups.length > 0 && <table className="tbl"><tbody>{backups.slice(0, 12).map((b) => <tr key={b.name}><td>{b.name}</td><td>{new Date(b.modified * 1000).toLocaleString()}</td><td>{(b.size / 1024).toFixed(0)} KB</td><td><Btn small kind="yellow" onClick={async () => { await api.restore(b.name); await reloadFromDisk(); pushMsg("Backup restored"); }}>Restore</Btn></td></tr>)}</tbody></table>}
        {exports.length > 0 && <><h4>Import an exported save (from Documents/PokemonTCGSim)</h4>{exports.slice(0, 6).map((n) => <div key={n} className="row"><span>{n}</span><Btn small kind="ghost" onClick={async () => { await api.importSave(n); await reloadFromDisk(); pushMsg("Save imported"); }}>Import</Btn></div>)}</>}
        <div className="row"><Btn small kind="ghost" onClick={() => setConfirmReset(true)}>Start a new game…</Btn></div>
      </section>
      <section className="panel"><h3>About</h3><p className="muted">Pokémon TCG Collector &amp; Card Shop Simulator · local single-player simulation, all money is fictional. Card data and art: pokemontcg.io. Prices: TCGplayer via pokemontcg.io and tcgcsv.com. Pokémon and card art are © Nintendo / Creatures / GAME FREAK / The Pokémon Company; this personal, non-commercial project is not affiliated with them.</p></section>
      {confirmReset && <Modal onClose={() => setConfirmReset(false)}><h2>Start a new game?</h2><p>This erases the current save (create a backup first if you want to keep it).</p><div className="row"><Btn kind="ghost" onClick={() => setConfirmReset(false)}>Cancel</Btn><Btn onClick={async () => { await api.backup("before-reset").catch(() => {}); resetGame(); setConfirmReset(false); }}>Erase and restart</Btn></div></Modal>}
    </div>
  );
}
