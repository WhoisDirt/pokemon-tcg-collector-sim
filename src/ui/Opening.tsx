import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useGame, getCat, run } from "../store";
import { openSealed, OpenResult, PulledCard } from "../game/packs";
import { Btn, CardImg, Empty, Modal, Pokeball, ProductImg, SetLogo, Badge, TIER_COLOR, plClass } from "./common";
import { usd } from "../util";
import { sfx } from "../audio";
import { Card, InvItem } from "../types";
import { NavContext } from "../App";
import { CardDetail } from "./Inventory";

export function Opening() {
  const s = useGame(); const cat = getCat(); const { go } = useContext(NavContext);
  const [result, setResult] = useState<OpenResult | null>(null);
  const openable = s.inv.filter((i) => { if (i.kind !== "sealed") return false; const p = cat.productById.get(i.ref); return !!p && !!p.setId && p.packs > 0; });
  const sealedOnly = s.inv.filter((i) => i.kind === "sealed" && !openable.includes(i));
  const doOpen = (it: InvItem, qty: number) => { const r = run((d) => openSealed(d, cat, it.id, qty)); if (r) setResult(r); };
  if (result) return <Sequence result={result} onDone={() => setResult(null)} />;
  return (
    <div className="page">
      <h1>Pack Opening</h1>
      <p className="muted">Pick sealed product from your inventory to rip open. Pull rates are set-specific (see below). Boxes and ETBs open every pack inside.</p>
      {openable.length === 0 ? <Empty icon="✨" title="No sealed product to open">Buy packs in the Pack Shop, or find sealed product from private sellers.<br /><br /><Btn onClick={() => go("shop")}>Go to Pack Shop</Btn></Empty> : (
        <div className="shopgrid">{openable.map((it) => { const p = cat.productById.get(it.ref)!; const set = cat.setById.get(p.setId!)!; const odds = cat.odds[set.id];
          return (
            <div className="ptile" key={it.id}>
              <div className="pimg"><ProductImg prod={p} cat={cat} /><span className="tag blue">×{it.qty}</span></div>
              <div className="pname">{p.name}</div>
              <div className="pmeta"><SetLogo id={set.id} url={set.logoUrl} className="mini" /><span>{p.packs} pack{p.packs > 1 ? "s" : ""} each</span></div>
              <div className="muted small">Cost basis {usd(Math.round(it.cost / it.qty))} each</div>
              <div className="row"><Btn small onClick={() => doOpen(it, 1)}>Open 1</Btn>{it.qty > 1 && <Btn small kind="yellow" onClick={() => doOpen(it, it.qty)}>Open all ({it.qty})</Btn>}</div>
              <details className="odds"><summary>Pull rates</summary><OddsView setId={set.id} /></details>
            </div>); })}</div>)}
      {sealedOnly.length > 0 && <><h3 style={{ marginTop: 24 }}>Sealed collectibles (nothing to open)</h3><p className="muted">These hold their market value. Sell them from the Inventory page.</p><div className="shopgrid">{sealedOnly.map((it) => { const p = cat.productById.get(it.ref)!; return <div className="ptile" key={it.id}><div className="pimg"><ProductImg prod={p} cat={cat} /><span className="tag blue">×{it.qty}</span></div><div className="pname">{p.name}</div></div>; })}</div></>}
    </div>
  );
}
export function OddsView({ setId }: { setId: string }) {
  const cat = getCat(); const odds = cat.odds[setId]; const set = cat.setById.get(setId)!;
  if (!odds) return <div className="muted">No odds configured.</div>;
  const rareSlot = odds.slots[0]; const tot = Object.values(rareSlot.t).reduce((a, b) => a + b, 0);
  const TN: Record<string, string> = { r: "Rare", h: "Holo Rare", dr: "Double Rare / ex / V / GX", ur: "Ultra Rare", ir: "Illustration Rare", sir: "Special Illustration Rare", hr: "Hyper / Secret Rare", sh: "Shiny / Radiant", rev: "Reverse holo" };
  const rev = odds.slots.find((x) => x.t.rev);
  const rows: [string, number][] = Object.entries(rareSlot.t).filter(([k, v]) => v > 0 && (k === "rev" || (set.tiers as any)[k])).map(([k, v]) => [k, v / tot]);
  if (rev) for (const [k, v] of Object.entries(rev.t)) if (v > 0 && k !== "rev" && (set.tiers as any)[k]) rows.push([k + "·slot2", v / Object.values(rev.t).reduce((a, b) => a + b, 0)]);
  return (
    <div className="oddsbox"><div className="muted small">{odds.source}</div>
      <table><tbody>{rows.map(([k, p]) => <tr key={k}><td>{TN[k.split("·")[0]] || k}{k.includes("·") ? " (reverse slot)" : ""}</td><td>1 in {(1 / p).toFixed(p > 0.2 ? 1 : 0)} packs</td></tr>)}</tbody></table>
      <div className="muted small">{set.packSize} cards per pack. Cards of a tier are drawn evenly; sets with more cards in a tier make each individual card rarer.</div></div>
  );
}
const THEME_BG: Record<string, string> = { c: "#cfd8e3", u: "#9fe0b8", r: "#9cc7ff", h: "#d2b4ff", dr: "#ffd98a", ur: "#ffb98a", ir: "#ffb3d9", sir: "#ff8fb0", hr: "#fff08a", sh: "#9ff0e8", e: "#cfd8e3", promo: "#ddd" };

