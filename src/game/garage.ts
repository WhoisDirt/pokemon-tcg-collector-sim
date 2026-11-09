import { Card, Condition, GameState, GarageItem, GarageListing } from "../types";
import { Catalog } from "./catalog";
import { fail, pick, rnd, weighted } from "../util";
import { addItem, pushLog, spend, toast, uid } from "./state";
import { itemUnitValue, productMarket, rawValue } from "./economy";

const FIRST = ["Mike", "Jenna", "Carlos", "Priya", "Dave", "Sam", "Lauren", "Tom", "Aisha", "Greg", "Nina", "Rob", "Kelsey", "Marcus", "Beth", "Owen", "Tasha", "Pete", "Dana", "Luis"];
const LAST = ["R.", "T.", "M.", "K.", "B.", "S.", "W.", "H.", "L.", "P."];
const COND_TXT: Record<Condition, string> = { NM: "mint condition", LP: "light wear", MP: "some play wear", HP: "heavy wear", DMG: "damaged" };
const pools = new WeakMap<Catalog, { cheap: Card[]; mid: Card[]; high: Card[]; all: Card[] }>();
function cardPools(cat: Catalog) {
  let p = pools.get(cat);
  if (!p) {
    const all = [...cat.cards.values()].filter((c) => c.tier !== "promo");
    p = { all, cheap: all.filter((c) => (c.price ?? 0) < 1.5), mid: all.filter((c) => (c.price ?? 0) >= 2 && (c.price ?? 0) < 40), high: all.filter((c) => (c.price ?? 0) >= 40) };
    pools.set(cat, p);
  }
  return p;
}
function rollCond(d: GameState): Condition { return weighted(d, { NM: 0.35, LP: 0.3, MP: 0.2, HP: 0.12, DMG: 0.03 }); }
export function listingTrueValue(cat: Catalog, d: GameState, items: GarageItem[]): number {
  return items.reduce((a, it) => a + (it.kind === "card" ? rawValue(cat, d, cat.cards.get(it.ref)!, it.cond, it.variant) : productMarket(cat, d, cat.productById.get(it.ref)!)) * it.qty, 0);
}
function dealMult(d: GameState, rank: number): { m: number; label: string } {
  const r = rnd(d);
  const steal = 0.07 + rank * 0.01;
  if (r < steal) return { m: 0.3 + rnd(d) * 0.3, label: "steal" };
  if (r < steal + 0.17) return { m: 0.7 + rnd(d) * 0.2, label: "below" };
  if (r < steal + 0.17 + 0.38) return { m: 0.95 + rnd(d) * 0.1, label: "fair" };
  return { m: 1.1 + rnd(d) * 0.35, label: "over" };
}
function mergeItems(items: GarageItem[]): GarageItem[] {
  const m = new Map<string, GarageItem>();
  for (const it of items) { const k = `${it.kind}|${it.ref}|${it.cond}|${it.variant}`; const e = m.get(k); if (e) e.qty += it.qty; else m.set(k, { ...it }); }
  return [...m.values()];
}
export function generateListing(d: GameState, cat: Catalog, rank: number, forceType?: GarageListing["type"]): GarageListing | null {
  const P = cardPools(cat);
  const type = forceType || weighted(d, { single: 0.38, lot: 0.24, binder: 0.16, garage: 0.14, sealedlot: 0.08 });
  const seller = pick(d, FIRST) + " " + pick(d, LAST);
  const id = uid(d);
  let items: GarageItem[] = []; let title = ""; let desc = ""; let risky = false; let condNote = ""; let shown = 0; let blind = false; let gas = 0; let mood = "";
  let m = dealMult(d, rank); let claimedBias = 1;
  const sets = cat.sets.filter((s) => s.open && (cat.pools.get(s.id)?.c?.length || 0) > 0);
  if (type === "single") {
    const pool = rnd(d) < 0.12 + rank * 0.03 ? P.high : P.mid;
    const c = pick(d, pool); const cond = rollCond(d);
    items = [{ kind: "card", ref: c.id, cond, variant: "std", qty: 1 }];
    title = `${c.name} ${cat.setById.get(c.setId)?.name || ""}`; shown = 1;
    risky = cond === "HP" || cond === "DMG" || rnd(d) < 0.12;
    condNote = risky ? "Seller says \"mint\" but photos are blurry" : `Seller notes ${COND_TXT[cond]}`;
    desc = pick(d, [`Pulled this from a pack years ago. ${COND_TXT[cond]}. Cash only, pickup today.`, `Clearing out my desk drawer. ${c.name}, ${COND_TXT[cond]}.`, `Don't collect anymore. Selling single card. Message me.`]);
    mood = pick(d, ["Friendly", "In a hurry", "Firm"]);
  } else if (type === "lot") {
    const set = pick(d, sets); const n = 5 + Math.floor(rnd(d) * 11); const pool = cat.bySet.get(set.id)!.filter((c) => c.tier !== "promo" && c.tier !== "e");
    for (let i = 0; i < n; i++) items.push({ kind: "card", ref: pick(d, pool).id, cond: rollCond(d), variant: "std", qty: 1 });
    // collections include a couple of better cards
    const good = pool.filter((c) => (c.price ?? 0) > 5); if (good.length && rnd(d) < 0.6) items.push({ kind: "card", ref: pick(d, good).id, cond: rollCond(d), variant: "std", qty: 1 });
    title = `${items.length}-card ${set.name} collection`; shown = Math.min(8, items.length);
    desc = pick(d, [`Mixed cards from ${set.name}. Selling as one lot only.`, `Collection from my kid's old binder (${set.name}). All sorts of rarities.`]);
    risky = rnd(d) < 0.25; condNote = risky ? "Condition mixed, some may be played" : "Photos show most of the cards"; mood = pick(d, ["Friendly", "Firm", "In a hurry"]);
  } else if (type === "binder") {
    const old = sets.filter((s) => s.era !== "modern"); const set = pick(d, old.length ? old : sets);
    const set2 = rnd(d) < 0.5 ? pick(d, old.length ? old : sets) : set;
    const n = 40 + Math.floor(rnd(d) * 80);
    for (let i = 0; i < n; i++) {
      const sp = rnd(d) < 0.5 ? set : set2; const pool = cat.bySet.get(sp.id)!.filter((c) => c.tier !== "promo");
      const bulk = pool.filter((c) => c.tier === "c" || c.tier === "u"); const good = pool.filter((c) => c.tier !== "c" && c.tier !== "u" && c.tier !== "e");
      const useGood = good.length && rnd(d) < 0.09;
      items.push({ kind: "card", ref: pick(d, useGood ? good : bulk.length ? bulk : pool).id, cond: weighted(d, { NM: 0.15, LP: 0.3, MP: 0.3, HP: 0.2, DMG: 0.05 }), variant: "std", qty: 1 });
    }
    title = `Old binder: ${set.name}${set2 !== set ? " + " + set2.name : ""}`; shown = 6; blind = true; risky = true; gas = 200 + Math.floor(rnd(d) * 300);
    desc = "Found in my parents' attic. Don't know what any of it is worth. Come see it, pickup only."; condNote = "Unknown: binder pages, contents partially visible";
    claimedBias = 0.5 + rnd(d) * 0.9; mood = "Clueless but firm on price";
  } else if (type === "garage") {
    const n = 4 + Math.floor(rnd(d) * 5);
    for (let i = 0; i < n; i++) items.push({ kind: "card", ref: pick(d, rnd(d) < 0.2 ? P.mid : P.cheap.length ? P.cheap : P.all).id, cond: rollCond(d), variant: "std", qty: 1 });
    const old = cat.products.filter((p) => p.setId && p.packs > 0 && p.market < 200 && p.market > 3 && p.type !== "collection");
    const ns = Math.floor(rnd(d) * 3); for (let i = 0; i < ns && old.length; i++) items.push({ kind: "sealed", ref: pick(d, old).id, cond: "NM", variant: "std", qty: 1 });
    title = "Garage sale: toys, cards and odds and ends"; shown = Math.min(4, items.length); blind = true; gas = 200 + Math.floor(rnd(d) * 250);
    desc = "Big garage sale this weekend. Pokemon cards and some sealed packs mixed in. Everything must go."; condNote = "Dusty. Sealed items look untouched but unverified"; risky = true; claimedBias = 0.6 + rnd(d) * 0.7; mood = "Wants it gone";
  } else {
    const old = cat.products.filter((p) => p.setId && p.packs > 0 && p.market > 15 && p.market < 600 && !p.exclusive && p.type !== "collection");
    if (!old.length) return null;
    const p = pick(d, old); items = [{ kind: "sealed", ref: p.id, cond: "NM", variant: "std", qty: 1 }];
    title = p.name; shown = 1; desc = "Never opened. Bought extra back then. Open to offers."; risky = rnd(d) < 0.15; condNote = risky ? "Box has some shelf wear; seal looks intact" : "Sealed, good shape"; mood = pick(d, ["Friendly", "Firm"]);
  }
  items = mergeItems(items);
  const trueValue = listingTrueValue(cat, d, items);
  if (trueValue < 60) return null;
  let claimed = Math.round(trueValue * (blind ? claimedBias : 0.9 + rnd(d) * 0.2));
  // "risky" listings: the seller claims the better condition
  if (risky && !blind) claimed = Math.round(trueValue * (1.05 + rnd(d) * 0.25));
  let ask = Math.round((blind ? claimed : trueValue) * m.m);
  if (blind) ask = Math.round(trueValue * Math.min(1.4, claimedBias * m.m * 1.15));
  ask = Math.max(100, Math.round(ask / 25) * 25);
  const firmness = rnd(d);
  const floor = Math.round(ask * (0.95 - 0.3 * (1 - firmness)));
  const exp = d.day + 2 + Math.floor(rnd(d) * 5);
  return { id, type, seller, title, desc, items, shown, ask, floor, firmness, trueValue, claimedValue: claimed, condNote, risky, posted: d.day, expires: exp, offers: 0, sniped: false, visited: !blind, gas, mood };
}
export function garageDaily(d: GameState, cat: Catalog, rank: number) {
  // expire, snipe
  d.garage = d.garage.filter((l) => {
    if (l.expires < d.day) return false;
    const q = Math.max(0, Math.min(0.7, 1 - l.ask / Math.max(1, l.trueValue)));
    if (rnd(d) < 0.1 + q * 0.5) { toast(d, `A listing you may have seen ("${l.title.slice(0, 28)}") was bought by someone else`); return false; }
    return true;
  });
  const n = weighted(d, { "0": 0.25, "1": 0.35, "2": 0.25, "3": 0.15 });
  for (let i = 0; i < Number(n); i++) { const l = generateListing(d, cat, rank); if (l) d.garage.push(l); }
  if (d.garage.length > 14) d.garage.splice(0, d.garage.length - 14);
}
export function browseListings(d: GameState, cat: Catalog, rank: number): number {
  let added = 0; const n = rnd(d) < 0.55 ? 1 : rnd(d) < 0.5 ? 2 : 0;
  for (let i = 0; i < n; i++) { const l = generateListing(d, cat, rank); if (l) { l.posted = d.day; d.garage.push(l); added++; } }
  if (d.garage.length > 14) d.garage.splice(0, d.garage.length - 14);
  d.hour += 1;
  return added;
}
export function visitListing(d: GameState, id: string) {
  const l = d.garage.find((x) => x.id === id); if (!l) fail("Listing is gone");
  if (l.visited) return;
  spend(d, l.gas); d.hour += 1; l.visited = true; l.shown = l.items.length;
}
export function makeOffer(d: GameState, id: string, offer: number): { status: "accepted" | "counter" | "declined" | "gone"; msg: string } {
  const l = d.garage.find((x) => x.id === id); if (!l) fail("Listing is gone");
  if (offer < 100) fail("Offer too low to send");
  if (l.offers >= 3) { return { status: "declined", msg: `${l.seller}: "I'm done haggling. Take it or leave it."` }; }
  l.offers++;
  if (offer >= l.ask) return { status: "accepted", msg: "Already at or above asking price." };
  if (offer >= l.floor) { l.ask = offer; return { status: "accepted", msg: `${l.seller}: "Deal. ${(offer / 100).toFixed(2)} works for me."` }; }
  if (offer >= l.floor * 0.88) { const c = Math.round(l.floor * 1.02); l.ask = Math.min(l.ask, c); return { status: "counter", msg: `${l.seller}: "Can't go that low. How about ${(l.ask / 100).toFixed(2)}?"` }; }
  if (rnd(d) < 0.25) { d.garage = d.garage.filter((x) => x.id !== id); return { status: "gone", msg: `${l.seller} is offended by the lowball and removed the listing.` }; }
  return { status: "declined", msg: `${l.seller}: "No way. That's way too low."` };
}
export function buyListing(d: GameState, cat: Catalog, id: string): { value: number; paid: number } {
  const l = d.garage.find((x) => x.id === id); if (!l) fail("Listing is gone");
  if (!l.visited) fail("Visit this seller first to inspect the lot");
  spend(d, l.ask);
  const vals = l.items.map((it) => (it.kind === "card" ? rawValue(cat, d, cat.cards.get(it.ref)!, it.cond, it.variant) : productMarket(cat, d, cat.productById.get(it.ref)!)) * it.qty);
  const tot = vals.reduce((a, b) => a + b, 0) || 1;
  l.items.forEach((it, i) => addItem(d, { kind: it.kind, ref: it.ref, cond: it.cond, variant: it.variant, qty: it.qty, cost: Math.round((l.ask * vals[i]) / tot) }));
  pushLog(d.buys, { day: d.day, kind: "garage", name: l.title, ref: l.id, qty: l.items.reduce((a, b) => a + b.qty, 0), cents: l.ask });
  if (tot > l.ask * 1.25) d.stats.garageDeals++;
  d.garage = d.garage.filter((x) => x.id !== id);
  return { value: tot, paid: l.ask };
}
