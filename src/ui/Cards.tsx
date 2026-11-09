import React, { useContext, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useGame, getCat, run } from "../store";
import { Card, COND_NAME, COND_ORDER, Condition, Tier, TIER_NAME, TIER_RANK } from "../types";
import { Badge, Btn, CardImg, Tabs } from "./common";
import { buyDeal, dealsFor } from "../game/actions";
import { rawValue, nmCents } from "../game/economy";
import { usd } from "../util";
import { NavContext } from "../App";
import { CardDetail } from "./Inventory";
import { sfx } from "../audio";

export function Cards() {
  const s = useGame(); const cat = getCat(); const { arg } = useContext(NavContext);
  const [q, setQ] = useState(""); const [setId, setSetId] = useState<string>(arg?.setId || ""); const [tier, setTier] = useState(""); const [cond, setCond] = useState<Condition>("NM");
  const [sort, setSort] = useState("price-desc"); const [min, setMin] = useState(""); const [max, setMax] = useState(""); const [page, setPage] = useState(0); const [detail, setDetail] = useState<Card | null>(null);
  const [tab, setTab] = useState<"browse" | "deals">("deals");
  const dq = useDeferredValue(q);
  const all = useMemo(() => [...cat.cards.values()], [cat]);
  const list = useMemo(() => {
    let r = all; const l = dq.trim().toLowerCase();
    if (setId) r = r.filter((c) => c.setId === setId);
    if (tier) r = r.filter((c) => c.tier === tier);
    if (l) r = r.filter((c) => c.name.toLowerCase().includes(l) || (c.setId + "-" + c.number).toLowerCase() === l);
    const lo = min ? +min : 0, hi = max ? +max : Infinity;
    if (min || max) r = r.filter((c) => (c.price ?? 0) >= lo && (c.price ?? 0) <= hi);
    const rel = (c: Card) => cat.setById.get(c.setId)!.rel;
    return [...r].sort((a, b) => sort === "price-asc" ? (a.price ?? 0) - (b.price ?? 0) : sort === "price-desc" ? (b.price ?? 0) - (a.price ?? 0) : sort === "name" ? a.name.localeCompare(b.name) : sort === "rarity" ? TIER_RANK[b.tier] - TIER_RANK[a.tier] || (b.price ?? 0) - (a.price ?? 0) : rel(b).localeCompare(rel(a)) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [all, dq, setId, tier, min, max, sort]);
  const per = 30; const pages = Math.max(1, Math.ceil(list.length / per)); const pg = Math.min(page, pages - 1); const shown = list.slice(pg * per, pg * per + per);
  const deals = useMemo(() => dealsFor(cat, s), [s.day, s.overrides, s.market]);
  const reset = () => setPage(0);
  return (
    <div className="page">
      <h1>Card Marketplace</h1>
      <Tabs tabs={[{ id: "deals", label: "Today's listings" }, { id: "browse", label: `Browse all cards (${all.length.toLocaleString()})` }]} value={tab} onChange={setTab} />
      {tab === "deals" ? <>
        <p className="muted">Fresh seller listings every day. Most are near market value; occasionally someone underprices a card. Prices include a {"$1.31"} shipping charge at checkout. Compare against the market value shown.</p>
        <div className="cardgrid">{deals.map((d) => { const gone = !!s.dealsBought[d.id]; const disc = 1 - d.price / d.market; return (
          <div key={d.id} className={"cardtile deal" + (gone ? " gone" : "")}>
            <CardImg card={d.card} onClick={() => setDetail(d.card)} />
            <div className="ct1">{d.card.name}</div><div className="ct2"><span className="cond">{d.cond}</span><Badge tier={d.card.tier} /></div>
            <div className="ct2"><b>{usd(d.price)}</b><small>Mkt {usd(d.market)}</small></div>
            {disc >= 0.08 ? <span className={"dealtag " + d.tag}>{Math.round(disc * 100)}% below market</span> : disc < -0.04 ? <span className="dealtag over">{Math.round(-disc * 100)}% above</span> : <span className="dealtag fair">Fair price</span>}
            <div className="muted small">{cat.setById.get(d.card.setId)?.name} · {d.seller}</div>
            <Btn small disabled={gone} onClick={() => { if (run((x) => buyDeal(x, cat, d.id)) !== undefined) sfx("buy"); }}>{gone ? "Sold" : "Buy"}</Btn></div>); })}</div>
      </> : <>
        <div className="filters">
          <input placeholder="Search card name or id (e.g. base1-4)…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
          <select value={setId} onChange={(e) => { setSetId(e.target.value); reset(); }}><option value="">All sets ({cat.sets.length})</option>{[...cat.sets].reverse().map((x) => <option key={x.id} value={x.id}>{x.name} ({x.rel.slice(0, 4)})</option>)}</select>
          <select value={tier} onChange={(e) => { setTier(e.target.value); reset(); }}><option value="">All rarities</option>{(Object.keys(TIER_NAME) as Tier[]).filter((t) => t !== "promo").map((t) => <option key={t} value={t}>{TIER_NAME[t]}</option>)}</select>
          <select value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{COND_ORDER.map((c) => <option key={c} value={c}>{COND_NAME[c]}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="price-desc">Price ↓</option><option value="price-asc">Price ↑</option><option value="rarity">Rarity</option><option value="name">Name</option><option value="new">Newest set</option></select>
          <input placeholder="Min $" style={{ width: 70 }} value={min} onChange={(e) => { setMin(e.target.value); reset(); }} /><input placeholder="Max $" style={{ width: 70 }} value={max} onChange={(e) => { setMax(e.target.value); reset(); }} />
        </div>
        <div className="cardgrid">{shown.map((c) => (
          <div key={c.id} className="cardtile" onClick={() => setDetail(c)}><CardImg card={c} /><div className="ct1">{c.name}</div><div className="ct2"><Badge tier={c.tier} /><b>{usd(rawValue(cat, s, c, cond))}</b></div><div className="muted small">{cat.setById.get(c.setId)?.name} #{c.number}</div></div>))}</div>
        <div className="pager"><Btn small kind="ghost" disabled={pg === 0} onClick={() => setPage(pg - 1)}>← Prev</Btn><span>Page {pg + 1} / {pages} · {list.length.toLocaleString()} cards</span><Btn small kind="ghost" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next →</Btn></div>
      </>}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
