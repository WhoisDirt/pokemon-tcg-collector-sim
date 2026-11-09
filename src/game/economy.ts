import { Card, Company, Condition, COND_MULT, GameState, InvItem, Product, SealedType, Tier, Variant } from "../types";
import { addDays, cents, dayDiff } from "../util";
import { Catalog } from "./catalog";
import { cardFactor, productFactor } from "./market";

export const START_CASH = 4000;
const FALLBACK: Record<Tier, number> = { c: 0.12, u: 0.18, r: 0.4, h: 1.2, dr: 2.5, ur: 6, ir: 5, sir: 30, hr: 20, sh: 8, e: 0.05, promo: 1 };

export interface PriceInfo { cents: number; estimated: boolean; source: string; updated: string | null; stale: boolean }

/** Raw Near-Mint market price in cents on a given day (default today). */
export function rawBase(s: GameState, c: Card, v: Variant): { p: number; est: boolean; src: string; upd: string | null; anchor: number } {
  const ov = s.overrides[c.id];
  if (ov && v === "std") return { p: ov.p, est: false, src: ov.src, upd: ov.upd, anchor: ov.anchor };
  if (v === "rev" && c.revPrice) return { p: c.revPrice, est: false, src: "TCGplayer via pokemontcg.io", upd: c.priceUpdated, anchor: 0 };
  if (c.price != null) return { p: c.price, est: false, src: "TCGplayer via pokemontcg.io", upd: c.priceUpdated, anchor: 0 };
  return { p: FALLBACK[c.tier], est: true, src: "Rarity-tier estimate (no sourced price)", upd: null, anchor: 0 };
}
export function nmCents(cat: Catalog, s: GameState, c: Card, v: Variant = "std", day = s.day): number {
  const b = rawBase(s, c, v);
  const f = cardFactor(cat, s, c, day) / cardFactor(cat, s, c, b.anchor);
  return Math.max(5, cents(b.p * f));
}
export function priceInfo(cat: Catalog, s: GameState, c: Card, v: Variant = "std"): PriceInfo {
  const b = rawBase(s, c, v);
  const stale = !b.upd ? true : Math.abs(dayDiff(new Date().toISOString().slice(0, 10), b.upd.replace(/\//g, "-"))) > 14;
  return { cents: nmCents(cat, s, c, v), estimated: b.est, source: b.src, updated: b.upd, stale };
}
export function rawValue(cat: Catalog, s: GameState, c: Card, cond: Condition, v: Variant = "std", day = s.day): number {
  return Math.max(5, Math.round(nmCents(cat, s, c, v, day) * COND_MULT[cond]));
}

// ---------- Graded value model ----------
const GRADE_FLOOR: Record<number, number> = { 10: 1200, 9: 450, 8: 250, 7: 180, 6: 140, 5: 120, 4: 100, 3: 90, 2: 80, 1: 70 };
function psaMult(g: number, raw: number, era: string): number {
  const r = raw / 100;
  const tier = r < 5 ? 0 : r < 20 ? 1 : r < 100 ? 2 : r < 500 ? 3 : 4;
  const m10 = [6, 4.2, 3.2, 2.7, 2.3][tier] * (era === "vintage" ? 3.2 : era === "classic" ? 1.7 : 1);
  const t: Record<number, number> = { 10: m10, 9: 1 + (m10 - 1) * 0.28, 8: 0.95 + (m10 - 1) * 0.1, 7: 0.78, 6: 0.62, 5: 0.5, 4: 0.4, 3: 0.33, 2: 0.28, 1: 0.22 };
  return t[Math.round(g)] ?? 1;
}
export const GRADE_MODEL_NOTE = "No free source publishes per-card graded prices, so graded values use a clearly labeled estimate model (tiered multiples of the sourced raw price with floors; vintage cards get larger gem premiums). Import real graded prices via CSV to override.";
export function gradedValue(cat: Catalog, s: GameState, c: Card, co: Company, g: number, v: Variant = "std"): { cents: number; sourced: boolean } {
  const key = `${c.id}:${co}:${g}`;
  const ov = s.gradedOverrides[key];
  if (ov != null) return { cents: ov, sourced: true };
  const raw = nmCents(cat, s, c, v);
  const era = cat.setById.get(c.setId)?.era || "mid";
  let base: number; let gg = g;
  if (co === "PSA") { base = Math.max(GRADE_FLOOR[Math.round(g)] ?? 70, raw * psaMult(g, raw, era)); }
  else {
    // BGS / CGC: half-grades. 9.5 ~ PSA10 discount, 10 (Pristine) premium.
    const asPsa = g >= 10 ? 10 : g >= 9.5 ? 10 : Math.round(g);
    const p10 = Math.max(GRADE_FLOOR[10], raw * psaMult(10, raw, era));
    const pv = Math.max(GRADE_FLOOR[asPsa] ?? 70, raw * psaMult(asPsa, raw, era));
    if (g >= 10) base = p10 * (co === "BGS" ? 3.2 : 1.8);
    else if (g >= 9.5) base = p10 * (co === "BGS" ? 0.92 : 0.8);
    else base = pv * (co === "BGS" ? 0.98 : 0.9);
    gg = g;
  }
  return { cents: Math.round(base), sourced: false };
}

// ---------- Sealed products ----------
export function msrpOf(p: Product): number | null {
  const rel = p.pub; const l = p.name.toLowerCase();
  const modern = rel >= "2023-03-01"; const mid = rel >= "2017-01-01" && !modern;
  const t: SealedType = p.type;
  if (modern) {
    if (t === "pack") return 449; if (t === "bundle") return 2694; if (t === "box") return 16164;
    if (t === "etb") return /pokemon center|pok.mon center/.test(l) ? 5999 : 4999;
    if (t === "bb") return /stadium/.test(l) ? 5999 : 2199;
    if (t === "minitin") return 999;
    if (t === "blister") return /2-pack|2 pack/.test(l) ? 999 : 1399;
    if (t === "tin") return /poke ball|pok. ball/.test(l) ? 1499 : 2699;
    if (t === "collection") {
      if (/ultra-premium|ultra premium/.test(l)) return 11999;
      if (/premium/.test(l)) return 4999;
      if (/poster/.test(l)) return 1499;
      if (/\bex box\b|\bex\b.*box/.test(l)) return 2199;
      if (/binder/.test(l)) return 2999;
      if (/knock out/.test(l)) return 999;
    }
    return null;
  }
  if (mid) {
    if (t === "pack") return 399; if (t === "bundle") return 2394; if (t === "box") return 14364;
    if (t === "etb") return 3999; if (t === "minitin") return 799; if (t === "blister") return 1399; if (t === "tin") return 2499;
  }
  return null;
}
export function productMarket(cat: Catalog, s: GameState, p: Product, day = s.day): number {
  const ov = s.productOverrides[p.id];
  const base = ov ? ov.p : p.market; const anchor = ov ? ov.anchor : 0;
  const f = productFactor(cat, s, p, day) / productFactor(cat, s, p, anchor);
  let price = cents(base * f);
  const m = msrpOf(p);
  if (m && p.type !== "collection") price = Math.max(price, Math.round(m * 1.02));
  return Math.max(50, price);
}
export type ShopTab = "retail" | "discontinued" | "secondary" | "special";
export interface ShopEntry { key: string; prod: Product; tab: ShopTab; price: number; msrp: number | null; market: number; retail: boolean }
export function productDate(s: GameState) { return addDays(s.startDate, s.day); }
export function inPrint(s: GameState, p: Product): boolean {
  return dayDiff(productDate(s), p.pub) < 420;
}
export function shopEntries(cat: Catalog, s: GameState): ShopEntry[] {
  const out: ShopEntry[] = [];
  for (const p of cat.products) {
    const market = productMarket(cat, s, p); const msrp = msrpOf(p); const print = inPrint(s, p);
    const special = ["tin", "minitin", "blister", "collection", "bb"].includes(p.type);
    if (!print || !msrp) {
      out.push({ key: p.id + ":m", prod: p, tab: special ? "special" : print ? "secondary" : "discontinued", price: market, msrp, market, retail: false });
      continue;
    }
    const ratio = market / msrp;
    // Retail listing at MSRP (sold out most of the time if the product is hot)
    out.push({ key: p.id + ":r", prod: p, tab: special ? "special" : "retail", price: msrp, msrp, market, retail: true });
    if (ratio > 1.25) out.push({ key: p.id + ":m", prod: p, tab: "secondary", price: market, msrp, market, retail: false });
  }
  return out;
}
export function shopStock(cat: Catalog, s: GameState, e: ShopEntry, hr: (k: string) => number): number {
  const day = s.day; const p = e.prod;
  const base = { pack: 12, bundle: 6, etb: 4, box: 3, bb: 5, minitin: 6, tin: 4, blister: 6, collection: 3 }[p.type];
  let qty = 0;
  if (e.retail) {
    const ratio = e.market / (e.msrp || e.market);
    const pIn = ratio <= 1.2 ? 0.93 : Math.max(0.04, Math.min(0.5, 0.5 / Math.pow(ratio, 1.5) + 0.02));
    if (hr(`${e.key}:in:${day}`) < pIn) qty = Math.max(1, Math.round(base * (0.4 + hr(`${e.key}:q:${day}`)) * (ratio > 1.4 ? 0.35 : 1)));
  } else {
    const present = hr(`${e.key}:s:${day}`) < (e.tab === "discontinued" ? 0.8 : 0.9);
    if (present) { const scale = e.price > 30000 ? 0.4 : e.price > 8000 ? 0.7 : 1.2; qty = Math.max(1, Math.round(base * scale * (0.3 + hr(`${e.key}:n:${day}`)))); if (e.price > 100000) qty = 1; }
  }
  return Math.max(0, qty - (s.shopBought[e.key + ":" + day] || 0));
}

export function itemUnitValue(cat: Catalog, s: GameState, it: InvItem): number {
  if (it.kind === "sealed") { const p = cat.productById.get(it.ref); return p ? productMarket(cat, s, p) : 0; }
  const c = cat.cards.get(it.ref); if (!c) return 0;
  if (it.grade) return gradedValue(cat, s, c, it.grade.co, it.grade.g, it.variant).cents;
  return rawValue(cat, s, c, it.cond, it.variant);
}
export function itemName(cat: Catalog, it: { kind: string; ref: string; grade?: { co: string; g: number } }): string {
  if (it.kind === "sealed") return cat.productById.get(it.ref)?.name || "Sealed product";
  const c = cat.cards.get(it.ref);
  return (c ? c.name : "Card") + (it.grade ? ` (${it.grade.co} ${it.grade.g})` : "");
}
export function totals(cat: Catalog, s: GameState) {
  let cards = 0, sealed = 0, basis = 0, graded = 0, count = 0;
  for (const it of s.inv) {
    const v = itemUnitValue(cat, s, it) * it.qty;
    if (it.kind === "sealed") sealed += v; else if (it.grade) graded += v; else cards += v;
    basis += it.cost; count += it.qty;
  }
  const inGrading = s.grading.filter((g) => !g.done).reduce((a, g) => a + g.cards.reduce((x, c) => x + (cat.cards.get(c.ref) ? rawValue(cat, s, cat.cards.get(c.ref)!, c.cond, c.variant) : 0), 0), 0);
  const listed = s.listings.reduce((a, l) => a + (l.kind === "card" ? (cat.cards.get(l.ref) ? (l.grade ? gradedValue(cat, s, cat.cards.get(l.ref)!, l.grade.co, l.grade.g, l.variant).cents : rawValue(cat, s, cat.cards.get(l.ref)!, l.cond, l.variant)) : 0) : (cat.productById.get(l.ref) ? productMarket(cat, s, cat.productById.get(l.ref)!) : 0)) * l.qty, 0);
  const inv = cards + sealed + graded + inGrading + listed;
  const listBasis = s.listings.reduce((a, l) => a + l.cost, 0) + s.grading.filter((g) => !g.done).reduce((a, g) => a + g.cards.reduce((x, c) => x + c.cost, 0), 0);
  return { cards, sealed, graded, inGrading, listed, inv, basis: basis + listBasis, count, netWorth: s.cash + inv, unrealized: inv - basis - listBasis };
}
// Selling: instant "buylist" offers and marketplace fees
export function buylistRate(valueCents: number): number {
  if (valueCents < 100) return 0.4; if (valueCents < 500) return 0.55; if (valueCents < 5000) return 0.68; if (valueCents < 50000) return 0.74; return 0.78;
}
export const marketFee = (gross: number) => Math.round(gross * 0.1255) + 30;
export function listingSaleChance(ask: number, market: number): number {
  const r = ask / Math.max(1, market);
  let p = r <= 0.8 ? 0.7 : r <= 0.95 ? 0.45 : r <= 1.05 ? 0.22 : r <= 1.15 ? 0.08 : r <= 1.3 ? 0.02 : 0.004;
  if (market < 200) p *= 0.5; if (market > 50000) p *= 0.6;
  return p;
}
