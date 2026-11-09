import { Card, Product, RawCatalog, SealedType, SetInfo, SetOdds, Tier } from "../types";

export interface Catalog {
  sets: SetInfo[]; setById: Map<string, SetInfo>; cards: Map<string, Card>; bySet: Map<string, Card[]>;
  pools: Map<string, Partial<Record<Tier, Card[]>>>; products: Product[]; productById: Map<string, Product>;
  odds: Record<string, SetOdds>; packProductBySet: Map<string, Product>;
}

const imgBase = "https://images.pokemontcg.io";

export function buildCatalog(raw: RawCatalog): Catalog {
  const sets = [...raw.sets].sort((a, b) => a.rel.localeCompare(b.rel));
  const setById = new Map(sets.map((s) => [s.id, s]));
  const cards = new Map<string, Card>(); const bySet = new Map<string, Card[]>(); const pools = new Map<string, Partial<Record<Tier, Card[]>>>();
  for (const s of sets) {
    const rows = raw.cardsBySet[s.id] || []; const list: Card[] = []; const pool: Partial<Record<Tier, Card[]>> = {};
    for (const r of rows) {
      const id = `${s.id}-${r.c}`;
      const small = r.im || `${imgBase}/${s.id}/${r.c}.png`;
      const card: Card = { id, setId: s.id, name: r.n, number: r.c, rarity: r.r, tier: r.t, supertype: r.s, price: r.p ?? null, variant: r.v ?? null,
        priceUpdated: r.u ?? null, revPrice: r.pr ?? null, types: r.ty ?? null, imgUrl: small, imgLarge: small.replace(/\.png$/, "_hires.png") };
      cards.set(id, card); list.push(card);
      (pool[r.t] ||= []).push(card);
    }
    bySet.set(s.id, list); pools.set(s.id, pool);
  }
  const products: Product[] = [];
  for (const p of raw.sealed) {
    products.push({ id: "p" + p.id, name: p.n, setId: p.set && setById.has(p.set) ? p.set : null, group: p.grp, pub: p.pub, type: p.t as SealedType,
      packs: p.packs, market: p.m, low: p.lo, exclusive: p.exc, img: `img/sealed/${p.id}.jpg`, imgRemote: `https://tcgplayer-cdn.tcgplayer.com/product/${p.id}_in_400x400.jpg`, derived: false });
  }
  const packProductBySet = new Map<string, Product>();
  for (const p of products) if (p.type === "pack" && p.setId && !/code card/i.test(p.name)) {
    const cur = packProductBySet.get(p.setId);
    if (!cur || (/sleeved/i.test(cur.name) && !/sleeved/i.test(p.name))) packProductBySet.set(p.setId, p);
  }
  // Derive a loose-pack product for every openable set that has none, from sealed multi-pack market prices.
  for (const s of sets) {
    if (!s.open || packProductBySet.has(s.id)) continue;
    const mine = products.filter((p) => p.setId === s.id && !p.exclusive);
    const per = (t: string, n: number) => { const x = mine.find((p) => p.type === t && p.packs === n); return x ? x.market / n : null; };
    const est = per("box", 36) ?? per("bundle", 6) ?? per("etb", 9);
    if (est == null) continue;
    const prod: Product = { id: "pk-" + s.id, name: `${s.name} Booster Pack`, setId: s.id, group: s.name, pub: s.rel, type: "pack", packs: 1,
      market: Math.round(est * 100) / 100, low: null, exclusive: false, img: null, imgRemote: null, derived: true };
    products.push(prod); packProductBySet.set(s.id, prod);
  }
  const productById = new Map(products.map((p) => [p.id, p]));
  return { sets, setById, cards, bySet, pools, products, productById, odds: raw.odds, packProductBySet };
}

export async function loadCatalog(base = "data", onProgress?: (n: number, t: number) => void): Promise<Catalog> {
  const j = async (u: string) => { const r = await fetch(`${base}/${u}`); if (!r.ok) throw new Error("data load failed: " + u); return r.json(); };
  const [sets, sealed, odds] = await Promise.all([j("sets.json"), j("sealed.json"), j("odds.json")]);
  const cardsBySet: Record<string, any> = {}; let done = 0;
  await Promise.all((sets as SetInfo[]).map(async (s) => { cardsBySet[s.id] = await j(`cards/${s.id}.json`); onProgress?.(++done, sets.length); }));
  return buildCatalog({ sets, sealed, odds, cardsBySet });
}
