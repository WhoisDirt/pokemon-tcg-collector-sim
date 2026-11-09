import { Card, Condition, GameState, InvItem, Variant } from "../types";
import { Catalog } from "./catalog";
import { GameError, fail, hrand, rnd, weighted, pick } from "../util";
import { ShopEntry, buylistRate, gradedValue, itemName, itemUnitValue, listingSaleChance, marketFee, nmCents, productMarket, rawValue, shopEntries, shopStock, totals, msrpOf } from "./economy";
import { addItem, pushLog, spend, takeItem, toast, uid } from "./state";
import { rollEvent, tickGlobal } from "./market";
import { processGrading } from "./grading";
import { garageDaily } from "./garage";
import { checkAchievements, rankOf } from "./progress";
import { DAY_HOURS } from "./work";

/** Run a game action atomically: on any error the original state is untouched. */
export function act<T>(s: GameState, cat: Catalog, fn: (d: GameState) => T): { state: GameState; result: T } {
  const d = structuredClone(s);
  const result = fn(d);
  settleTime(d, cat);
  checkAchievements(d, cat);
  return { state: d, result };
}
export function currentRank(cat: Catalog, d: GameState) { return rankOf(totals(cat, d).netWorth); }
export const hr = (k: string) => hrand(k);

export function advanceDay(d: GameState, cat: Catalog) {
  d.day++;
  d.work.streak = d.work.workedToday ? d.work.streak + 1 : 0; d.work.workedToday = false; d.work.today = 0;
  const living = 400; if (d.cash >= living) d.cash -= living; else d.cash = 0;
  tickGlobal(d); rollEvent(d, cat, d.day);
  for (const k of Object.keys(d.shopBought)) if (!k.endsWith(":" + d.day)) delete d.shopBought[k];
  for (const k of Object.keys(d.dealsBought)) if (!k.startsWith(d.day + ":")) delete d.dealsBought[k];
  processGrading(d, cat);
  // player's marketplace listings
  const keep: typeof d.listings = [];
  for (const l of d.listings) {
    const market = l.kind === "card"
      ? (l.grade ? gradedValue(cat, d, cat.cards.get(l.ref)!, l.grade.co, l.grade.g, l.variant).cents : rawValue(cat, d, cat.cards.get(l.ref)!, l.cond, l.variant))
      : productMarket(cat, d, cat.productById.get(l.ref)!);
    if (rnd(d) < listingSaleChance(l.ask, market)) {
      const gross = l.ask * l.qty; const fee = marketFee(gross); const net = gross - fee;
      d.cash += net; d.stats.earnedSales += net; d.stats.cardsSold += l.kind === "card" ? l.qty : 0; d.stats.realizedProfit += net - l.cost;
      pushLog(d.sells, { day: d.day, name: itemName(cat, l), ref: l.ref, qty: l.qty, gross, fee, net, cost: l.cost, how: "Marketplace listing" });
      toast(d, `Sold ${itemName(cat, l)} for ${(net / 100).toFixed(2)} dollars after fees`);
    } else keep.push(l);
  }
  d.listings = keep;
  garageDaily(d, cat, currentRank(cat, d));
  const t = totals(cat, d);
  d.nw.push({ day: d.day, cash: d.cash, inv: t.inv }); if (d.nw.length > 800) d.nw.shift();
}
export function settleTime(d: GameState, cat: Catalog) {
  let guard = 0;
  while (d.hour >= DAY_HOURS && guard++ < 400) { d.hour -= DAY_HOURS; advanceDay(d, cat); }
}
export function sleepDays(d: GameState, cat: Catalog, n: number) {
  for (let i = 0; i < n; i++) { d.hour = 0; advanceDay(d, cat); }
}
export function endDay(d: GameState, cat: Catalog) { advanceDay(d, cat); d.hour = 0; }

