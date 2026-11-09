import { api } from "./api";

interface AudioCfg { music: boolean; sfx: boolean; musicVol: number; sfxVol: number }
let cfg: AudioCfg = { music: true, sfx: true, musicVol: 0.35, sfxVol: 0.6 };
let ctx: AudioContext | null = null;
const ac = () => { if (!ctx) { const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (C) ctx = new C(); } if (ctx && ctx.state === "suspended") void ctx.resume(); return ctx; };

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.2, delay = 0, slide = 0) {
  const c = ac(); if (!c || !cfg.sfx) return;
  const o = c.createOscillator(), g = c.createGain(); const t = c.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * cfg.sfxVol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export type Sfx = "click" | "buy" | "sell" | "error" | "tear" | "flip" | "rare" | "epic" | "legend" | "coin" | "work";
export function sfx(name: Sfx) {
  if (!cfg.sfx) return;
  switch (name) {
    case "click": tone(660, 0.05, "square", 0.08); break;
    case "buy": tone(520, 0.08, "square", 0.12); tone(780, 0.12, "square", 0.12, 0.07); break;
    case "sell": case "coin": tone(988, 0.07, "square", 0.12); tone(1319, 0.2, "square", 0.12, 0.07); break;
    case "error": tone(180, 0.18, "sawtooth", 0.14); tone(140, 0.2, "sawtooth", 0.14, 0.1); break;
    case "tear": tone(300, 0.35, "sawtooth", 0.1, 0, 1200); break;
    case "flip": tone(420, 0.06, "triangle", 0.12); break;
    case "rare": [523, 659, 784].forEach((f, i) => tone(f, 0.15, "square", 0.12, i * 0.08)); break;
    case "epic": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, "square", 0.14, i * 0.09)); break;
    case "legend": [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, "square", 0.15, i * 0.1)); tone(130, 0.9, "triangle", 0.2, 0); break;
    case "work": tone(330, 0.1, "triangle", 0.1); tone(392, 0.12, "triangle", 0.1, 0.1); break;
  }
}

// ---------------- Music ----------------
export interface TrackDef { id: string; path: string; file: string; title: string }
const T = (id: string, path: string, title: string): TrackDef => ({ id, path, file: title.replace(/[^A-Za-z0-9 ._-]/g, "") + ".mp3", title });
export const PLAYLIST: TrackDef[] = [
  T("pkmn-rse-soundtrack", "Disc 1/05 - Littleroot Town.mp3", "Littleroot Town (Ruby-Sapphire)"),
  T("pokemon-music-archive-rgby", "03 Pallet Town.mp3", "Pallet Town (Red-Blue)"),
  T("pkmn-rse-soundtrack", "Disc 1/11 - Route 101.mp3", "Route 101 (Ruby-Sapphire)"),
  T("pokemon-music-archive-rgby", "16 Pokemon Center.mp3", "Pokemon Center (Red-Blue)"),
  T("pkmn-rse-soundtrack", "Disc 1/12 - Oldale Town.mp3", "Oldale Town (Ruby-Sapphire)"),
  T("pokemon-music-archive-rgby", "17 Viridian City • Pewter City • Saffron City.mp3", "Viridian City (Red-Blue)"),
  T("pkmn-rse-soundtrack", "Disc 1/13 - Pokémon Center.mp3", "Pokemon Center (Ruby-Sapphire)"),
  T("pkmn-rse-soundtrack", "Disc 1/20 - Petalburg City.mp3", "Petalburg City (Ruby-Sapphire)"),
  T("pokemon-music-archive-rgby", "12 Route 1 • Underground Path.mp3", "Route 1 (Red-Blue)"),
  T("pkmn-rse-soundtrack", "Disc 1/32 - Slateport City.mp3", "Slateport City (Ruby-Sapphire)"),
  T("pkmn-rse-soundtrack", "Disc 1/41 - Verdanturf Town.mp3", "Verdanturf Town (Ruby-Sapphire)"),
  T("pkmn-rse-soundtrack", "Disc 1/35 - Cycling.mp3", "Cycling (Ruby-Sapphire)"),
  T("pkmn-rse-soundtrack", "Disc 1/36 - Game Corner.mp3", "Game Corner (Ruby-Sapphire)"),
  T("pokemon-music-archive-rgby", "25 Evolution • Safari Zone.mp3", "Safari Zone (Red-Blue)"),
  T("pkmn-rse-soundtrack", "Disc 1/27 - Rustboro City.mp3", "Rustboro City (Ruby-Sapphire)"),
  T("pkmn-rse-soundtrack", "Disc 1/44 - Fallarbor Town.mp3", "Fallarbor Town (Ruby-Sapphire)"),
];
const trackUrl = (t: TrackDef) => `https://archive.org/download/${t.id}/${encodeURI(t.path)}`;

