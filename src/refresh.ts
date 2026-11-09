import { Catalog } from "./game/catalog";
import { getState, run } from "./store";
import { SOURCES } from "./sources";
import { toast } from "./game/state";

export async function refreshMarketData(cat: Catalog, scope: "recent" | "all", progress: (m: string) => void): Promise<string> {
  const s = getState(); const notes: string[] = [];
  if (s.settings.offline) throw new Error("Offline mode is on. Turn it off in Settings to update prices.");
  for (const src of SOURCES) {
    if (!src.refresh || !s.settings.sources[src.id]) continue;
    try {
      const r = await src.refresh(getState(), cat, scope, progress);
      run((d) => {
        Object.assign(d.overrides, r.cards); Object.assign(d.productOverrides, r.products); Object.assign(d.gradedOverrides, r.graded);
        d.sourceUpdated[src.id] = new Date().toISOString();
      }, { quiet: true });
      notes.push(`${src.name}: ${r.note}`);
    } catch (e) { notes.push(`${src.name}: failed (${e})`); }
  }
  return notes.join("\n");
}
export async function runAutoRefresh(cat: Catalog) {
  const s = getState();
  if (s.settings.offline || s.settings.updateFreq === "manual") return;
  const last = s.sourceUpdated["pokemontcgio"] ? new Date(s.sourceUpdated["pokemontcgio"]).getTime() : 0;
  if (s.settings.updateFreq === "daily" && Date.now() - last < 86400000) return;
  try { await refreshMarketData(cat, "recent", () => {}); } catch { /* offline: keep cached prices */ }
}