// ---------- Shop ----------
export function findEntry(cat: Catalog, d: GameState, key: string): ShopEntry {
  const [pid, kind] = key.split(":"); const p = cat.productById.get(pid); if (!p) fail("Unknown product");
  const e = shopEntries(cat, d).find((x) => x.key === key); if (!e) fail("That listing is no longer available");
  return e;
}
export function buyShop(d: GameState, cat: Catalog, key: string, qty: number) {
  if (qty < 1) fail("Invalid quantity");
  const e = findEntry(cat, d, key);
  const stock = shopStock(cat, d, e, hr);
  if (stock < qty) fail(stock === 0 ? "Sold out today" : `Only ${stock} left in stock`);
  const total = e.price * qty;
  spend(d, total);
  d.shopBought[key + ":" + d.day] = (d.shopBought[key + ":" + d.day] || 0) + qty;
  addItem(d, { kind: "sealed", ref: e.prod.id, cond: "NM", variant: "std", qty, cost: total });
  pushLog(d.buys, { day: d.day, kind: e.tab, name: e.prod.name, ref: e.prod.id, qty, cents: total });
}
// ---------- Singles ----------
export const SHIPPING = 131;
export const SINGLES_MARKUP = 1.08;
export function singlePrice(cat: Catalog, d: GameState, c: Card, cond: Condition, v: Variant = "std") { return Math.max(10, Math.round(rawValue(cat, d, c, cond, v) * SINGLES_MARKUP)); }
export function buySingle(d: GameState, cat: Catalog, cardId: string, cond: Condition, qty: number, v: Variant = "std") {
  const c = cat.cards.get(cardId); if (!c) fail("Unknown card");
  if (qty < 1 || qty > 20) fail("Invalid quantity");
  const total = singlePrice(cat, d, c, cond, v) * qty + SHIPPING;
  spend(d, total);
  addItem(d, { kind: "card", ref: c.id, cond, variant: v, qty, cost: total });
  pushLog(d.buys, { day: d.day, kind: "single", name: c.name, ref: c.id, qty, cents: total });
}
export interface Deal { id: string; card: Card; cond: Condition; price: number; market: number; seller: string; tag: "steal" | "below" | "fair" }
let dealPoolCache: WeakMap<Catalog, Card[]> = new WeakMap();
export function dealsFor(cat: Catalog, d: GameState): Deal[] {
  let pool = dealPoolCache.get(cat);
  if (!pool) { pool = [...cat.cards.values()].filter((c) => c.price != null && c.price >= 1.5 && c.price <= 800 && c.tier !== "promo"); dealPoolCache.set(cat, pool); }
  const out: Deal[] = []; const names = ["CardKing", "BinderBob", "HolofoilHannah", "PackRat99", "VintageVic", "MintMarcy", "FlipperFred", "ShinySteve"];
  for (let i = 0; i < 14; i++) {
    const k = `${d.startDate}|deal|${d.day}|${i}`;
    const c = pool[Math.floor(hrand(k + "c") * pool.length)];
    const r = hrand(k + "d"); const cr = hrand(k + "n");
    const cond: Condition = cr < 0.4 ? "NM" : cr < 0.7 ? "LP" : cr < 0.9 ? "MP" : "HP";
    let m: number; let tag: Deal["tag"];
    if (i < 1 && r < 0.35) { m = 0.62 + hrand(k + "m") * 0.15; tag = "steal"; }
    else if (r < 0.2) { m = 0.78 + hrand(k + "m") * 0.12; tag = "below"; }
    else { m = 0.98 + hrand(k + "m") * 0.12; tag = "fair"; }
    const market = rawValue(cat, d, c, cond);
    out.push({ id: `${d.day}:${i}`, card: c, cond, price: Math.max(10, Math.round(market * m)), market, seller: names[Math.floor(hrand(k + "s") * names.length)], tag });
  }
  return out;
}
export function buyDeal(d: GameState, cat: Catalog, dealId: string) {
  if (d.dealsBought[dealId]) fail("Someone already bought that listing");
  const deal = dealsFor(cat, d).find((x) => x.id === dealId); if (!deal) fail("Listing expired");
  const total = deal.price + SHIPPING;
  spend(d, total);
  d.dealsBought[dealId] = d.day;
  addItem(d, { kind: "card", ref: deal.card.id, cond: deal.cond, variant: "std", qty: 1, cost: total });
  pushLog(d.buys, { day: d.day, kind: "deal", name: deal.card.name, ref: deal.card.id, qty: 1, cents: total });
}
// ---------- Selling ----------
export function sellQuote(cat: Catalog, d: GameState, it: InvItem, qty: number) {
  const unit = itemUnitValue(cat, d, it);
  const rate = buylistRate(unit);
  const gross = Math.round(unit * rate) * qty;
  const cost = Math.round((it.cost * qty) / it.qty);
  return { market: unit * qty, rate, gross, fee: 0, net: gross, cost, profit: gross - cost };
}
export function sellInstant(d: GameState, cat: Catalog, invId: string, qty: number) {
  const it = d.inv.find((x) => x.id === invId); if (!it) fail("Item not found");
  const q = sellQuote(cat, d, it, qty);
  const t = takeItem(d, invId, qty);
  d.cash += q.net; d.stats.earnedSales += q.net; d.stats.realizedProfit += q.net - t.cost;
  if (it.kind === "card") d.stats.cardsSold += qty;
  pushLog(d.sells, { day: d.day, name: itemName(cat, it), ref: it.ref, qty, gross: q.gross, fee: 0, net: q.net, cost: t.cost, how: "Shop buylist" });
  return q;
}
export function sellMany(d: GameState, cat: Catalog, picks: { id: string; qty: number }[]) {
  let net = 0, profit = 0;
  for (const p of picks) { const q = sellInstant(d, cat, p.id, p.qty); net += q.net; profit += q.profit; }
  return { net, profit };
}
export function listForSale(d: GameState, cat: Catalog, invId: string, qty: number, askPerUnit: number) {
  if (askPerUnit < 25) fail("Asking price too low");
  const t = takeItem(d, invId, qty);
  d.listings.push({ id: uid(d), kind: t.item.kind, ref: t.item.ref, cond: t.item.cond, variant: t.item.variant, qty, ask: Math.round(askPerUnit), cost: t.cost, day: d.day, grade: t.item.grade });
}
export function cancelListing(d: GameState, cat: Catalog, id: string) {
  const i = d.listings.findIndex((l) => l.id === id); if (i < 0) fail("Listing not found");
  const l = d.listings[i]; d.listings.splice(i, 1);
  addItem(d, { kind: l.kind, ref: l.ref, cond: l.cond, variant: l.variant, qty: l.qty, cost: l.cost, grade: l.grade });
  if (l.kind === "card") d.stats.cardsCollected -= l.qty;
}
export { msrpOf, nmCents };
