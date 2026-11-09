import { GameState, PackSlot, Tier, Variant, Card, Era } from "../types";
import { Catalog } from "./catalog";
import { rnd, weighted, fail, pick } from "../util";
import { itemUnitValue, productMarket, rawValue } from "./economy";
import { addItem, takeItem, pushLog, toast } from "./state";

const CHAIN: Record<string, Tier[]> = {
  dr: ["dr", "ur", "h", "r"], ur: ["ur", "dr", "h", "r"], ir: ["ir", "ur", "dr", "r"], sir: ["sir", "ur", "hr", "ir", "dr", "r"], hr: ["hr", "ur", "sir", "r"],
  sh: ["sh", "h", "r"], h: ["h", "r", "u"], r: ["r", "u", "c"], u: ["u", "c", "r"], c: ["c", "u", "r"], e: ["e", "c"],
};
const DEFAULT_SLOTS: Record<Era, PackSlot[]> = {
  vintage: [{ n: 1, t: { h: 0.34, r: 0.66 } }, { n: 3, t: { u: 1 } }, { n: 6, t: { c: 1 } }, { n: 1, t: { e: 1 } }],
  classic: [{ n: 1, t: { r: 0.6, h: 0.3, dr: 0.1 } }, { n: 3, t: { u: 1 } }, { n: 4, t: { c: 1 } }, { n: 1, t: { rev: 1 } }, { n: 1, t: { e: 1 } }],
  mid: [{ n: 1, t: { r: 0.5, h: 0.3, dr: 0.14, ur: 0.06 } }, { n: 3, t: { u: 1 } }, { n: 4, t: { c: 1 } }, { n: 1, t: { rev: 1 } }, { n: 1, t: { e: 1 } }],
  modern: [{ n: 1, t: { r: 0.6, dr: 0.17, ur: 0.06, h: 0.17 } }, { n: 3, t: { u: 1 } }, { n: 4, t: { c: 1 } }, { n: 1, t: { rev: 1 } }, { n: 1, t: { e: 1 } }],
};
export interface PulledCard { ref: string; v: Variant; value: number; tier: Tier }

export function pickCard(s: { rng: number }, cat: Catalog, setId: string, tier: Tier): Card | null {
  const pool = cat.pools.get(setId); if (!pool) return null;
  for (const t of CHAIN[tier] || [tier]) { const arr = pool[t]; if (arr && arr.length) return pick(s, arr); }
  const any = Object.values(pool).flat().filter((c) => c!.tier !== "promo") as Card[];
  return any.length ? pick(s, any) : null;
}
export function pullPack(d: GameState, cat: Catalog, setId: string): PulledCard[] {
  const set = cat.setById.get(setId); if (!set) fail("Unknown set");
  const slots = cat.odds[setId]?.slots || DEFAULT_SLOTS[set.era];
  const out: PulledCard[] = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.n; i++) {
      const w = { ...slot.t }; const key = weighted(d, w as Record<string, number>);
      let v: Variant = "std"; let tier = key as Tier;
      if (key === "rev") { v = "rev"; tier = weighted(d, { c: 0.55, u: 0.35, r: 0.1 }); }
      const c = pickCard(d, cat, setId, tier); if (!c) continue;
      const val = rawValue(cat, d, c, "NM", v);
      out.push({ ref: c.id, v, value: val, tier: c.tier });
    }
  }
  return out;
}
export interface OpenResult { setId: string; productName: string; packs: PulledCard[][]; value: number; cost: number }
/** Opens `qty` units of a sealed stack (every pack inside each unit). Atomic: runs inside a cloned draft. */
export function openSealed(d: GameState, cat: Catalog, invId: string, qty: number): OpenResult {
  const it = d.inv.find((x) => x.id === invId);
  if (!it || it.kind !== "sealed") fail("That item cannot be opened");
  const p = cat.productById.get(it.ref); if (!p) fail("Unknown product");
  if (!p.setId || p.packs <= 0) fail("This product has no booster packs inside to open. Keep it sealed as a collectible or sell it.");
  const take = takeItem(d, invId, qty);
  const nPacks = p.packs * qty; const packCost = take.cost / nPacks;
  const packs: PulledCard[][] = []; let value = 0;
  for (let i = 0; i < nPacks; i++) {
    const pulled = pullPack(d, cat, p.setId);
    const pv = pulled.reduce((a, c) => a + c.value, 0) || 1;
    for (const c of pulled) {
      addItem(d, { kind: "card", ref: c.ref, cond: "NM", variant: c.v, qty: 1, cost: Math.round(packCost * (c.value / pv)) });
      if (!d.stats.highestPull || c.value > d.stats.highestPull.value) d.stats.highestPull = { ref: c.ref, value: c.value, day: d.day };
    }
    packs.push(pulled); value += pv;
  }
  d.stats.packsOpened += nPacks; if (p.type === "box") d.stats.boxesOpened += qty;
  pushLog(d.pulls, { day: d.day, setId: p.setId, productName: p.name + (qty > 1 ? ` x${qty}` : ""), cards: packs.flat().map((c) => ({ ref: c.ref, v: c.v, val: c.value })), value, cost: Math.round(take.cost) }, 150);
  const best = packs.flat().sort((a, b) => b.value - a.value)[0];
  if (best && best.value >= 5000) toast(d, `Big pull! ${cat.cards.get(best.ref)?.name} worth ${(best.value / 100).toFixed(0)} dollars`);
  return { setId: p.setId, productName: p.name, packs, value, cost: Math.round(take.cost) };
}