function Sequence({ result, onDone }: { result: OpenResult; onDone: () => void }) {
  const cat = getCat(); const set = cat.setById.get(result.setId)!;
  const [packIdx, setPackIdx] = useState(0); const [phase, setPhase] = useState<"pack" | "tear" | "reveal" | "pack-sum" | "summary">("pack");
  const [ci, setCi] = useState(0); const [flipped, setFlipped] = useState(false); const [flash, setFlash] = useState<string | null>(null); const [detail, setDetail] = useState<Card | null>(null);
  const pack = result.packs[packIdx]; const prod = cat.packProductBySet.get(result.setId);
  const total = result.packs.length;
  const tear = () => { sfx("tear"); setPhase("tear"); setTimeout(() => { setPhase("reveal"); setCi(0); setFlipped(false); }, 900 / (1)); };
  const effect = (c: PulledCard) => { const rare = c.value >= 2000 || ["sir", "hr", "ir", "ur"].includes(c.tier); if (c.value >= 10000 || c.tier === "sir" || c.tier === "hr") { sfx("legend"); setFlash("legend"); } else if (rare) { sfx("epic"); setFlash("epic"); } else if (c.value >= 500 || ["dr", "h"].includes(c.tier)) { sfx("rare"); setFlash("rare"); } else sfx("flip"); setTimeout(() => setFlash(null), 1100); };
  const reveal = () => { if (!flipped) { setFlipped(true); effect(pack[ci]); } else if (ci + 1 < pack.length) { setCi(ci + 1); setFlipped(false); } else setPhase(packIdx + 1 < total ? "pack-sum" : "summary"); };
  const nextPack = () => { setPackIdx(packIdx + 1); setPhase("pack"); setCi(0); setFlipped(false); };
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.code === "Space" && phase === "reveal") { e.preventDefault(); reveal(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  const all = result.packs.flat(); const best = [...all].sort((a, b) => b.value - a.value)[0];
  if (phase === "summary") {
    const sorted = [...all].sort((a, b) => b.value - a.value); const pl = result.value - result.cost;
    return (
      <div className="page summary">
        <h1>Pull summary</h1>
        <div className="stats"><div className="stat"><div className="sl">Packs opened</div><div className="sv">{total}</div></div><div className="stat"><div className="sl">Estimated market value</div><div className="sv">{usd(result.value)}</div></div><div className="stat"><div className="sl">Pack cost</div><div className="sv">{usd(result.cost)}</div></div><div className="stat"><div className="sl">Profit / loss</div><div className={"sv " + plClass(pl)}>{pl >= 0 ? "+" : ""}{usd(pl)}</div></div></div>
        {best && <div className="bestpull"><span>Best pull</span><CardImg card={cat.cards.get(best.ref)!} onClick={() => setDetail(cat.cards.get(best.ref)!)} /><b>{cat.cards.get(best.ref)!.name} · {usd(best.value)}</b></div>}
        <div className="cardgrid">{sorted.map((c, i) => { const card = cat.cards.get(c.ref)!; return (
          <div key={i} className="cardtile" onClick={() => setDetail(card)} style={{ boxShadow: `0 0 0 3px ${TIER_COLOR[c.tier]}55` }}>
            <CardImg card={card} /><div className="ct1">{card.name}{c.v === "rev" ? " (Reverse)" : ""}</div><div className="ct2"><Badge tier={c.tier} /><b>{usd(c.value)}</b></div></div>); })}</div>
        <div className="row" style={{ justifyContent: "center", margin: 20 }}><Btn onClick={onDone}>Done</Btn></div>
        {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      </div>
    );
  }
  if (phase === "pack-sum") {
    const pv = pack.reduce((a, b) => a + b.value, 0);
    return (<div className="page"><h2>Pack {packIdx + 1} of {total} done: {usd(pv)}</h2><div className="cardgrid small">{[...pack].sort((a, b) => b.value - a.value).map((c, i) => <div key={i} className="cardtile"><CardImg card={cat.cards.get(c.ref)!} /><div className="ct2"><b>{usd(c.value)}</b></div></div>)}</div>
      <div className="row" style={{ justifyContent: "center", margin: 20 }}><Btn onClick={nextPack}>Open next pack</Btn><Btn kind="yellow" onClick={() => setPhase("summary")}>Skip to summary</Btn></div></div>);
  }
  const cur = pack[ci];
  return (
    <div className={"stage" + (flash ? " flash-" + flash : "")}>
      <div className="stage-top"><SetLogo id={set.id} url={set.logoUrl} className="stagelogo" /><span>Pack {packIdx + 1} / {total}</span><Btn small kind="ghost" onClick={() => setPhase("summary")}>Skip to summary</Btn></div>
      {(phase === "pack" || phase === "tear") && (
        <div className="packwrap" onClick={() => phase === "pack" && tear()}>
          <div className={"pack3d" + (phase === "tear" ? " tearing" : " wiggle")}>
            <div className="pack-half bottom">{prod ? <ProductImg prod={prod} cat={cat} big /> : <ProductImg prod={{ id: "x", name: "", setId: set.id, group: "", pub: "", type: "pack", packs: 1, market: 0, low: null, exclusive: false, img: null, imgRemote: null, derived: true }} cat={cat} />}</div>
            <div className="pack-half top">{prod ? <ProductImg prod={prod} cat={cat} big /> : null}</div>
          </div>
          <div className="hint">{phase === "pack" ? "Click the pack to tear it open!" : "…"}</div>
        </div>)}
      {phase === "reveal" && cur && (
        <div className="revealarea">
          <div className="deck">{pack.slice(0, pack.length).map((c, i) => <div key={i} className={"deckcard" + (i < ci ? " gone" : "")} style={{ transform: `translate(${(i - ci) * 3}px, ${(i - ci) * -2}px) rotate(${(i - ci) * 0.6}deg)`, zIndex: 20 - i }} />)}</div>
          <div className={"flipper" + (flipped ? " on" : "")} onClick={reveal} style={{ ["--tc" as any]: TIER_COLOR[cur.tier] }}>
            <div className="face back"><Pokeball size={80} /></div>
            <div className={"face front tier-" + cur.tier + (cur.value >= 10000 ? " legend" : cur.value >= 2000 ? " epic" : "")}>
              <CardImg card={cat.cards.get(cur.ref)!} large />{(cur.tier === "sir" || cur.tier === "hr" || cur.tier === "ir" || cur.tier === "ur" || cur.value >= 2000) && <div className="shine" />}
            </div>
          </div>
          {flipped && <div className="reveal-info"><b>{cat.cards.get(cur.ref)!.name}{cur.v === "rev" ? " (Reverse Holo)" : ""}</b><div><Badge tier={cur.tier} /> #{cat.cards.get(cur.ref)!.number}</div><div className="rv">{usd(cur.value)}</div></div>}
          <div className="row"><Btn onClick={reveal}>{!flipped ? "Reveal card" : ci + 1 < pack.length ? "Next card" : "Finish pack"}</Btn><Btn kind="yellow" onClick={() => { pack.forEach((c) => c); setCi(pack.length - 1); setFlipped(true); effect(pack[pack.length - 1]); }}>Reveal rest</Btn></div>
          <div className="trail">{pack.slice(0, ci + (flipped ? 1 : 0)).map((c, i) => <CardImg key={i} card={cat.cards.get(c.ref)!} className="t" />)}</div>
        </div>)}
    </div>
  );
}
