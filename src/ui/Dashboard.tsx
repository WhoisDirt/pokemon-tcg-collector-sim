import React, { useContext, useMemo } from "react";
import { useGame, getCat } from "../store";
import { totals, nmCents, rawValue, itemName, productMarket } from "../game/economy";
import { usd, usd0, fmtDate, addDays } from "../util";
import { CardImg, Chart, SetLogo, Stat, plClass, ProductImg, Badge } from "./common";
import { NavContext } from "../App";
import { ACHIEVEMENTS, RANKS, rankOf } from "../game/progress";
import { risersAndFallers } from "./trendsData";

export function Dashboard() {
  const s = useGame(); const cat = getCat(); const { go } = useContext(NavContext);
  const t = totals(cat, s);
  const pl = s.stats.realizedProfit + t.unrealized;
  const series = useMemo(() => { const pts = s.nw.map((n) => ({ x: n.day, y: n.cash + n.inv })); pts.push({ x: s.day, y: t.netWorth }); return pts; }, [s.nw, s.day, t.netWorth]);
  const newSets = [...cat.sets].reverse().filter((x) => x.open).slice(0, 6);
  const rf = useMemo(() => risersAndFallers(cat, s, 7, 5), [s.day]);
  const achDone = ACHIEVEMENTS.filter((a) => s.achievements[a.id] != null).length;
  return (
    <div className="page">
      <h1>Trainer HQ</h1>
      <div className="stats">
        <Stat label="Cash" value={usd(s.cash)} />
        <Stat label="Inventory value" value={usd(t.cards + t.sealed)} sub={`${t.count} items`} />
        <Stat label="Collection value (incl. graded)" value={usd(t.inv)} sub={`Graded ${usd(t.graded)} · At grader ${usd(t.inGrading)}`} />
        <Stat label="Net worth" value={usd(t.netWorth)} sub={RANKS[rankOf(t.netWorth)].name} />
        <Stat label="Total profit / loss" value={(pl >= 0 ? "+" : "") + usd(pl)} tone={pl > 0 ? "good" : pl < 0 ? "bad" : undefined} sub={`Realized ${usd(s.stats.realizedProfit)} · Unrealized ${usd(t.unrealized)}`} />
      </div>
      <div className="grid2">
        <section className="panel"><h3>Net worth over time</h3><Chart points={series} h={150} color="#ee1c25" fmt={(v) => usd0(v)} />
          <div className="muted">Cash + collection value at each day's close (simulated prices anchored to sourced values).</div></section>
        <section className="panel"><h3>Business stats</h3>
          <div className="kv"><span>Packs opened</span><b>{s.stats.packsOpened}</b><span>Cards collected</span><b>{s.stats.cardsCollected}</b><span>Cards sold</span><b>{s.stats.cardsSold}</b>
            <span>Highest-value pull</span><b>{s.stats.highestPull ? `${cat.cards.get(s.stats.highestPull.ref)?.name} (${usd(s.stats.highestPull.value)})` : "-"}</b>
            <span>Earned from work</span><b>{usd(s.stats.earnedWork)}</b><span>Earned from sales</span><b>{usd(s.stats.earnedSales)}</b><span>Total spent</span><b>{usd(s.stats.spent)}</b>
            <span>Achievements</span><b>{achDone}/{ACHIEVEMENTS.length}</b></div></section>
      </div>
      <div className="grid3">
        <section className="panel"><h3>Recent pulls</h3>{s.pulls.length === 0 ? <p className="muted">No packs opened yet. Visit the Pack Shop!</p> : s.pulls.slice(0, 3).map((p, i) => (
          <div key={i} className="pullrow"><div className="thumbs">{[...p.cards].sort((a, b) => b.val - a.val).slice(0, 3).map((c, j) => <CardImg key={j} card={cat.cards.get(c.ref)!} className="t" />)}</div>
            <div><b>{p.productName}</b><div className="muted">{fmtDate(addDays(s.startDate, p.day))}</div><div className={plClass(p.value - p.cost)}>{usd(p.value)} value · {p.value - p.cost >= 0 ? "+" : ""}{usd(p.value - p.cost)}</div></div></div>))}</section>
        <section className="panel"><h3>Recent purchases</h3>{s.buys.length === 0 ? <p className="muted">Nothing bought yet.</p> : s.buys.slice(0, 6).map((b, i) => <div key={i} className="line"><span>{b.name.slice(0, 34)}{b.qty > 1 ? ` ×${b.qty}` : ""}</span><b>{usd(b.cents)}</b></div>)}</section>
        <section className="panel"><h3>Recent sales</h3>{s.sells.length === 0 ? <p className="muted">Nothing sold yet.</p> : s.sells.slice(0, 6).map((b, i) => <div key={i} className="line"><span>{b.name.slice(0, 30)}{b.qty > 1 ? ` ×${b.qty}` : ""}</span><b className={plClass(b.net - b.cost)}>{usd(b.net)}</b></div>)}</section>
      </div>
      <div className="grid3">
        <section className="panel"><h3>Active grading</h3>{s.grading.filter((g) => !g.done).length === 0 ? <p className="muted">No submissions at the grading companies.</p> : s.grading.filter((g) => !g.done).map((g) => <div key={g.id} className="line"><span>{g.co} · {g.cards.length} card(s)</span><b>{Math.max(0, g.ret - s.day)} days</b></div>)}
          <button className="link" onClick={() => go("grade")}>Open Grading Center →</button></section>
        <section className="panel"><h3>Market highlights</h3>
          {rf.up.slice(0, 3).map((r) => <div key={r.card.id} className="line"><span>▲ {r.card.name}</span><b className="good">+{(r.pct * 100).toFixed(1)}%</b></div>)}
          {rf.down.slice(0, 3).map((r) => <div key={r.card.id} className="line"><span>▼ {r.card.name}</span><b className="bad">{(r.pct * 100).toFixed(1)}%</b></div>)}
          {s.news[0] && <p className="news">📰 {s.news[0].text}</p>}<button className="link" onClick={() => go("trends")}>Market Trends →</button></section>
        <section className="panel"><h3>Newly released sets</h3><div className="setchips">{newSets.map((x) => <div key={x.id} className="setchip" onClick={() => go("cards", { setId: x.id })}><SetLogo id={x.id} url={x.logoUrl} /><small>{fmtDate(x.rel)}</small></div>)}</div></section>
      </div>
    </div>
  );
}
