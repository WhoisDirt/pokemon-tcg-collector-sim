import React, { useMemo, useState } from "react";
import { useGame, getCat } from "../store";
import { risersAndFallers, sealedMovers, highDemand } from "./trendsData";
import { Chart, CardImg, ProductImg, SetLogo, Badge, Tabs } from "./common";
import { usd, fmtDate, addDays } from "../util";
import { CardDetail } from "./Inventory";
import { Card } from "../types";

export function Trends() {
  const s = useGame(); const cat = getCat(); const [range, setRange] = useState<"7" | "30">("7"); const [detail, setDetail] = useState<Card | null>(null);
  const days = Number(range);
  const rf = useMemo(() => risersAndFallers(cat, s, days, 8), [s.day, range, s.overrides]);
  const sm = useMemo(() => sealedMovers(cat, s, days, 6), [s.day, range, s.productOverrides]);
  const hd = useMemo(() => highDemand(cat, s, 8), [s.day]);
  const g = s.market.g.map((v, i) => ({ x: i, y: v * 100 }));
  const newSets = [...cat.sets].filter((x) => x.open).slice(-8).reverse();
  const Row = ({ r }: { r: { card: Card; now: number; pct: number } }) => <div className="trow" onClick={() => setDetail(r.card)}><CardImg card={r.card} className="mini" /><div><b>{r.card.name}</b><div className="muted small">{cat.setById.get(r.card.setId)?.name}</div></div><div className="tr"><b>{usd(r.now)}</b><span className={r.pct >= 0 ? "good" : "bad"}>{r.pct >= 0 ? "+" : ""}{(r.pct * 100).toFixed(1)}%</span></div></div>;
  return (
    <div className="page">
      <h1>Market Trends</h1>
      <div className="notice">Honesty note: every card and sealed price starts at its <b>sourced</b> market value (TCGplayer data via pokemontcg.io / tcgcsv.com). Movements after that are <b>simulated</b> from events like reprints, hype, tournaments and shortages, plus a market-wide index. Refresh sourced prices any time in Settings.</div>
      <div className="grid2">
        <section className="panel"><h3>Market index (simulated, start = 100)</h3><Chart points={g} h={140} fmt={(v) => v.toFixed(1)} color="#3b8bf5" /></section>
        <section className="panel"><h3>News &amp; events</h3>{s.news.length === 0 ? <p className="muted">No market events yet. Time passes, news happens.</p> : s.news.slice(0, 7).map((n, i) => <p key={i} className="news">📰 <small>{fmtDate(addDays(s.startDate, n.day))}</small> {n.text}</p>)}</section>
      </div>
      <Tabs tabs={[{ id: "7", label: "7-day moves" }, { id: "30", label: "30-day moves" }]} value={range} onChange={setRange} />
      <div className="grid2">
        <section className="panel"><h3>🔥 Rising cards</h3>{rf.up.map((r) => <Row key={r.card.id} r={r} />)}</section>
        <section className="panel"><h3>🧊 Falling cards</h3>{rf.down.map((r) => <Row key={r.card.id} r={r} />)}</section>
      </div>
      <div className="grid2">
        <section className="panel"><h3>⭐ High-demand cards (popular Pokémon)</h3>{hd.map((r) => <Row key={r.card.id} r={{ ...r, pct: 0 }} />)}</section>
        <section className="panel"><h3>📦 Sealed product trends</h3>{[...sm.up, ...sm.down].map((r) => <div className="trow" key={r.p.id}><ProductImg prod={r.p} cat={cat} className="mini" /><div><b>{r.p.name.slice(0, 38)}</b></div><div className="tr"><b>{usd(r.now)}</b><span className={r.pct >= 0 ? "good" : "bad"}>{r.pct >= 0 ? "+" : ""}{(r.pct * 100).toFixed(1)}%</span></div></div>)}</section>
      </div>
      <section className="panel"><h3>🆕 Newly released sets</h3><div className="setchips big">{newSets.map((x) => <div key={x.id} className="setchip"><SetLogo id={x.id} url={x.logoUrl} /><small>{x.name}</small><small>{fmtDate(x.rel)}</small></div>)}</div></section>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
