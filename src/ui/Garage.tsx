import React, { useState } from "react";
import { useGame, getCat, run, pushMsg } from "../store";
import { GarageListing } from "../types";
import { browseListings, buyListing, makeOffer, visitListing } from "../game/garage";
import { currentRank } from "../game/actions";
import { Btn, CardImg, Empty, Modal, ProductImg, plClass, Badge } from "./common";
import { rawValue, productMarket } from "../game/economy";
import { usd, fmtDate, addDays } from "../util";
import { sfx } from "../audio";
import { COND_NAME } from "../types";

const TYPE_LABEL: Record<string, string> = { single: "Single card", lot: "Card lot", binder: "Old binder", garage: "Garage sale", sealedlot: "Sealed product" };
export function Garage() {
  const s = useGame(); const cat = getCat(); const [open, setOpen] = useState<string | null>(null);
  const rank = currentRank(cat, s);
  const l = s.garage.find((x) => x.id === open) || null;
  return (
    <div className="page">
      <h1>Private Sellers &amp; Garage Sales</h1>
      <p className="muted">Collectors, parents clearing attics and yard-sale hosts post here. Most listings are fairly priced or a little high. Genuine steals are rare and get snapped up fast, so check often. Browsing for new posts costs 1 hour.</p>
      <div className="row"><Btn kind="blue" onClick={() => { const n = run((d) => browseListings(d, cat, rank)); if (n !== undefined) pushMsg(n ? `${n} new listing${n > 1 ? "s" : ""} found` : "Nothing new right now"); }}>🔄 Browse new listings (1 hr)</Btn></div>
      {s.garage.length === 0 ? <Empty icon="🏷️" title="No listings right now">Check back later or browse again.</Empty> :
        <div className="listings">{s.garage.map((g) => <Listing key={g.id} g={g} onOpen={() => setOpen(g.id)} />)}</div>}
      {l && <ListingModal g={l} onClose={() => setOpen(null)} />}
    </div>
  );
}
function Preview({ g }: { g: GarageListing }) {
  const cat = getCat();
  const shown = g.items.slice(0, Math.min(g.shown, 6));
  return <div className="lthumbs">{shown.map((it, i) => it.kind === "card" ? <CardImg key={i} card={cat.cards.get(it.ref)!} className="t" /> : <ProductImg key={i} prod={cat.productById.get(it.ref)!} cat={cat} className="t" />)}{g.items.length > shown.length && <span className="more">+{g.items.reduce((a, i) => a + i.qty, 0) - shown.length} more</span>}</div>;
}
function Listing({ g, onOpen }: { g: GarageListing; onOpen: () => void }) {
  const s = useGame();
  const left = g.expires - s.day;
  return (
    <div className="listing" onClick={onOpen}>
      <Preview g={g} />
      <div className="lbody"><div className="ltype">{TYPE_LABEL[g.type]}{g.risky && <span className="tag red">Risky</span>}</div><h3>{g.title}</h3><div className="muted small">{g.seller} · posted day {g.posted + 1}</div>
        <div className="lprice"><b>{usd(g.ask)}</b><small>Seller's est. value {usd(g.claimedValue)}</small></div>
        <div className="muted small">{g.condNote} · expires in {Math.max(0, left)} day{left === 1 ? "" : "s"}</div></div>
    </div>
  );
}
function ListingModal({ g, onClose }: { g: GarageListing; onClose: () => void }) {
  const s = useGame(); const cat = getCat();
  const [offer, setOffer] = useState((g.ask / 100).toFixed(2)); const [msg, setMsg] = useState(""); const [bought, setBought] = useState<null | { value: number; paid: number }>(null);
  const visible = g.items.slice(0, g.visited ? g.items.length : g.shown);
  const visibleVal = visible.reduce((a, it) => a + (it.kind === "card" ? rawValue(cat, s, cat.cards.get(it.ref)!, it.cond, it.variant) : productMarket(cat, s, cat.productById.get(it.ref)!)) * it.qty, 0);
  const totalCount = g.items.reduce((a, i) => a + i.qty, 0);
  if (bought) return (
    <Modal onClose={onClose}><h2>Purchased!</h2><p>You paid <b>{usd(bought.paid)}</b>. The contents were worth about <b>{usd(bought.value)}</b> at market.</p><p className={plClass(bought.value - bought.paid)}>{bought.value >= bought.paid ? "Nice deal: +" : "Overpaid: "}{usd(bought.value - bought.paid)} on paper (before resale fees). Everything is now in your Inventory.</p><Btn onClick={onClose}>OK</Btn></Modal>);
  return (
    <Modal onClose={onClose} wide>
      <h2>{g.title}</h2>
      <div className="muted">{TYPE_LABEL[g.type]} · {g.seller} · mood: {g.mood} · expires day {g.expires + 1}</div>
      <p>"{g.desc}"</p>
      <div className="cardgrid small">{visible.map((it, i) => (
        <div key={i} className="cardtile">{it.kind === "card" ? <CardImg card={cat.cards.get(it.ref)!} /> : <div className="sealedbox"><ProductImg prod={cat.productById.get(it.ref)!} cat={cat} /></div>}
          {it.qty > 1 && <span className="qty">×{it.qty}</span>}<div className="ct1">{it.kind === "card" ? cat.cards.get(it.ref)!.name : cat.productById.get(it.ref)!.name}</div><div className="ct2"><span className="cond">{it.kind === "card" ? it.cond : "Sealed"}</span><b>{usd(it.kind === "card" ? rawValue(cat, s, cat.cards.get(it.ref)!, it.cond, it.variant) : productMarket(cat, s, cat.productById.get(it.ref)!))}</b></div></div>))}
        {!g.visited && totalCount > visible.length && <div className="cardtile hidden"><div className="mystery">?</div><div className="ct1">{totalCount - visible.length} more items not shown in photos</div></div>}</div>
      <div className="kv"><span>Asking price</span><b>{usd(g.ask)}</b><span>Seller's estimated value</span><b>{usd(g.claimedValue)}</b><span>{g.visited ? "True market value (inspected)" : "Value of items you can see"}</span><b>{usd(g.visited ? g.trueValue : visibleVal)}</b>
        {g.visited && <><span>Deal quality</span><b className={plClass(g.trueValue - g.ask)}>{g.trueValue >= g.ask ? "+" : ""}{usd(g.trueValue - g.ask)} vs market {g.trueValue > 0 ? `(${Math.round((1 - g.ask / g.trueValue) * 100)}% below)` : ""}</b></>}
        <span>Condition</span><b>{g.visited ? "Inspected: see item conditions above" : g.condNote}</b><span>Items</span><b>{g.visited ? totalCount : totalCount > visible.length ? "?" : totalCount}</b>
        {!g.visited && <><span>Travel to inspect</span><b>{usd(g.gas)} gas · 1 hour</b></>}</div>
      <div className="muted small">Resale tip: instant shop buylist pays 40-78% of market. Marketplace listings keep ~87% minus $0.30 but take time.</div>
      <div className="row">
        {!g.visited && <Btn kind="blue" onClick={() => { if (run((d) => visitListing(d, g.id)) !== undefined) sfx("click"); }}>🚗 Go inspect ({usd(g.gas)}, 1 hr)</Btn>}
        <input type="number" step="0.25" value={offer} onChange={(e) => setOffer(e.target.value)} style={{ width: 100 }} />
        <Btn kind="yellow" disabled={g.offers >= 3} onClick={() => { const r = run((d) => makeOffer(d, g.id, Math.round(+offer * 100))); if (r) { setMsg(r.msg); if (r.status === "gone") setTimeout(onClose, 1800); if (r.status === "accepted") setOffer((s.garage.find((x) => x.id === g.id)?.ask ?? 0 / 100).toString()); } }}>Make offer ({3 - g.offers} left)</Btn>
        <Btn disabled={!g.visited && g.type !== "single" && g.type !== "sealedlot" && g.type !== "lot"} onClick={() => { if (!g.visited && (g.type === "single" || g.type === "lot" || g.type === "sealedlot")) { /* visible photos suffice */ } const r = run((d) => { if (!d.garage.find((x) => x.id === g.id)!.visited) d.garage.find((x) => x.id === g.id)!.visited = true; return buyListing(d, cat, g.id); }); if (r) { sfx("buy"); setBought(r); } }}>Buy for {usd(g.ask)}</Btn>
      </div>
      {msg && <div className="chat">{msg}</div>}
      {!g.visited && (g.type === "binder" || g.type === "garage") && <div className="muted small">Inspect first to see everything (and the true value) before paying.</div>}
    </Modal>
  );
}
