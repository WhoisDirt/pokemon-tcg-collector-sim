import { Condition, GameState, InvItem, Settings, Variant, Grade } from "../types";
import { newMarket } from "./market";
import { START_CASH } from "./economy";
import { GameError } from "../util";

export const DEFAULT_SETTINGS: Settings = {
  sfx: true, music: true, musicVol: 0.35, sfxVol: 0.6, animSpeed: 1, scale: 1, theme: "kanto",
  updateFreq: "manual", offline: false, sources: { pokemontcgio: true, tcgcsv: true }, autoBackup: true, backupEveryDays: 7,
};
export function today(): string { return new Date().toISOString().slice(0, 10); }
export function newGame(seed = Math.floor(Math.random() * 4294967295), startDate = today()): GameState {
  return {
    v: 1, startDate, day: 0, hour: 0, cash: START_CASH, rng: seed >>> 0, nextId: 1, inv: [], listings: [], grading: [],
    market: newMarket(seed), overrides: {}, gradedOverrides: {}, productOverrides: {}, buys: [], sells: [], pulls: [],
    stats: { packsOpened: 0, cardsCollected: 0, cardsSold: 0, highestPull: null, earnedWork: 0, earnedSales: 0, spent: 0, realizedProfit: 0, shiftsWorked: 0, boxesOpened: 0, gradedCount: 0, psa10: 0, garageDeals: 0 },
    achievements: {}, work: { today: 0, streak: 0, workedToday: false, shifts: {}, lastWorkDay: -1 },
    shopBought: {}, dealsBought: {}, garage: [], nw: [], settings: { ...DEFAULT_SETTINGS }, news: [], sourceUpdated: {}, toasts: [], seenIntro: false,
  };
}
export const uid = (d: GameState) => "i" + (d.nextId++).toString(36);
export function sameStack(a: InvItem, k: { kind: string; ref: string; cond: Condition; variant: Variant; grade?: Grade }) {
  return !a.grade && !k.grade && a.kind === k.kind && a.ref === k.ref && a.cond === k.cond && a.variant === k.variant;
}
export function addItem(d: GameState, it: { kind: "card" | "sealed"; ref: string; cond: Condition; variant: Variant; qty: number; cost: number; grade?: Grade }) {
  if (it.qty <= 0) return;
  if (!it.grade) {
    const ex = d.inv.find((x) => sameStack(x, it));
    if (ex) { ex.qty += it.qty; ex.cost += it.cost; return; }
  }
  d.inv.push({ id: uid(d), kind: it.kind, ref: it.ref, cond: it.cond, variant: it.variant, qty: it.qty, cost: it.cost, acq: d.day, grade: it.grade });
  if (it.kind === "card") d.stats.cardsCollected += it.qty;
}
/** Removes qty from a stack; returns the proportional cost basis removed. */
export function takeItem(d: GameState, id: string, qty: number): { item: InvItem; cost: number } {
  const i = d.inv.findIndex((x) => x.id === id);
  if (i < 0) throw new GameError("Item not found in inventory");
  const it = d.inv[i];
  if (qty <= 0 || qty > it.qty) throw new GameError("Invalid quantity");
  const snapshot = { ...it };
  let cost: number;
  if (qty === it.qty) { cost = it.cost; d.inv.splice(i, 1); }
  else { cost = Math.round((it.cost * qty) / it.qty); it.qty -= qty; it.cost -= cost; }
  return { item: snapshot, cost };
}
export function spend(d: GameState, amount: number, why = "") {
  if (!Number.isFinite(amount) || amount < 0) throw new GameError("Invalid amount");
  if (d.cash < amount) throw new GameError("Not enough cash");
  d.cash -= amount; d.stats.spent += amount;
}
export function earn(d: GameState, amount: number) { d.cash += amount; }
export function pushLog<T>(arr: T[], e: T, cap = 500) { arr.unshift(e); if (arr.length > cap) arr.length = cap; }
export function toast(d: GameState, text: string) { d.toasts.push({ id: d.nextId++, text }); if (d.toasts.length > 6) d.toasts.shift(); }
