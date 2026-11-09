import { Card, GameState, Product } from "../types";
import { Catalog } from "../game/catalog";
import { nmCents, productMarket } from "../game/economy";
import { popularName } from "../game/market";

const cache = new WeakMap<Catalog, Card[]>();
export function trendPool(cat: Catalog): Card[] {
  let p = cache.get(cat);
  if (!p) { p = [...cat.cards.values()].filter((c) => (c.price ?? 0) >= 4 && c.tier !== "promo").sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 3500); cache.set(cat, p); }
  return p;
}
export function risersAndFallers(cat: Catalog, s: GameState, days: number, n: number) {
  const from = Math.max(0, s.day - days);
  const rows = trendPool(cat).map((card) => { const now = nmCents(cat, s, card, "std", s.day), then = nmCents(cat, s, card, "std", from); return { card, now, then, pct: (now - then) / then }; });
  rows.sort((a, b) => b.pct - a.pct);
  return { up: rows.slice(0, n), down: rows.slice(-n).reverse(), rows };
}
export function sealedMovers(cat: Catalog, s: GameState, days: number, n: number) {
  const from = Math.max(0, s.day - days);
  const rows = cat.products.filter((p) => p.setId && p.market >= 25 && !p.derived).map((p) => { const now = productMarket(cat, s, p, s.day), then = productMarket(cat, s, p, from); return { p, now, then, pct: (now - then) / then }; });
  rows.sort((a, b) => b.pct - a.pct);
  return { up: rows.slice(0, n), down: rows.slice(-n).reverse() };
}
export function highDemand(cat: Catalog, s: GameState, n: number) {
  const rows = trendPool(cat).filter((c) => popularName(c.name)).slice(0, 400).map((c) => ({ card: c, now: nmCents(cat, s, c) }));
  return rows.sort((a, b) => b.now - a.now).slice(0, n);
}
