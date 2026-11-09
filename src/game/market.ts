import { Card, GameState, MarketEvent, Product, Tier } from "../types";
import { addDays, dayDiff, hrand, pick, randn, rnd } from "../util";
import { Catalog } from "./catalog";

export const POPULAR = ["Charizard", "Pikachu", "Eevee", "Umbreon", "Mew", "Mewtwo", "Gengar", "Lugia", "Rayquaza", "Gardevoir", "Greninja", "Lucario", "Snorlax", "Dragonite", "Blastoise", "Venusaur", "Sylveon", "Espeon", "Giratina", "Arceus"];
const POPULAR_SET = new Set(POPULAR.map((x) => x.toLowerCase()));
const VOL: Record<Tier, number> = { c: 0.04, u: 0.045, r: 0.055, h: 0.065, dr: 0.07, ur: 0.08, ir: 0.08, sir: 0.09, hr: 0.09, sh: 0.08, e: 0.03, promo: 0.06 };

export function newMarket(rngSeed: number): { g: number[]; events: MarketEvent[]; nextEvent: number } {
  return { g: [1], events: [], nextEvent: 1 };
}
export function gAt(s: GameState, day: number): number {
  const g = s.market.g; return g[Math.max(0, Math.min(day, g.length - 1))] ?? 1;
}
function evFactor(events: MarketEvent[], day: number, test: (e: MarketEvent) => boolean, sealed: boolean): number {
  let f = 1;
  for (const e of events) {
    if (day < e.day || !test(e)) continue;
    const dec = Math.exp(-(day - e.day) / e.tau);
    if (dec < 0.01) continue;
    f *= 1 + (sealed ? e.sealedMag : e.cardMag) * dec;
  }
  return f;
}
export function popularName(name: string): string | null {
  const l = name.toLowerCase();
  for (const p of POPULAR) if (l.includes(p.toLowerCase())) return p;
  return null;
}
/** Deterministic smooth value noise, 0 mean. */
function vnoise(key: string, day: number, period: number): number {
  const k = Math.floor(day / period); const t = day / period - k; const sm = t * t * (3 - 2 * t);
  const a = hrand(key + k) * 2 - 1, b = hrand(key + (k + 1)) * 2 - 1;
  return a + (b - a) * sm;
}
function setAge(cat: Catalog, s: GameState, setId: string | null, day: number): number {
  const si = setId ? cat.setById.get(setId) : null;
  if (!si) return 9999;
  return Math.max(0, dayDiff(addDays(s.startDate, day), si.rel));
}
/** Relative price factor of a card on a game day. Prices are anchored: price(day) = base * F(day)/F(anchor). */
export function cardFactor(cat: Catalog, s: GameState, c: Card, day: number): number {
  const g = gAt(s, day);
  const age = setAge(cat, s, c.setId, day);
  const recency = 1 + 0.1 * Math.exp(-age / 70);
  const pop = popularName(c.name);
  const setEv = evFactor(s.market.events, day, (e) => (e.kind === "tournament" || e.kind === "reprint") && e.target === c.setId, false);
  const nameEv = pop ? evFactor(s.market.events, day, (e) => e.kind === "hype" && e.target === pop, false) : 1;
  const vol = VOL[c.tier] * (pop ? 1.3 : 1);
  const w = Math.exp(vol * (vnoise(c.id + "w", day, 9) + 0.5 * vnoise(c.id + "v", day, 3)));
  const tr = hrand(c.id + "trend");
  const dir = tr < 0.12 ? -1 : tr > 0.88 ? 1 : 0;
  const drift = 1 + 0.18 * dir * Math.tanh(day / 80);
  return Math.pow(g, 0.9) * recency * setEv * nameEv * w * drift;
}
export function productFactor(cat: Catalog, s: GameState, p: Product, day: number): number {
  const g = gAt(s, day);
  const age = setAge(cat, s, p.setId, day);
  const recency = 1 + 0.18 * Math.exp(-age / 90);
  const ev = evFactor(s.market.events, day, (e) => !!p.setId && e.target === p.setId && e.kind !== "hype", true);
  const w = Math.exp(0.03 * vnoise(p.id + "w", day, 12));
  return Math.pow(g, 0.6) * recency * ev * w;
}

const EVENT_TEXT = {
  hype: (t: string) => `A new anime special spotlights ${t}. Collector demand for ${t} cards is climbing.`,
  tournament: (t: string) => `Tournament decklists feature cards from ${t}. Playable cards are trading up.`,
  reprint: (t: string) => `A reprint of ${t} was announced. Singles and sealed product are softening.`,
  shortage: (t: string) => `Distribution shortages hit ${t} sealed product. Boxes are getting scarce.`,
};
export function rollEvent(s: GameState, cat: Catalog, day: number): MarketEvent | null {
  if (rnd(s) > 0.11) return null;
  const kinds = ["hype", "hype", "tournament", "reprint", "shortage"] as const;
  const kind = pick(s, [...kinds]);
  const open = cat.sets.filter((x) => x.open);
  let target = "", cardMag = 0, sealedMag = 0, tau = 20, label = "";
  if (kind === "hype") { target = pick(s, POPULAR); cardMag = 0.1 + rnd(s) * 0.25; tau = 12 + rnd(s) * 14; label = target; }
  else {
    const now = addDays(s.startDate, day);
    const recent = open.filter((x) => dayDiff(now, x.rel) > 0 && dayDiff(now, x.rel) < 1100);
    const old = open.filter((x) => dayDiff(now, x.rel) > 700);
    const set = kind === "reprint" ? pick(s, old.length ? old : open) : pick(s, recent.length ? recent : open);
    target = set.id; label = set.name;
    if (kind === "tournament") { cardMag = 0.08 + rnd(s) * 0.12; sealedMag = cardMag * 0.5; tau = 18; }
    if (kind === "reprint") { cardMag = -(0.06 + rnd(s) * 0.08); sealedMag = -(0.1 + rnd(s) * 0.12); tau = 40; }
    if (kind === "shortage") { cardMag = 0.03; sealedMag = 0.1 + rnd(s) * 0.15; tau = 28; }
  }
  const ev: MarketEvent = { id: s.market.nextEvent++, day, kind, target, cardMag, sealedMag, tau, text: EVENT_TEXT[kind](label) };
  s.market.events.push(ev);
  if (s.market.events.length > 60) s.market.events.splice(0, s.market.events.length - 60);
  s.news.unshift({ day, text: ev.text }); if (s.news.length > 40) s.news.length = 40;
  return ev;
}
/** Advance the global index by one day (mean-reverting random walk). */
export function tickGlobal(s: GameState): void {
  const g = s.market.g; const last = Math.log(g[g.length - 1] ?? 1);
  const x = last * 0.97 + randn(s) * 0.008;
  g.push(Math.max(0.8, Math.min(1.25, Math.exp(x))));
}