let audioEl: HTMLAudioElement | null = null;
let files: string[] = []; let order: number[] = []; let pos = 0; let dir = ""; let mode: "off" | "files" | "chiptune" = "off";
let nowPlaying = ""; let started = false; let chipTimer: any = null; let gestureHooked = false;
const mlisteners = new Set<() => void>();
export const onMusicChange = (f: () => void) => { mlisteners.add(f); return () => mlisteners.delete(f); };
const fire = () => mlisteners.forEach((f) => f());
export const musicInfo = () => ({ mode, nowPlaying, files: files.length, dir });

export function setAudioConfig(c: Partial<AudioCfg>) {
  const wasMusic = cfg.music; cfg = { ...cfg, ...c };
  if (audioEl) audioEl.volume = Math.min(1, cfg.musicVol);
  if (chipGain) chipGain.gain.value = cfg.musicVol * 0.25;
  if (started) { if (cfg.music && !wasMusic) void startMusic(); if (!cfg.music && wasMusic) stopMusic(); }
}
function shuffle(n: number) { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export async function refreshTracks() { files = await api.musicList(); dir = await api.musicDir(); order = shuffle(files.length); pos = 0; fire(); }
function hookGesture() {
  if (gestureHooked) return; gestureHooked = true;
  const h = () => { window.removeEventListener("pointerdown", h); gestureHooked = false; if (cfg.music && started && !(audioEl && !audioEl.paused) && mode !== "chiptune") void startMusic(); };
  window.addEventListener("pointerdown", h);
}
export async function startMusic() {
  started = true; if (!cfg.music) return;
  if (!audioEl) {
    audioEl = new Audio(); audioEl.volume = Math.min(1, cfg.musicVol);
    audioEl.addEventListener("ended", () => { void nextTrack(); });
    audioEl.addEventListener("error", () => { if (files.length > 1) void nextTrack(); });
  }
  if (!files.length) await refreshTracks();
  if (files.length) {
    stopChip(); mode = "files";
    const name = files[order[pos % order.length]];
    try { audioEl.src = await api.musicSrc(dir, name); nowPlaying = name.replace(/\.[a-z0-9]+$/i, ""); await audioEl.play(); fire(); }
    catch { hookGesture(); fire(); }
  } else startChip();
}
export async function nextTrack() { pos++; if (mode === "files") await startMusic(); else if (cfg.music) await startMusic(); }
export function stopMusic() { audioEl?.pause(); stopChip(); mode = "off"; nowPlaying = ""; fire(); }
export async function downloadSoundtrack(onProgress: (done: number, total: number, msg: string) => void): Promise<number> {
  let ok = 0;
  for (let i = 0; i < PLAYLIST.length; i++) {
    const t = PLAYLIST[i]; onProgress(i, PLAYLIST.length, `Downloading ${t.title}`);
    try { await api.musicDownload(trackUrl(t), t.file); ok++; }
    catch (e) { onProgress(i, PLAYLIST.length, `Skipped ${t.title}: ${e}`); }
    if (i === 0 || i === 3) { const before = files.length; await refreshTracks(); if (before === 0 && files.length && cfg.music) void startMusic(); }
  }
  await refreshTracks(); onProgress(PLAYLIST.length, PLAYLIST.length, `Done: ${ok} of ${PLAYLIST.length} tracks`);
  return ok;
}
/** Auto-download in the background on first run (silently). */
export async function ensureSoundtrack(offline: boolean): Promise<void> {
  await refreshTracks();
  if (files.length >= 4 || offline || !api.isTauri()) return;
  await downloadSoundtrack(() => {});
}

// Built-in chiptune fallback (original loop) so there is always background music
let chipGain: GainNode | null = null; let step = 0;
function stopChip() { if (chipTimer) { clearInterval(chipTimer); chipTimer = null; } }
function startChip() {
  const c = ac(); if (!c) return; stopChip(); mode = "chiptune"; nowPlaying = "Built-in chiptune (add MP3s or download the soundtrack in Settings)"; fire();
  if (!chipGain) { chipGain = c.createGain(); chipGain.connect(c.destination); }
  chipGain.gain.value = cfg.musicVol * 0.25;
  const lead = [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4], bass = [0, 0, 7, 7, 5, 5, 7, 7];
  const f = (semi: number, base = 261.63) => base * Math.pow(2, semi / 12);
  chipTimer = setInterval(() => {
    if (!cfg.music) return; const t = c.currentTime;
    const note = (fr: number, d: number, type: OscillatorType, v: number) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = fr; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(chipGain!); o.start(t); o.stop(t + d + 0.02); };
    note(f(lead[step % lead.length]), 0.25, "square", 0.5);
    if (step % 2 === 0) note(f(bass[(step / 2) % bass.length], 130.8), 0.45, "triangle", 0.7);
    step++;
  }, 260);
}
