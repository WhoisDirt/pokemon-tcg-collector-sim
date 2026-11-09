import { beforeEach, describe, expect, it } from "vitest";
import { buildCatalog, Catalog } from "./game/catalog";
import { newGame, addItem } from "./game/state";
import { act, advanceDay, buyShop, buySingle, sellInstant, listForSale, sleepDays, dealsFor, buyDeal, currentRank } from "./game/actions";
import { openSealed } from "./game/packs";
import { submitGrading, SERVICES } from "./game/grading";
import { workShift } from "./game/work";
import { generateListing, buyListing, makeOffer, visitListing } from "./game/garage";
import { shopEntries, shopStock, totals, nmCents, gradedValue, rawValue } from "./game/economy";
import { hrand, GameError } from "./util";
import { serialize, deserialize } from "./store";
import { parseCsv } from "./sources";
import { GameState, RawCard, SetInfo } from "./types";

function mkSet(id: string, rel: string, era: any): SetInfo { return { id, name: id.toUpperCase() + " Set", series: "X", rel, total: 60, printed: 60, ptcgo: null, era, open: true, packSize: 10, tiers: { c: 20, u: 15, r: 10, h: 5, dr: 5, ir: 3, sir: 2, e: 2 } as any, symbolUrl: "", logoUrl: "" }; }
function mkCards(): RawCard[] {
  const out: RawCard[] = []; let n = 1;
  const add = (t: any, count: number, p: number) => { for (let i = 0; i < count; i++) out.push({ n: `${t}${i}`, c: String(n++), r: "x", t, s: "P", p: p * (1 + i * 0.1), v: "normal" }); };
  add("c", 20, 0.15); add("u", 15, 0.25); add("r", 10, 0.5); add("h", 5, 3); add("dr", 5, 5); add("ir", 3, 12); add("sir", 2, 80); add("e", 2, 0.05);
  return out;
}
let cat: Catalog; let s: GameState;
beforeEach(() => {
  const sets = [mkSet("new1", "2026-10-01", "modern"), mkSet("old1", "2019-05-01", "mid")];
  const sealed = [
    { id: 1, n: "New Booster Pack", set: "new1", grp: "New", pub: "2026-10-01", t: "pack", packs: 1, m: 5.5, lo: 4, exc: false },
    { id: 2, n: "New Booster Bundle", set: "new1", grp: "New", pub: "2026-10-01", t: "bundle", packs: 6, m: 70, lo: 60, exc: false },
    { id: 3, n: "New Elite Trainer Box", set: "new1", grp: "New", pub: "2026-10-01", t: "etb", packs: 9, m: 55, lo: 50, exc: false },
    { id: 4, n: "Old Booster Box", set: "old1", grp: "Old", pub: "2019-05-01", t: "box", packs: 36, m: 400, lo: 380, exc: false },
    { id: 5, n: "Poster Collection", set: null, grp: "?", pub: "2026-10-01", t: "collection", packs: 0, m: 20, lo: 15, exc: false },
  ] as any;
  cat = buildCatalog({ sets, sealed, cardsBySet: { new1: mkCards(), old1: mkCards() }, odds: { new1: { source: "t", era: "modern", slots: [{ n: 1, t: { r: 0.6, dr: 0.2, ir: 0.1, sir: 0.1 } }, { n: 3, t: { u: 1 } }, { n: 5, t: { c: 1 } }, { n: 1, t: { rev: 1 } }] } } as any });
  s = newGame(12345, "2026-11-09");
});
const ok = <T,>(fn: (d: GameState) => T) => { const r = act(s, cat, fn); s = r.state; return r.result; };
const total = (st: GameState) => st.cash + st.inv.reduce((a, i) => a + i.cost, 0);

