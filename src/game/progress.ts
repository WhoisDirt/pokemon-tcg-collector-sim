import { GameState } from "../types";
import { Catalog } from "./catalog";
import { totals, rawValue, itemUnitValue } from "./economy";
import { toast } from "./state";

export const RANKS = [
  { name: "Rookie Trainer", at: 0 }, { name: "Collector", at: 15000 }, { name: "Card Dealer", at: 60000 },
  { name: "Shop Owner", at: 250000 }, { name: "Master Trader", at: 1000000 },
];
export function rankOf(nw: number): number { let r = 0; RANKS.forEach((x, i) => { if (nw >= x.at) r = i; }); return r; }
export interface Ach { id: string; name: string; desc: string; check: (d: GameState, cat: Catalog, t: ReturnType<typeof totals>) => boolean }
function ownsCardValue(d: GameState, cat: Catalog, min: number) {
  return d.inv.some((i) => i.kind === "card" && itemUnitValue(cat, d, i) >= min);
}
export const ACHIEVEMENTS: Ach[] = [
  { id: "work1", name: "First Paycheck", desc: "Finish your first work shift.", check: (d) => d.stats.shiftsWorked >= 1 },
  { id: "pack1", name: "First Pack Opened", desc: "Rip your first booster pack.", check: (d) => d.stats.packsOpened >= 1 },
  { id: "pack25", name: "Pack Addict", desc: "Open 25 booster packs.", check: (d) => d.stats.packsOpened >= 25 },
  { id: "pack100", name: "Pack Hoarder", desc: "Open 100 booster packs.", check: (d) => d.stats.packsOpened >= 100 },
  { id: "profit1", name: "First Profitable Sale", desc: "Sell something for more than you paid.", check: (d) => d.sells.some((s) => s.net > s.cost) },
  { id: "graded1", name: "First Graded Card", desc: "Get a card back from grading.", check: (d) => d.stats.gradedCount >= 1 },
  { id: "card100", name: "First $100 Card", desc: "Own a single card worth $100+.", check: (d, c) => ownsCardValue(d, c, 10000) },
  { id: "coll1000", name: "First $1,000 Collection", desc: "Hold $1,000 of inventory.", check: (d, c, t) => t.inv >= 100000 },
  { id: "box1", name: "First Booster Box", desc: "Open a booster box.", check: (d) => d.stats.boxesOpened >= 1 },
  { id: "psa10", name: "First PSA 10", desc: "Pull a PSA 10 from grading.", check: (d) => d.stats.psa10 >= 1 },
  { id: "set1", name: "Complete a Set", desc: "Own at least one of every card in a set.", check: (d, c) => completeSets(d, c).length > 0 },
  { id: "deal1", name: "Deal Hunter", desc: "Buy a garage-sale lot worth 25%+ more than you paid.", check: (d) => d.stats.garageDeals >= 1 },
  { id: "nw1k", name: "Four Figures", desc: "Reach $1,000 net worth.", check: (d, c, t) => t.netWorth >= 100000 },
  { id: "nw10k", name: "Five Figures", desc: "Reach $10,000 net worth.", check: (d, c, t) => t.netWorth >= 1000000 },
  { id: "sold100", name: "Busy Reseller", desc: "Sell 100 cards.", check: (d) => d.stats.cardsSold >= 100 },
  { id: "pull500", name: "Hit the Jackpot", desc: "Pull a single card worth $500+.", check: (d) => (d.stats.highestPull?.value || 0) >= 50000 },
];
export function completeSets(d: GameState, cat: Catalog): string[] {
  const own = new Set(d.inv.filter((i) => i.kind === "card").map((i) => i.ref));
  const out: string[] = [];
  for (const s of cat.sets) {
    const list = cat.bySet.get(s.id)!.filter((c) => c.tier !== "promo");
    if (list.length >= 5 && list.length <= 400 && list.every((c) => own.has(c.id))) out.push(s.id);
  }
  return out;
}
export function setProgress(d: GameState, cat: Catalog, setId: string): { owned: number; total: number } {
  const own = new Set(d.inv.filter((i) => i.kind === "card").map((i) => i.ref));
  const list = cat.bySet.get(setId) || [];
  return { owned: list.filter((c) => own.has(c.id)).length, total: list.length };
}
export function checkAchievements(d: GameState, cat: Catalog) {
  const t = totals(cat, d);
  for (const a of ACHIEVEMENTS) {
    if (d.achievements[a.id] != null) continue;
    if (a.check(d, cat, t)) { d.achievements[a.id] = d.day; toast(d, `Achievement unlocked: ${a.name}`); }
  }
}
