import React, { useContext, useMemo, useState } from "react";
import { useGame, getCat, run } from "../store";
import { ShopEntry, ShopTab, shopEntries, shopStock, productMarket, msrpOf } from "../game/economy";
import { buyShop, hr } from "../game/actions";
import { usd, fmtDate, addDays } from "../util";
import { Btn, Chart, Modal, ProductImg, SetLogo, Tabs, Empty } from "./common";
import { sfx } from "../audio";
import { NavContext } from "../App";
import { Product } from "../types";

const TAB_INFO: Record<ShopTab, { label: string; blurb: string }> = {
  retail: { label: "Retail", blurb: "In-print products at their real MSRP. Hot products sell out most days; stock refreshes daily and each store limits what's on the shelf." },
  discontinued: { label: "Discontinued", blurb: "Older sets no longer at retail. Priced at current sealed market value (TCGplayer)." },
  secondary: { label: "Secondary market", blurb: "Recent products priced above MSRP by resellers. This is market value, not retail." },
  special: { label: "Special collections", blurb: "Tins, blisters, Build & Battle boxes, collections. Retail price where an MSRP is known, otherwise market value." },
};
const TYPE_NAME: Record<string, string> = { pack: "Booster Pack", bundle: "Booster Bundle", etb: "Elite Trainer Box", box: "Booster Box", bb: "Build & Battle", minitin: "Mini Tin", tin: "Tin", blister: "Blister", collection: "Collection" };