describe("economy & atomicity", () => {
  it("starts with $40 and refuses purchases it cannot afford without changing state", () => {
    expect(s.cash).toBe(4000);
    const before = JSON.stringify(s);
    const key = shopEntries(cat, s).find((e) => e.prod.type === "etb" && e.retail)!.key;
    // find a day where stock exists
    expect(() => act(s, cat, (d) => buyShop(d, cat, key, 1))).toThrow(GameError);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("shop: retail uses MSRP, secondary uses market, stock is limited", () => {
    const es = shopEntries(cat, s);
    const pk = es.find((e) => e.prod.id === "p1" && e.retail)!;
    expect(pk.price).toBe(449);
    const etb = es.find((e) => e.prod.id === "p3")!;
    expect(etb.price).toBe(4999); expect(etb.tab).toBe("retail");
    const bundle = es.filter((e) => e.prod.id === "p2");
    expect(bundle.some((e) => e.retail && e.price === 2694)).toBe(true);
    expect(bundle.some((e) => e.tab === "secondary" && e.price > 2694)).toBe(true);
    const box = es.find((e) => e.prod.id === "p4")!; expect(box.tab).toBe("discontinued"); expect(box.price).toBeGreaterThan(30000);
  });
  it("buys a pack at MSRP, opens it, conserves cost basis, tracks stats", () => {
    s.cash = 100000; s.stats.spent = 0;
    // find a day with retail pack stock
    let key = "p1:r"; let tries = 0;
    while (shopStock(cat, s, shopEntries(cat, s).find((e) => e.key === key)!, (k) => hrand(k)) < 1 && tries++ < 30) ok((d) => advanceDay(d, cat));
    s.cash = 100000;
    ok((d) => buyShop(d, cat, key, 1));
    expect(s.cash).toBe(100000 - 449);
    const it = s.inv.find((i) => i.kind === "sealed")!; expect(it.cost).toBe(449);
    const r = ok((d) => openSealed(d, cat, it.id, 1));
    expect(r.packs[0].length).toBe(10);
    expect(s.inv.some((i) => i.kind === "sealed")).toBe(false);
    const basis = s.inv.reduce((a, i) => a + i.cost, 0);
    expect(Math.abs(basis - 449)).toBeLessThanOrEqual(10);
    expect(s.stats.packsOpened).toBe(1);
  });
  it("pull rates differ by set odds and respect rarity pools", () => {
    addItem(s, { kind: "sealed", ref: "p4", cond: "NM", variant: "std", qty: 3, cost: 0 });
    const r = ok((d) => openSealed(d, cat, s.inv[0].id, 3));
    expect(r.packs.length).toBe(108);
    const cardsN = s.inv.filter((i) => i.kind === "card").reduce((a, i) => a + i.qty, 0); expect(cardsN).toBe(1080);
  });
  it("selling: instant buylist pays less than market, listings pay fees later", () => {
    ok((d) => addItem(d, { kind: "card", ref: "new1-48", cond: "NM", variant: "std", qty: 2, cost: 2000 }));
    const it = s.inv.find((i) => i.ref === "new1-48")!;
    const before = s.cash;
    const q = ok((d) => sellInstant(d, cat, it.id, 1));
    expect(q.net).toBeLessThan(q.market); expect(s.cash).toBe(before + q.net); expect(s.inv[0].qty).toBe(1); expect(s.inv[0].cost).toBe(1000);
    const left = s.inv[0]; ok((d) => listForSale(d, cat, left.id, 1, 5000));
    expect(s.inv.length).toBe(0); expect(s.listings.length).toBe(1);
  });
  it("selling never creates money from nothing across many actions", () => {
    s.cash = 50000; const start = s.cash;
    ok((d) => buySingle(d, cat, "new1-50", "NM", 2));
    ok((d) => buySingle(d, cat, "new1-51", "LP", 1));
    const paid = start - s.cash; expect(paid).toBeGreaterThan(0);
    for (const it of [...s.inv]) ok((d) => sellInstant(d, cat, it.id, it.qty));
    expect(s.inv.length).toBe(0); expect(s.cash).toBeLessThan(start); // round trip loses money
  });
  it("work pays little and is capped per day", () => {
    const r = ok((d) => workShift(d, "cashier", 4)); expect(r.net).toBeLessThan(3000); expect(r.net).toBeGreaterThan(1500);
    expect(() => act(s, cat, (d) => workShift(d, "cashier", 4))).toThrow(/paid hours/);
    ok((d) => workShift(d, "cashier", 1));
    expect(s.work.today).toBe(5);
  });
  it("working all day for a month is nowhere near unlimited money", () => {
    s.cash = 0;
    for (let day = 0; day < 30; day++) { ok((d) => { workShift(d, "cashier", 5); }); ok((d) => sleepDays(d, cat, 1)); }
    expect(s.cash).toBeLessThan(30 * 3600); expect(s.cash).toBeGreaterThan(30 * 1200);
  });
});
describe("grading", () => {
  it("charges fees, takes time, returns grades and graded value is not a flat multiple", () => {
    s.cash = 100000; ok((d) => addItem(d, { kind: "card", ref: "new1-48", cond: "NM", variant: "std", qty: 1, cost: 3000 }));
    ok((d) => addItem(d, { kind: "card", ref: "new1-10", cond: "NM", variant: "std", qty: 1, cost: 100 }));
    const inv = s.inv.map((i) => i.id);
    const c0 = s.cash; ok((d) => submitGrading(d, cat, "PSA", "regular", inv.map((id) => ({ invId: id, qty: 1 })), 0));
    expect(c0 - s.cash).toBe(SERVICES.PSA[1].price * 2 + 800);
    expect(s.inv.length).toBe(0);
    ok((d) => sleepDays(d, cat, 8));
    const g = s.inv.filter((i) => i.grade); expect(g.length).toBe(2); g.forEach((i) => { expect(i.grade!.g).toBeGreaterThanOrEqual(1); expect(i.grade!.g).toBeLessThanOrEqual(10); });
    const hi = cat.cards.get("new1-48")!, lo = cat.cards.get("new1-10")!;
    const m1 = gradedValue(cat, s, hi, "PSA", 10).cents / nmCents(cat, s, hi), m2 = gradedValue(cat, s, lo, "PSA", 10).cents / nmCents(cat, s, lo);
    expect(Math.abs(m1 - m2)).toBeGreaterThan(0.3);
    expect(gradedValue(cat, s, hi, "PSA", 10).cents).toBeGreaterThan(gradedValue(cat, s, hi, "PSA", 9).cents);
  });
  it("rejects grading ineligible by value tier and Express without rank", () => {
    ok((d) => addItem(d, { kind: "card", ref: "new1-48", cond: "NM", variant: "std", qty: 1, cost: 3000 }));
    expect(() => act(s, cat, (d) => submitGrading(d, cat, "PSA", "express", [{ invId: s.inv[0].id, qty: 1 }], 0))).toThrow(/rank/i);
  });
});
describe("garage sales", () => {
  it("generates varied listings; buying is atomic and haggling works", () => {
    s.cash = 9999999; const types = new Set<string>(); let lots = 0, below = 0, over = 0;
    for (let i = 0; i < 80; i++) { const l = generateListing(s, cat, 0); if (!l) continue; types.add(l.type); lots++; if (l.ask < l.trueValue * 0.8) below++; if (l.ask > l.trueValue * 1.05) over++; }
    expect(types.size).toBeGreaterThanOrEqual(4); expect(below).toBeGreaterThan(0); expect(over).toBeGreaterThan(0); expect(below).toBeLessThan(lots * 0.6);
    const l = generateListing(s, cat, 0)!; ok((d) => { d.garage.push(l); });
    const cashBefore = s.cash;
    const g = s.garage[0]; if (!g.visited) ok((d) => visitListing(d, g.id));
    const res = ok((d) => { const t = d.garage.find((x) => x.id === g.id)!; const o = makeOffer(d, g.id, Math.round(t.ask * 0.99)); return buyListing(d, cat, g.id); });
    expect(s.garage.find((x) => x.id === g.id)).toBeUndefined(); expect(cashBefore - s.cash).toBeGreaterThan(0); expect(s.inv.length).toBeGreaterThan(0);
  });
});
describe("market & persistence", () => {
  it("prices start at the sourced value and move only gradually", () => {
    const c = cat.cards.get("new1-50")!; const p0 = nmCents(cat, s, c); expect(p0).toBe(Math.round(c.price! * 100));
    ok((d) => sleepDays(d, cat, 30));
    const p30 = nmCents(cat, s, c); const ratio = p30 / p0; expect(ratio).toBeGreaterThan(0.5); expect(ratio).toBeLessThan(2);
    expect(s.market.g.length).toBe(31);
  });
  it("serialization round-trips the full save", () => {
    ok((d) => addItem(d, { kind: "card", ref: "new1-50", cond: "LP", variant: "rev", qty: 3, cost: 777 }));
    ok((d) => sleepDays(d, cat, 3));
    const rows = Object.fromEntries(serialize(s)); const back = deserialize(rows)!;
    expect(back.cash).toBe(s.cash); expect(back.inv).toEqual(s.inv); expect(back.day).toBe(s.day); expect(back.market.g).toEqual(s.market.g);
  });
  it("CSV import supports raw and graded prices", () => {
    const r = parseCsv("card_id,price\nnew1-50,12.5\nnew1-50,300,PSA,10\nbogus,1", cat, 0);
    expect(r.cards["new1-50"].p).toBe(12.5); expect(r.graded["new1-50:PSA:10"]).toBe(30000); expect(r.errors.length).toBe(1);
    s.gradedOverrides = r.graded; expect(gradedValue(cat, s, cat.cards.get("new1-50")!, "PSA", 10).sourced).toBe(true);
  });
  it("achievements unlock", () => {
    ok((d) => workShift(d, "cashier", 2)); expect(s.achievements["work1"]).toBeDefined();
  });
});
