import { GameState, PriceOverride } from "./types";
import { Catalog } from "./game/catalog";
import { api } from "./api";

export interface RefreshResult { cards: Record<string, PriceOverride>; products: Record<string, PriceOverride>; graded: Record<string, number>; note: string }
export interface DataSource {
  id: string; name: string; url: string; kind: "api" | "csv" | "manual"; blurb: string;
  refresh?: (s: GameState, cat: Catalog, scope: "recent" | "all", progress: (m: string) => void) => Promise<RefreshResult>;
}
const PREF = ["normal", "holofoil", "1stEditionHolofoil", "1stEditionNormal", "unlimitedHolofoil", "unlimitedNormal", "reverseHolofoil", "1stEdition"];
export const pickPrice = (prices: Record<string, { market?: number }> | undefined): number | null => {
  if (!prices) return null;
  for (const k of [...PREF, ...Object.keys(prices)]) if (prices[k]?.market) return prices[k].market!;
  return null;
};
function recentSets(s: GameState, cat: Catalog, scope: "recent" | "all") {
  if (scope === "all") return cat.sets;
  const owned = new Set(s.inv.map((i) => (i.kind === "card" ? i.ref.split("-")[0] : "")));
  const cutoff = new Date(Date.now() - 540 * 86400000).toISOString().slice(0, 10);
  return cat.sets.filter((x) => x.rel >= cutoff || owned.has(x.id));
}
export const SOURCES: DataSource[] = [
  {
    id: "pokemontcgio", name: "Pokémon TCG API (TCGplayer prices)", url: "https://pokemontcg.io", kind: "api",
    blurb: "Free API with card data, images and TCGplayer market prices (no key needed, rate limited). Bundled snapshot ships with the app; this refreshes it.",
    async refresh(s, cat, scope, progress) {
      const out: Record<string, PriceOverride> = {}; const sets = recentSets(s, cat, scope); let n = 0;
      for (const set of sets) {
        progress(`Prices: ${set.name} (${++n}/${sets.length})`);
        try {
          for (let page = 1; page < 6; page++) {
            const txt = await api.httpGet(`https://api.pokemontcg.io/v2/cards?q=set.id:${set.id}&pageSize=250&page=${page}&select=id,tcgplayer`);
            const j = JSON.parse(txt);
            for (const c of j.data as any[]) { const p = pickPrice(c.tcgplayer?.prices); if (p) out[c.id] = { p, upd: c.tcgplayer.updatedAt, src: "TCGplayer via pokemontcg.io (live)", anchor: s.day }; }
            if (j.page * j.pageSize >= j.totalCount) break;
          }
        } catch (e) { progress(`Skipped ${set.name}: ${e}`); }
      }
      return { cards: out, products: {}, graded: {}, note: `${Object.keys(out).length} card prices updated` };
    },
  },
  {
    id: "tcgcsv", name: "TCGCSV (TCGplayer sealed product prices)", url: "https://tcgcsv.com", kind: "api",
    blurb: "Free daily mirror of TCGplayer catalogue and prices. Used for sealed product market values.",
    async refresh(s, cat, scope, progress) {
      const out: Record<string, PriceOverride> = {};
      progress("Fetching TCGplayer product groups");
      const groups = JSON.parse(await api.httpGet("https://tcgcsv.com/tcgplayer/3/groups")).results as { groupId: number; name: string; publishedOn: string }[];
      const byName = new Map(groups.map((g) => [g.name, g]));
      const wanted = new Set<string>(); const sets = new Set(recentSets(s, cat, scope).map((x) => x.id));
      for (const p of cat.products) if (!p.derived && (scope === "all" || (p.setId && sets.has(p.setId)))) wanted.add(p.group);
      let n = 0;
      for (const gn of wanted) {
        const g = byName.get(gn); if (!g) continue; progress(`Sealed: ${gn} (${++n}/${wanted.size})`);
        try {
          const j = JSON.parse(await api.httpGet(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`)).results as { productId: number; marketPrice: number | null }[];
          for (const r of j) if (r.marketPrice != null) { const id = "p" + r.productId; if (cat.productById.has(id) && !out[id]) out[id] = { p: r.marketPrice, upd: new Date().toISOString().slice(0, 10), src: "TCGplayer via tcgcsv.com (live)", anchor: s.day }; }
        } catch (e) { progress(`Skipped ${gn}: ${e}`); }
      }
      return { cards: {}, products: out, graded: {}, note: `${Object.keys(out).length} sealed prices updated` };
    },
  },
  { id: "csv", name: "CSV import (manual backup source)", url: "", kind: "csv", blurb: "Import prices from any spreadsheet or price site export. Supports raw card prices and real graded prices (PSA/BGS/CGC)." },
  { id: "manual", name: "Manual price edits", url: "", kind: "manual", blurb: "Set the market price of any single card yourself in Settings." },
];
/** CSV format: header optional. Columns: card_id, price_usd[, company, grade]. Example: base1-4,950.00  or  base1-4,52000,PSA,10 */
export function parseCsv(text: string, cat: Catalog, day: number): { cards: Record<string, PriceOverride>; graded: Record<string, number>; errors: string[]; ok: number } {
  const cards: Record<string, PriceOverride> = {}; const graded: Record<string, number> = {}; const errors: string[] = []; let ok = 0;
  const today = new Date().toISOString().slice(0, 10);
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim(); if (!t || t.startsWith("#")) return;
    const cols = t.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /card|id|price/i.test(cols[0]) && isNaN(Number(cols[1]))) return;
    const [id, price, co, g] = cols; const p = Number(price.replace(/[$,]/g, ""));
    if (!cat.cards.has(id)) { errors.push(`Line ${i + 1}: unknown card id "${id}"`); return; }
    if (!(p > 0)) { errors.push(`Line ${i + 1}: bad price "${price}"`); return; }
    if (co && g) { const C = co.toUpperCase(); if (!["PSA", "BGS", "CGC"].includes(C)) { errors.push(`Line ${i + 1}: unknown grader "${co}"`); return; } graded[`${id}:${C}:${Number(g)}`] = Math.round(p * 100); ok++; }
    else { cards[id] = { p, upd: today, src: "CSV import", anchor: day }; ok++; }
  });
  return { cards, graded, errors, ok };
}