export function Shop() {
  const s = useGame(); const cat = getCat(); const { go } = useContext(NavContext);
  const [tab, setTab] = useState<ShopTab>("retail"); const [q, setQ] = useState(""); const [setId, setSetId] = useState(""); const [type, setType] = useState(""); const [sort, setSort] = useState("new"); const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ShopEntry | null>(null);
  const [onlyStock, setOnlyStock] = useState(true);
  const entries = useMemo(() => shopEntries(cat, s), [cat, s.day, s.overrides, s.productOverrides, s.market]);
  const withStock = useMemo(() => entries.map((e) => ({ e, stock: shopStock(cat, s, e, hr) })), [entries, s.shopBought, s.day]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const x of withStock) if (x.stock > 0 || !onlyStock) c[x.e.tab] = (c[x.e.tab] || 0) + 1; return c; }, [withStock, onlyStock]);
  let list = withStock.filter((x) => x.e.tab === tab && (!onlyStock || x.stock > 0));
  if (q) { const l = q.toLowerCase(); list = list.filter((x) => x.e.prod.name.toLowerCase().includes(l) || (x.e.prod.group || "").toLowerCase().includes(l)); }
  if (setId) list = list.filter((x) => x.e.prod.setId === setId);
  if (type) list = list.filter((x) => x.e.prod.type === type);
  list = [...list].sort((a, b) => sort === "asc" ? a.e.price - b.e.price : sort === "desc" ? b.e.price - a.e.price : sort === "name" ? a.e.prod.name.localeCompare(b.e.prod.name) : b.e.prod.pub.localeCompare(a.e.prod.pub));
  const per = 24; const pages = Math.max(1, Math.ceil(list.length / per)); const pg = Math.min(page, pages - 1);
  const shown = list.slice(pg * per, pg * per + per);
  return (
    <div className="page">
      <h1>Pack Shop</h1>
      <Tabs tabs={(Object.keys(TAB_INFO) as ShopTab[]).map((t) => ({ id: t, label: TAB_INFO[t].label, badge: counts[t] || 0 }))} value={tab} onChange={(t) => { setTab(t); setPage(0); }} />
      <p className="muted">{TAB_INFO[tab].blurb}</p>
      <div className="filters">
        <input placeholder="Search products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select value={setId} onChange={(e) => { setSetId(e.target.value); setPage(0); }}><option value="">All sets</option>{[...cat.sets].reverse().filter((x) => entries.some((e) => e.prod.setId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}><option value="">All types</option>{Object.entries(TYPE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Newest</option><option value="asc">Price ↑</option><option value="desc">Price ↓</option><option value="name">Name</option></select>
        <label className="chk"><input type="checkbox" checked={onlyStock} onChange={(e) => { setOnlyStock(e.target.checked); setPage(0); }} /> In stock only</label>
      </div>
      {shown.length === 0 ? <Empty icon="🛍️" title="Nothing on the shelf">{tab === "retail" ? "Hot products sold out. Check back after the next day, or browse Secondary market." : "No products match your filters."}</Empty> : (
        <div className="shopgrid">{shown.map(({ e, stock }) => <ProductTile key={e.key} e={e} stock={stock} onOpen={() => setDetail(e)} />)}</div>)}
      <div className="pager"><Btn small kind="ghost" disabled={pg === 0} onClick={() => setPage(pg - 1)}>← Prev</Btn><span>Page {pg + 1} / {pages} · {list.length} products</span><Btn small kind="ghost" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next →</Btn></div>
      {detail && <ProductModal e={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
function ProductTile({ e, stock, onOpen }: { e: ShopEntry; stock: number; onOpen: () => void }) {
  const cat = getCat(); const p = e.prod; const set = p.setId ? cat.setById.get(p.setId) : null;
  const buy = (q: number) => { if (run((d) => buyShop(d, cat, e.key, q)) !== undefined) sfx("buy"); };
  return (
    <div className="ptile">
      <div className="pimg" onClick={onOpen}><ProductImg prod={p} cat={cat} />{e.retail && <span className="tag green">MSRP</span>}{!e.retail && e.msrp && <span className="tag red">{Math.round((e.price / e.msrp - 1) * 100)}% over MSRP</span>}</div>
      <div className="pname" onClick={onOpen}>{p.name}</div>
      <div className="pmeta">{set && <SetLogo id={set.id} url={set.logoUrl} className="mini" />}<span>{fmtDate(p.pub)}</span></div>
      <div className="pprice"><b>{usd(e.price)}</b>{e.msrp ? <small>MSRP {usd(e.msrp)}</small> : <small>No MSRP</small>}<small>Market {usd(e.market)}</small></div>
      <div className="pmeta"><span>{p.packs > 0 ? `${p.packs} pack${p.packs > 1 ? "s" : ""}${p.setId ? "" : ""} · ${set ? set.packSize : 10} cards each` : "Collectible (no packs)"}</span><span className={stock < 3 ? "bad" : ""}>{stock} in stock</span></div>
      <div className="row"><Btn small disabled={stock < 1} onClick={() => buy(1)}>Buy 1</Btn>{stock > 1 && p.type !== "box" && <Btn small kind="yellow" disabled={stock < 2} onClick={() => buy(Math.min(stock, 4))}>Buy {Math.min(stock, 4)}</Btn>}<Btn small kind="ghost" onClick={onOpen}>Details</Btn></div>
    </div>
  );
}
function ProductModal({ e, onClose }: { e: ShopEntry; onClose: () => void }) {
  const s = useGame(); const cat = getCat(); const p = e.prod; const set = p.setId ? cat.setById.get(p.setId) : null;
  const { go } = useContext(NavContext);
  const pts = useMemo(() => { const o: { x: number; y: number }[] = []; for (let d = Math.max(0, s.day - 120); d <= s.day; d++) o.push({ x: d, y: productMarket(cat, s, p, d) }); return o; }, [s.day, s.productOverrides]);
  const stock = shopStock(cat, s, e, hr); const [qty, setQty] = useState(1);
  const ov = s.productOverrides[p.id];
  return (
    <Modal onClose={onClose} wide>
      <div className="pdetail">
        <div className="pd-img"><ProductImg prod={p} cat={cat} big /></div>
        <div className="pd-info">
          <h2>{p.name}</h2>
          <div className="pmeta">{set && <SetLogo id={set.id} url={set.logoUrl} className="mini" />}<span>{set ? set.name : p.group}</span></div>
          <div className="kv"><span>Release date</span><b>{fmtDate(p.pub)}</b><span>Type</span><b>{TYPE_NAME[p.type]}</b><span>Shop price</span><b>{usd(e.price)} {e.retail ? "(retail MSRP)" : "(market value)"}</b>
            <span>MSRP</span><b>{e.msrp ? usd(e.msrp) + (p.pub < "2023-03-01" ? " (era-standard launch MSRP)" : "") : "Not published / varies"}</b><span>Current market value</span><b>{usd(e.market)}</b>
            <span>Packs inside</span><b>{p.packs > 0 ? `${p.packs} × ${set?.packSize || 10} cards` : "None (sealed collectible)"}</b><span>Available today</span><b>{stock}</b>
            <span>Price source</span><b>{ov ? ov.src + " · " + ov.upd : "TCGplayer via tcgcsv.com (bundled snapshot)"}</b></div>
          <h4>Sealed market price history</h4>
          <Chart points={pts} h={120} fmt={(v) => usd(v)} color="#3b8bf5" />
          <div className="muted">Day {Math.max(0, s.day - 120) + 1} → today. Starts at the sourced price; later movement is simulated (reprints, hype, shortages).</div>
          <div className="row" style={{ marginTop: 10 }}>
            <input type="number" min={1} max={Math.max(1, stock)} value={qty} onChange={(ev) => setQty(Math.max(1, Math.floor(+ev.target.value || 1)))} style={{ width: 70 }} />
            <Btn disabled={stock < 1} onClick={() => { if (run((d) => buyShop(d, cat, e.key, qty)) !== undefined) sfx("buy"); }}>Buy {qty} for {usd(e.price * qty)}</Btn>
            <Btn kind="blue" onClick={() => go("open")}>Go to Pack Opening</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
