import React, { useContext, useMemo, useState } from "react";
import { useGame, getCat, run } from "../store";
import { Company } from "../types";
import { SERVICES, SHIPPING_FEE, gradeOdds, submitGrading } from "../game/grading";
import { currentRank } from "../game/actions";
import { Badge, Btn, CardImg, Empty, Tabs, plClass } from "./common";
import { GRADE_MODEL_NOTE, gradedValue, itemUnitValue, rawValue } from "../game/economy";
import { usd, fmtDate, addDays } from "../util";
import { NavContext } from "../App";
import { sfx } from "../audio";
import { COND_NAME } from "../types";

export function Grading() {
  const s = useGame(); const cat = getCat(); const { arg } = useContext(NavContext);
  const [co, setCo] = useState<Company>("PSA"); const [tierId, setTierId] = useState("regular"); const [sel, setSel] = useState<Record<string, number>>(arg?.invId ? { [arg.invId]: 1 } : {});
  const [tab, setTab] = useState<"submit" | "active" | "graded">("submit");
  const rank = currentRank(cat, s);
  const tiers = SERVICES[co]; const tier = tiers.find((t) => t.id === tierId) || tiers[0];
  const raws = s.inv.filter((i) => i.kind === "card" && !i.grade).sort((a, b) => itemUnitValue(cat, s, b) - itemUnitValue(cat, s, a));
  const picks = Object.entries(sel).filter(([, q]) => q > 0).map(([invId, qty]) => ({ invId, qty }));
  const n = picks.reduce((a, p) => a + p.qty, 0); const fee = n ? tier.price * n + SHIPPING_FEE : 0;
  const graded = s.inv.filter((i) => i.grade);
  const active = s.grading.filter((g) => !g.done);
  const done = s.grading.filter((g) => g.done);
  return (
    <div className="page">
      <h1>Grading Center</h1>
      <Tabs tabs={[{ id: "submit", label: "Submit cards" }, { id: "active", label: "At the graders", badge: active.length }, { id: "graded", label: "Graded collection", badge: graded.length }]} value={tab} onChange={setTab} />
      {tab === "submit" && <>
        <div className="grid2">
          <section className="panel"><h3>1. Choose a grading company</h3>
            <div className="seg big">{(["PSA", "BGS", "CGC"] as Company[]).map((c) => <button key={c} className={co === c ? "on" : ""} onClick={() => { setCo(c); setTierId(SERVICES[c][1].id); }}>{c}</button>)}</div>
            <table className="tbl"><thead><tr><th></th><th>Service</th><th>Per card</th><th>Turnaround</th><th>Max value</th></tr></thead><tbody>{tiers.map((t) => (
              <tr key={t.id} className={tierId === t.id ? "sel" : ""} onClick={() => { if (t.rank <= rank) setTierId(t.id); }}><td><input type="radio" checked={tierId === t.id} readOnly disabled={t.rank > rank} /></td><td>{t.name}{t.rank > rank && <span className="warn"> (unlocks at Collector rank)</span>}</td><td>{usd(t.price)}</td><td>{t.days} days</td><td>{t.maxValue === Infinity ? "No limit" : usd(t.maxValue)}</td></tr>))}</tbody></table>
            <div className="muted small">Plus {usd(SHIPPING_FEE)} shipping and insurance per submission. {co === "PSA" ? "PSA grades 1 to 10." : co === "BGS" ? "BGS uses half grades; 9.5 is Gem Mint and a rare 10 is Pristine (Black Label)." : "CGC uses half grades; 10 Pristine is rare."}</div>
          </section>
          <section className="panel"><h3>Grade odds by condition</h3><OddsTable /><div className="muted small">Outcomes depend on the card's condition but include randomness. Even Near Mint cards often come back 9 or lower.</div></section>
        </div>
        <section className="panel"><h3>2. Pick cards ({n} selected)</h3>
          {raws.length === 0 ? <Empty icon="🏅" title="No raw cards to grade">Open packs or buy singles first.</Empty> : <div className="cardgrid small">{raws.slice(0, 120).map((it) => { const c = cat.cards.get(it.ref)!; const q = sel[it.id] || 0; const v = rawValue(cat, s, c, it.cond, it.variant);
            return (<div key={it.id} className={"cardtile" + (q ? " sel" : "")} onClick={() => setSel({ ...sel, [it.id]: q ? 0 : 1 })}><CardImg card={c} />{it.qty > 1 && <span className="qty">×{it.qty}</span>}<div className="ct1">{c.name}</div><div className="ct2"><span className="cond">{it.cond}</span><b>{usd(v)}</b></div>
              <div className="muted small">PSA 10 est. {usd(gradedValue(cat, s, c, "PSA", 10, it.variant).cents)}</div>
              {q > 0 && it.qty > 1 && <div className="row" onClick={(e) => e.stopPropagation()}><input type="number" min={1} max={it.qty} value={q} onChange={(e) => setSel({ ...sel, [it.id]: Math.max(1, Math.min(it.qty, +e.target.value || 1)) })} style={{ width: 54 }} /></div>}</div>); })}</div>}
          <div className="selbar">Total fee <b>{usd(fee)}</b> ({n} × {usd(tier.price)} + {usd(SHIPPING_FEE)}) · returns in {tier.days} days <Btn disabled={!n} onClick={() => { if (run((d) => submitGrading(d, cat, co, tier.id, picks, rank)) !== undefined) { sfx("buy"); setSel({}); setTab("active"); } }}>Submit to {co} {tier.name}</Btn></div>
          <div className="muted small">{GRADE_MODEL_NOTE}</div>
        </section></>}
      {tab === "active" && (active.length === 0 && done.length === 0 ? <Empty icon="📦" title="Nothing submitted yet">Send your best cards to PSA, BGS or CGC from the Submit tab.</Empty> : <>
        {active.map((g) => <section className="panel" key={g.id}><h3>{g.co} · {g.tier} · {g.cards.length} card(s)</h3><div className="row"><div className="bar" style={{ flex: 1 }}><div style={{ width: Math.min(100, ((s.day - g.sub) / (g.ret - g.sub)) * 100) + "%" }} /></div><b>{Math.max(0, g.ret - s.day)} days left</b></div><div className="thumbs">{g.cards.slice(0, 12).map((c, i) => <CardImg key={i} card={cat.cards.get(c.ref)!} className="t" />)}</div><div className="muted">Submitted {fmtDate(addDays(s.startDate, g.sub))} · fee {usd(g.fee)}. Advance time to receive them.</div></section>)}
        {done.length > 0 && <><h3>Returned submissions</h3>{done.slice(0, 10).map((g) => <section className="panel" key={g.id}><h4>{g.co} {g.tier} · {fmtDate(addDays(s.startDate, g.ret))}</h4><div className="cardgrid small">{g.results!.map((r, i) => { const c = cat.cards.get(r.ref)!; const v = gradedValue(cat, s, c, g.co, r.g, r.variant).cents; return <div key={i} className="cardtile"><CardImg card={c} /><span className="slab">{g.co} {r.g}</span><div className="ct1">{c.name}</div><div className="ct2"><small>was {r.cond}</small><b>{usd(v)}</b></div></div>; })}</div></section>)}</>}
      </>)}
      {tab === "graded" && (graded.length === 0 ? <Empty icon="🏅" title="No graded cards yet">Submitted cards return here as slabs.</Empty> :
        <table className="tbl"><thead><tr><th></th><th>Card</th><th>Grader · grade</th><th>Submitted</th><th>Est. value</th><th>Value basis</th><th>Paid (incl. grading)</th><th>P/L</th></tr></thead><tbody>{graded.map((it) => { const c = cat.cards.get(it.ref)!; const gv = gradedValue(cat, s, c, it.grade!.co, it.grade!.g, it.variant); return (
          <tr key={it.id}><td><CardImg card={c} className="mini" /></td><td><b>{c.name}</b><div className="muted small">{cat.setById.get(c.setId)?.name} #{c.number}</div></td><td>{it.grade!.co} {it.grade!.g}</td><td>{fmtDate(addDays(s.startDate, it.grade!.sub))}</td><td>{usd(gv.cents)}</td><td>{gv.sourced ? "Sourced (CSV)" : "Estimated model"}</td><td>{usd(it.cost)}</td><td className={plClass(gv.cents - it.cost)}>{usd(gv.cents - it.cost)}</td></tr>); })}</tbody></table>)}
    </div>
  );
}
function OddsTable() {
  const conds = ["NM", "LP", "MP", "HP", "DMG"] as const;
  return <table className="tbl odds"><thead><tr><th>PSA grade</th>{conds.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => <tr key={g}><td>{g}</td>{conds.map((c) => <td key={c}>{(gradeOdds(c).find((x) => x.grade === g)!.p * 100).toFixed(1)}%</td>)}</tr>)}</tbody></table>;
}
