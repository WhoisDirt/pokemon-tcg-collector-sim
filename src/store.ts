import { useSyncExternalStore } from "react";
import { api } from "./api";
import { Catalog } from "./game/catalog";
import { act } from "./game/actions";
import { DEFAULT_SETTINGS, newGame } from "./game/state";
import { GameState } from "./types";
import { GameError } from "./util";
import { addItem } from "./game/state";
import { sfx } from "./audio";

let state: GameState = newGame(1, "2026-11-09");
let cat: Catalog | null = null;
const listeners = new Set<() => void>();
let saveTimer: any = null; let dirty = false; let saving: Promise<void> = Promise.resolve();
export const msgs: { id: number; text: string; kind: "error" | "info" }[] = [];
let msgVersion = 0; const msgListeners = new Set<() => void>();

const SLICES: Record<string, (s: GameState) => unknown> = {
  meta: (s) => ({ v: s.v, startDate: s.startDate, day: s.day, hour: s.hour, cash: s.cash, rng: s.rng, nextId: s.nextId, seenIntro: s.seenIntro, sourceUpdated: s.sourceUpdated }),
  inv: (s) => s.inv, listings: (s) => s.listings, grading: (s) => s.grading, market: (s) => s.market,
  prices: (s) => ({ overrides: s.overrides, gradedOverrides: s.gradedOverrides, productOverrides: s.productOverrides }),
  logs: (s) => ({ buys: s.buys, sells: s.sells, pulls: s.pulls }),
  progress: (s) => ({ stats: s.stats, achievements: s.achievements, work: s.work }),
  shop: (s) => ({ shopBought: s.shopBought, dealsBought: s.dealsBought }),
  garage: (s) => s.garage, nw: (s) => s.nw, settings: (s) => s.settings, news: (s) => s.news,
};
export function serialize(s: GameState): [string, string][] { return Object.entries(SLICES).map(([k, f]) => [k, JSON.stringify(f(s))] as [string, string]); }
export function deserialize(rows: Record<string, string>): GameState | null {
  if (!rows.meta) return null;
  const g = newGame(1);
  const p = (k: string) => (rows[k] ? JSON.parse(rows[k]) : undefined);
  Object.assign(g, p("meta"));
  g.inv = p("inv") ?? []; g.listings = p("listings") ?? []; g.grading = p("grading") ?? []; g.market = p("market") ?? g.market;
  Object.assign(g, p("prices") ?? {}); Object.assign(g, p("logs") ?? {}); Object.assign(g, p("progress") ?? {}); Object.assign(g, p("shop") ?? {});
  g.garage = p("garage") ?? []; g.nw = p("nw") ?? []; g.settings = { ...DEFAULT_SETTINGS, ...(p("settings") ?? {}) }; g.news = p("news") ?? [];
  g.toasts = [];
  return g;
}
function schedule() {
  dirty = true; if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; void flush(); }, 350);
}
export function flush(): Promise<void> {
  if (!dirty) return saving; dirty = false;
  const rows = serialize(state);
  saving = saving.then(() => api.save(rows)).catch((e) => pushMsg("Save failed: " + e, "error"));
  return saving;
}
export async function initStore(c: Catalog): Promise<GameState> {
  cat = c;
  const rows = await api.load();
  state = deserialize(rows) ?? starterKit(newGame(), c);
  if (!rows.meta) { dirty = true; await flush(); }
  emit();
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => { void flush(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(); });
  }
  return state;
}
export function setState(s: GameState) { state = s; emit(); schedule(); }
export function resetGame() { state = starterKit(newGame(), getCat()); dirty = true; emit(); void flush(); }
export async function reloadFromDisk() { const rows = await api.load(); const g = deserialize(rows); if (g) { state = g; emit(); } }
function emit() { listeners.forEach((l) => l()); }
export const getState = () => state;
export function getCat(): Catalog { if (!cat) throw new Error("catalog not loaded"); return cat; }
export function useGame(): GameState { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state); }
export function useMsgs() { return useSyncExternalStore((l) => { msgListeners.add(l); return () => msgListeners.delete(l); }, () => msgVersion); }
export function pushMsg(text: string, kind: "error" | "info" = "info") {
  const id = Date.now() + Math.random(); msgs.push({ id, text, kind }); msgVersion++; msgListeners.forEach((l) => l());
  setTimeout(() => { const i = msgs.findIndex((m) => m.id === id); if (i >= 0) { msgs.splice(i, 1); msgVersion++; msgListeners.forEach((l) => l()); } }, 4500);
}
/** Run an atomic game action. Returns the result, or undefined if the action was rejected (error shown to the player). */
export function run<T>(fn: (d: GameState) => T, opts: { quiet?: boolean } = {}): T | undefined {
  try {
    const before = state.toasts.length;
    const { state: ns, result } = act(state, getCat(), fn);
    const fresh = ns.toasts.splice(0, ns.toasts.length);
    state = ns; emit(); schedule();
    if (!opts.quiet) for (const t of fresh) pushMsg(t.text);
    return result;
  } catch (e) {
    if (e instanceof GameError) { pushMsg(e.message, "error"); sfx("error"); return undefined; }
    console.error(e); pushMsg("Unexpected error: " + (e as Error).message, "error"); return undefined;
  }
}

/** New-game kit: one free booster pack from the newest openable set. */
export function starterKit(g: GameState, c: Catalog): GameState {
  const newest = [...c.sets].reverse().find((x) => x.open && c.packProductBySet.has(x.id));
  if (newest) addItem(g, { kind: "sealed", ref: c.packProductBySet.get(newest.id)!.id, cond: "NM", variant: "std", qty: 1, cost: 0 });
  return g;
}
