import React, { useContext, useMemo, useState } from "react";
import { useGame, getCat, run } from "../store";
import { Card, COND_NAME, COND_ORDER, Condition, InvItem, TIER_RANK, Variant } from "../types";
import { Badge, Btn, CardImg, Chart, Empty, Modal, ProductImg, SetLogo, Tabs, cardHistory, plClass, TIER_COLOR } from "./common";
import { gradedValue, itemName, itemUnitValue, nmCents, priceInfo, rawValue, totals, buylistRate, marketFee, listingSaleChance, productMarket } from "../game/economy";
import { buySingle, cancelListing, listForSale, sellInstant, sellMany, sellQuote, singlePrice, SHIPPING } from "../game/actions";
import { usd, fmtDate, addDays } from "../util";
import { sfx } from "../audio";
import { NavContext } from "../App";
import { setProgress } from "../game/progress";

type View = "grid" | "list" | "binder";
export function Inventory() {
  const s = useGame(); const cat = getCat(); const { go, arg } = useContext(NavContext);
  const [view, setView] = useState<View>("grid"); const [q, setQ] = useState(""); const [sort, setSort] = useState("value"); const [cond, setCond] = useState(""); const [gr, setGr] = useState(""); const [kind, setKind] = useState("");
  const [detail, setDetail] = useState<Card | null>(null); const [sell, setSell] = useState<InvItem | null>(null); const [sel, setSel] = useState<Set<string>>(new Set()); const [selMode, setSelMode] = useState(false); const [bulk, setBulk] = useState(false);
  const [tab, setTab] = useState<"items" | "listings" | "history" | "sets">("items"); const [bpage, setBpage] = useState(0);
  const t = totals(cat, s);
  const rows = useMemo(() => {
    let r = s.inv.map((it) => ({ it, unit: itemUnitValue(cat, s, it), card: it.kind === "card" ? cat.cards.get(it.ref)! : null, prod: it.kind === "sealed" ? cat.productById.get(it.ref)! : null }));
    if (q) { const l = q.toLowerCase(); r = r.filter((x) => (x.card?.name || x.prod?.name || "").toLowerCase().includes(l)); }
    if (cond) r = r.filter((x) => x.it.cond === cond && x.it.kind === "card");
    if (gr === "graded") r = r.filter((x) => !!x.it.grade); if (gr === "raw") r = r.filter((x) => !x.it.grade);
    if (kind) r = r.filter((x) => x.it.kind === kind);
    const key = (x: typeof r[number]) => sort === "value" ? -x.unit * x.it.qty : sort === "unit" ? -x.unit : sort === "rarity" ? -(x.card ? TIER_RANK[x.card.tier] * 1e6 + x.unit : 0) : sort === "profit" ? -(x.unit * x.it.qty - x.it.cost) : sort === "new" ? -x.it.acq : 0;
    return r.sort((a, b) => sort === "set" ? ((a.card?.setId || "zz") + (a.card?.number || "")).localeCompare((b.card?.setId || "zz") + (b.card?.number || ""), undefined, { numeric: true }) : sort === "name" ? (a.card?.name || a.prod!.name).localeCompare(b.card?.name || b.prod!.name) : key(a) - key(b));
  }, [s.inv, q, sort, cond, gr, kind, s.day, s.overrides, s.market]);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const open = (r: typeof rows[number]) => { if (selMode) toggle(r.it.id); else if (r.card) setDetail(r.card); else setSell(r.it); };
  const selItems = s.inv.filter((i) => sel.has(i.id));
  const selQuote = selItems.reduce((a, i) => { const q = sellQuote(cat, s, i, i.qty); return { net: a.net + q.net, cost: a.cost + q.cost, market: a.market + q.market }; }, { net: 0, cost: 0, market: 0 });
  const cardsOnly = rows.filter((r) => r.card);
  // binder: pages of 9, sorted by set/number
  const binderCards = useMemo(() => [...cardsOnly].sort((a, b) => (cat.setById.get(a.card!.setId)!.rel + a.card!.setId + a.card!.number.padStart(4, "0")).localeCompare(cat.setById.get(b.card!.setId)!.rel + b.card!.setId + b.card!.number.padStart(4, "0"))), [rows]);
  const bpages = Math.max(2, Math.ceil(binderCards.length / 9 / 2) * 2); const bp = Math.min(bpage, Math.max(0, bpages - 2));
  return (
    <div className="page">
      <h1>Inventory</h1>
      <div className="stats small"><div className="stat"><div className="sl">Items</div><div className="sv">{t.count}</div></div><div className="stat"><div className="sl">Market value</div><div className="sv">{usd(t.cards + t.sealed + t.graded)}</div></div><div className="stat"><div className="sl">Cost basis</div><div className="sv">{usd(t.basis)}</div></div><div className="stat"><div className="sl">Unrealized P/L</div><div className={"sv " + plClass(t.unrealized)}>{usd(t.unrealized)}</div></div></div>
      <Tabs tabs={[{ id: "items", label: "My items" }, { id: "listings", label: "My listings", badge: s.listings.length }, { id: "history", label: "Purchase & sale history" }, { id: "sets", label: "Set progress" }]} value={tab} onChange={setTab} />
      {tab === "items" && <>
        <div className="filters">
          <input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="value">Sort: total value</option><option value="unit">Sort: price each</option><option value="rarity">Sort: rarity</option><option value="set">Sort: set</option><option value="name">Sort: name</option><option value="profit">Sort: profit</option><option value="new">Sort: newest</option></select>
          <select value={cond} onChange={(e) => setCond(e.target.value)}><option value="">Any condition</option>{COND_ORDER.map((c) => <option key={c} value={c}>{COND_NAME[c]}</option>)}</select>
          <select value={gr} onChange={(e) => setGr(e.target.value)}><option value="">Raw + graded</option><option value="raw">Raw only</option><option value="graded">Graded only</option></select>
          <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Cards + sealed</option><option value="card">Cards</option><option value="sealed">Sealed</option></select>
          <div className="seg">{(["grid", "list", "binder"] as View[]).map((v) => <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>)}</div>
          <Btn small kind={selMode ? "yellow" : "ghost"} onClick={() => { setSelMode(!selMode); setSel(new Set()); }}>{selMode ? "Done selecting" : "Select multiple"}</Btn>
          <Btn small kind="ghost" onClick={() => setBulk(true)}>Sell bulk…</Btn>
        </div>
        {selMode && <div className="selbar">{sel.size} selected · shop offer <b>{usd(selQuote.net)}</b> (market {usd(selQuote.market)}, cost {usd(selQuote.cost)}, <span className={plClass(selQuote.net - selQuote.cost)}>{selQuote.net - selQuote.cost >= 0 ? "+" : ""}{usd(selQuote.net - selQuote.cost)}</span>) <Btn small disabled={!sel.size} onClick={() => { const r = run((d) => sellMany(d, cat, selItems.map((i) => ({ id: i.id, qty: i.qty })))); if (r) { sfx("sell"); setSel(new Set()); } }}>Sell selected to shop</Btn></div>}
        {rows.length === 0 ? <Empty icon="📒" title="Your binder is empty">Open some packs, buy singles, or hunt garage sales.</Empty> : view === "grid" ? (
          <div className="cardgrid">{rows.slice(0, 300).map((r) => (
            <div key={r.it.id} className={"cardtile" + (sel.has(r.it.id) ? " sel" : "")} onClick={() => open(r)}>
              {r.card ? <CardImg card={r.card} /> : <div className="sealedbox"><ProductImg prod={r.prod!} cat={cat} /></div>}
              {r.it.qty > 1 && <span className="qty">×{r.it.qty}</span>}{r.it.grade && <span className="slab">{r.it.grade.co} {r.it.grade.g}</span>}
              <div className="ct1">{r.card ? r.card.name : r.prod!.name}</div>
              <div className="ct2"><span className="cond">{r.it.kind === "card" ? r.it.cond + (r.it.variant === "rev" ? " · Rev" : "") : "Sealed"}</span><b>{usd(r.unit)}</b></div>
              <div className={"ct3 " + plClass(r.unit * r.it.qty - r.it.cost)}>{r.unit * r.it.qty - r.it.cost >= 0 ? "+" : ""}{usd(r.unit * r.it.qty - r.it.cost)}</div>
            </div>))}</div>
        ) : view === "list" ? (
          <table className="tbl"><thead><tr><th></th><th>Name</th><th>Set / #</th><th>Rarity</th><th>Cond.</th><th>Qty</th><th>Value ea.</th><th>Paid (total)</th><th>P/L</th><th>Status</th></tr></thead><tbody>
            {rows.slice(0, 500).map((r) => { const pl = r.unit * r.it.qty - r.it.cost; return (
              <tr key={r.it.id} className={sel.has(r.it.id) ? "sel" : ""} onClick={() => open(r)}>
                <td>{r.card ? <CardImg card={r.card} className="mini" /> : <ProductImg prod={r.prod!} cat={cat} className="mini" />}</td>
                <td><b>{r.card ? r.card.name : r.prod!.name}</b></td><td>{r.card ? `${cat.setById.get(r.card.setId)?.name} #${r.card.number}` : r.prod!.group}</td>
                <td>{r.card ? <Badge tier={r.card.tier} /> : "Sealed"}</td><td>{r.it.kind === "card" ? r.it.cond : "-"}</td><td>{r.it.qty}</td><td>{usd(r.unit)}</td><td>{usd(r.it.cost)}</td><td className={plClass(pl)}>{usd(pl)}</td><td>{r.it.grade ? `${r.it.grade.co} ${r.it.grade.g}` : "Raw"}</td></tr>); })}</tbody></table>
        ) : (
          <div className="binder">
            <div className="binder-pages">{[bp, bp + 1].map((pi) => (
              <div className="bpage" key={pi}><div className="bgrid">{Array.from({ length: 9 }, (_, k) => { const r = binderCards[pi * 9 + k]; return r ? <div key={k} className="slot" onClick={() => open(r)}><CardImg card={r.card!} /><span className="slotv">{usd(r.unit)}</span></div> : <div key={k} className="slot empty" />; })}</div><div className="pnum">Page {pi + 1}</div></div>))}</div>
            <div className="pager"><Btn small kind="ghost" disabled={bp === 0} onClick={() => setBpage(Math.max(0, bp - 2))}>← Previous pages</Btn><span>{binderCards.length} cards (sorted by set and number)</span><Btn small kind="ghost" disabled={bp + 2 >= bpages} onClick={() => setBpage(bp + 2)}>Next pages →</Btn></div>
          </div>)}
        {rows.length > 300 && view !== "binder" && <p className="muted">Showing the first {Math.min(rows.length, view === "grid" ? 300 : 500)} of {rows.length}. Use search and filters to narrow down.</p>}
      </>}
      {tab === "listings" && <Listings />}
      {tab === "history" && <History />}
      {tab === "sets" && <SetProgress />}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
      {sell && <SellModal item={sell} onClose={() => setSell(null)} />}
      {bulk && <BulkSell onClose={() => setBulk(false)} />}
    </div>
  );
}
function Listings() {
  const s = useGame(); const cat = getCat();
  if (!s.listings.length) return <Empty icon="🏷️" title="No active marketplace listings">List an item from your inventory to sell it at your own price (13% fees, may take days to sell).</Empty>;
  return <table className="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Ask each</th><th>Market each</th><th>Chance/day</th><th>Listed</th><th></th></tr></thead><tbody>{s.listings.map((l) => {
    const m = l.kind === "card" ? (l.grade ? gradedValue(cat, s, cat.cards.get(l.ref)!, l.grade.co, l.grade.g, l.variant).cents : rawValue(cat, s, cat.cards.get(l.ref)!, l.cond, l.variant)) : productMarket(cat, s, cat.productById.get(l.ref)!);
    return <tr key={l.id}><td><b>{itemName(cat, l)}</b></td><td>{l.qty}</td><td>{usd(l.ask)}</td><td>{usd(m)}</td><td>{(listingSaleChance(l.ask, m) * 100).toFixed(0)}%</td><td>Day {l.day + 1}</td><td><Btn small kind="ghost" onClick={() => run((d) => cancelListing(d, cat, l.id))}>Cancel</Btn></td></tr>; })}</tbody></table>;
}
function History() {
  const s = useGame();
  return <div className="grid2"><section className="panel"><h3>Purchases</h3>{s.buys.length === 0 ? <p className="muted">None yet.</p> : <table className="tbl"><tbody>{s.buys.slice(0, 100).map((b, i) => <tr key={i}><td>{fmtDate(addDays(s.startDate, b.day))}</td><td>{b.name}{b.qty > 1 ? ` ×${b.qty}` : ""}</td><td className="muted">{b.kind}</td><td><b>{usd(b.cents)}</b></td></tr>)}</tbody></table>}</section>
    <section className="panel"><h3>Sales</h3>{s.sells.length === 0 ? <p className="muted">None yet.</p> : <table className="tbl"><tbody>{s.sells.slice(0, 100).map((b, i) => <tr key={i}><td>{fmtDate(addDays(s.startDate, b.day))}</td><td>{b.name}{b.qty > 1 ? ` ×${b.qty}` : ""}</td><td className="muted">{b.how}</td><td><b>{usd(b.net)}</b></td><td className={plClass(b.net - b.cost)}>{b.net - b.cost >= 0 ? "+" : ""}{usd(b.net - b.cost)}</td></tr>)}</tbody></table>}</section></div>;
}
function SetProgress() {
  const s = useGame(); const cat = getCat();
  const rows = cat.sets.map((x) => ({ x, p: setProgress(s, cat, x.id) })).filter((r) => r.p.owned > 0).sort((a, b) => b.p.owned / b.p.total - a.p.owned / a.p.total);
  if (!rows.length) return <Empty icon="🏆" title="No set progress yet">Collect cards to start completing sets.</Empty>;
  return <div className="setprog">{rows.map(({ x, p }) => <div key={x.id} className="sp"><SetLogo id={x.id} url={x.logoUrl} /><div className="bar"><div style={{ width: (p.owned / p.total) * 100 + "%" }} /></div><small>{p.owned}/{p.total} ({Math.round((p.owned / p.total) * 100)}%)</small></div>)}</div>;
}
function BulkSell({ onClose }: { onClose: () => void }) {
  const s = useGame(); const cat = getCat(); const [max, setMax] = useState(100);
  const items = s.inv.filter((i) => i.kind === "card" && !i.grade && itemUnitValue(cat, s, i) < max);
  const q = items.reduce((a, i) => { const x = sellQuote(cat, s, i, i.qty); return { net: a.net + x.net, cost: a.cost + x.cost, n: a.n + i.qty }; }, { net: 0, cost: 0, n: 0 });
  return <Modal onClose={onClose}><h2>Sell bulk to the shop</h2><p>Sell every raw card worth less than <input type="number" style={{ width: 80 }} value={max / 100} min={0.1} step={0.5} onChange={(e) => setMax(Math.round(+e.target.value * 100))} /> dollars each.</p>
    <div className="kv"><span>Cards</span><b>{q.n} in {items.length} stacks</b><span>Shop offer</span><b>{usd(q.net)}</b><span>Your cost</span><b>{usd(q.cost)}</b><span>Profit/loss</span><b className={plClass(q.net - q.cost)}>{usd(q.net - q.cost)}</b></div>
    <p className="muted">Shop buylist pays 40–78% of market depending on value. Bulk is worth little; keep it if you want to build sets.</p>
    <Btn disabled={!items.length} onClick={() => { const r = run((d) => sellMany(d, cat, items.map((i) => ({ id: i.id, qty: i.qty })))); if (r) { sfx("sell"); onClose(); } }}>Sell {q.n} cards for {usd(q.net)}</Btn></Modal>;
}
export function SellModal({ item, onClose }: { item: InvItem; onClose: () => void }) {
  const s = useGame(); const cat = getCat(); const cur = s.inv.find((i) => i.id === item.id);
  const [qty, setQty] = useState(cur?.qty || 1); const [mode, setMode] = useState<"instant" | "list">("instant");
  const unit = cur ? itemUnitValue(cat, s, cur) : 0; const [ask, setAsk] = useState(unit);
  if (!cur) { onClose(); return null; }
  const q = sellQuote(cat, s, cur, qty); const gross = ask * qty; const fee = marketFee(gross); const cost = Math.round((cur.cost * qty) / cur.qty);
  const name = itemName(cat, cur);
  return (
    <Modal onClose={onClose}><h2>Sell {name}</h2>
      <div className="row"><span>Quantity</span><input type="number" min={1} max={cur.qty} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(cur.qty, Math.floor(+e.target.value || 1))))} style={{ width: 70 }} /><Btn small kind="ghost" onClick={() => setQty(cur.qty)}>All ({cur.qty})</Btn></div>
      <Tabs tabs={[{ id: "instant", label: "Sell to shop now" }, { id: "list", label: "List on marketplace" }]} value={mode} onChange={setMode} />
      <div className="kv"><span>Estimated market value</span><b>{usd(unit * qty)}</b>
        {mode === "instant" ? <><span>Shop offer ({Math.round(q.rate * 100)}% of market)</span><b>{usd(q.gross)}</b><span>Fees</span><b>$0.00</b><span>You receive</span><b>{usd(q.net)}</b></> :
          <><span>Your asking price (each)</span><b><input type="number" step="0.25" min={0.25} value={(ask / 100).toFixed(2)} onChange={(e) => setAsk(Math.max(25, Math.round(+e.target.value * 100)))} style={{ width: 90 }} /></b>
            <span>Selling price total</span><b>{usd(gross)}</b><span>Marketplace fee (12.55% + $0.30)</span><b>-{usd(fee)}</b><span>You receive if sold</span><b>{usd(gross - fee)}</b><span>Chance it sells each day</span><b>{(listingSaleChance(ask, unit) * 100).toFixed(0)}%</b></>}
        <span>Your cost</span><b>{usd(cost)}</b><span>Profit / loss</span><b className={plClass((mode === "instant" ? q.net : gross - fee) - cost)}>{usd((mode === "instant" ? q.net : gross - fee) - cost)}</b></div>
      {mode === "instant" ? <Btn onClick={() => { if (run((d) => sellInstant(d, cat, cur.id, qty))) { sfx("sell"); onClose(); } }}>Sell for {usd(q.net)}</Btn> : <Btn onClick={() => { if (run((d) => listForSale(d, cat, cur.id, qty, ask)) !== undefined) { sfx("sell"); onClose(); } }}>List for sale</Btn>}
    </Modal>
  );
}
export function CardDetail({ card, onClose }: { card: Card; onClose: () => void }) {
  const s = useGame(); const cat = getCat(); const { go } = useContext(NavContext);
  const set = cat.setById.get(card.setId)!;
  const [v, setV] = useState<Variant>("std"); const [cond, setCond] = useState<Condition>("NM"); const [qty, setQty] = useState(1); const [sell, setSell] = useState<InvItem | null>(null);
  const info = priceInfo(cat, s, card, v);
  const hist = useMemo(() => cardHistory(cat, s, card, v, 90), [card.id, v, s.day, s.overrides]);
  const owned = s.inv.filter((i) => i.kind === "card" && i.ref === card.id);
  const buyP = singlePrice(cat, s, card, cond, v);
  const buys = s.buys.filter((b) => b.ref === card.id).slice(0, 5);
  const first = hist[0]?.y || info.cents; const change = (info.cents - first) / first;
  return (
    <Modal onClose={onClose} wide>
      <div className="cdetail">
        <div className="cd-img"><CardImg card={card} large className="big" /></div>
        <div className="cd-info">
          <h2>{card.name}</h2>
          <div className="pmeta"><SetLogo id={set.id} url={set.logoUrl} className="mini" /><span>{set.name} · #{card.number}/{set.printed}</span></div>
          <div className="row"><Badge tier={card.tier} /><span className="muted">{card.rarity}</span></div>
          <div className="pricebox"><div><small>Near Mint market</small><div className="big">{usd(info.cents)}</div></div><div className={plClass(change)}>{change >= 0 ? "▲" : "▼"} {(Math.abs(change) * 100).toFixed(1)}% (90d sim)</div></div>
          <div className="srcbox"><b>Source:</b> {info.source}{info.updated && <> · sourced {info.updated}</>}{info.stale && !info.estimated && <span className="warn"> · OUTDATED (cached snapshot, refresh in Settings)</span>}{info.estimated && <span className="warn"> · ESTIMATE, no sourced price exists</span>}<br />Currency USD · Near Mint · Raw. Movement after day 1 is <b>simulated</b>.</div>
          <Chart points={hist} h={110} fmt={(x) => usd(x)} color="#ee1c25" />
          <div className="kv">{COND_ORDER.map((c) => <React.Fragment key={c}><span>{COND_NAME[c]}</span><b>{usd(rawValue(cat, s, card, c, v))}</b></React.Fragment>)}</div>
          <div className="muted small">Graded estimate (fallback model): PSA 9 {usd(gradedValue(cat, s, card, "PSA", 9, v).cents)} · PSA 10 {usd(gradedValue(cat, s, card, "PSA", 10, v).cents)}{s.gradedOverrides[`${card.id}:PSA:10`] ? " (sourced via CSV)" : ""}</div>
          {card.revPrice && <div className="row"><label className="chk"><input type="radio" checked={v === "std"} onChange={() => setV("std")} /> Standard</label><label className="chk"><input type="radio" checked={v === "rev"} onChange={() => setV("rev")} /> Reverse holo</label></div>}
          <h4>Buy this card</h4>
          <div className="row"><select value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{COND_ORDER.map((c) => <option key={c} value={c}>{COND_NAME[c]}</option>)}</select><input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(20, Math.floor(+e.target.value || 1))))} style={{ width: 60 }} />
            <Btn onClick={() => { if (run((d) => buySingle(d, cat, card.id, cond, qty, v)) !== undefined) sfx("buy"); }}>Buy · {usd(buyP * qty + SHIPPING)}</Btn></div>
          <div className="muted small">Market listing price {usd(buyP)} each (market + 8% dealer spread) + {usd(SHIPPING)} shipping per order. Look for daily deals in the Card Market for cheaper copies.</div>
          {owned.length > 0 && <><h4>You own</h4>{owned.map((it) => { const u = itemUnitValue(cat, s, it); return <div key={it.id} className="ownrow"><span>{it.qty}× {it.grade ? `${it.grade.co} ${it.grade.g}` : COND_NAME[it.cond]}{it.variant === "rev" ? " (Reverse)" : ""}</span><span>Paid {usd(it.cost)} · Worth {usd(u * it.qty)} · <b className={plClass(u * it.qty - it.cost)}>{usd(u * it.qty - it.cost)}</b></span><span className="row">{!it.grade && <Btn small kind="blue" onClick={() => { onClose(); go("grade", { invId: it.id }); }}>Grade</Btn>}<Btn small kind="yellow" onClick={() => setSell(it)}>Sell</Btn></span></div>; })}</>}
          {buys.length > 0 && <><h4>Your purchase history</h4>{buys.map((b, i) => <div key={i} className="line"><span>{fmtDate(addDays(s.startDate, b.day))} · {b.kind}</span><b>{b.qty}× {usd(b.cents)}</b></div>)}</>}
        </div>
      </div>
      {sell && <SellModal item={sell} onClose={() => setSell(null)} />}
    </Modal>
  );
}
