import React, { useState } from "react";
import { Card, GameState, Product, Tier, TIER_NAME, Variant } from "../types";
import { Catalog } from "../game/catalog";
import { cardFactor } from "../game/market";
import { nmCents, rawBase, rawValue, productMarket } from "../game/economy";
import { sfx } from "../audio";

export const base = (p: string) => (import.meta.env.BASE_URL || "./") + p;
export const TIER_COLOR: Record<Tier, string> = { c: "#9aa5b1", u: "#3dbb6e", r: "#3b8bf5", h: "#9a5cf0", dr: "#f0a31a", ur: "#f06a1a", ir: "#e84fa3", sir: "#ff3d6e", hr: "#ffd21f", sh: "#1fd6c9", e: "#7a8794", promo: "#8a8f98" };
export const tierLabel = (t: Tier) => TIER_NAME[t];

export function Pokeball({ size = 28, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg className={spin ? "spin" : ""} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="#222" strokeWidth="6" />
      <path d="M4 50a46 46 0 0 1 92 0z" fill="#ee1c25" stroke="#222" strokeWidth="6" />
      <rect x="4" y="46" width="92" height="8" fill="#222" />
      <circle cx="50" cy="50" r="14" fill="#fff" stroke="#222" strokeWidth="6" />
      <circle cx="50" cy="50" r="6" fill="#fff" stroke="#222" strokeWidth="3" />
    </svg>
  );
}
export function CardImg({ card, large, className = "", onClick, title }: { card: Card; large?: boolean; className?: string; onClick?: () => void; title?: string }) {
  const [err, setErr] = useState(0);
  const src = err === 0 ? (large ? card.imgLarge : card.imgUrl) : err === 1 ? card.imgUrl : "";
  return src ? (
    <img className={"cardimg " + className} src={src} alt={card.name} title={title} loading="lazy" draggable={false} onClick={onClick} onError={() => setErr(err + 1)} />
  ) : (
    <div className={"cardimg cardback " + className} onClick={onClick} title={title}><Pokeball size={44} /><span>{card.name}</span></div>
  );
}
export function SetLogo({ id, url, className = "" }: { id: string; url?: string; className?: string }) {
  const [err, setErr] = useState(false);
  return <img className={"setlogo " + className} src={err && url ? url : base(`img/sets/${id}_logo.png`)} alt="" loading="lazy" onError={() => setErr(true)} />;
}
export function SetSymbol({ id, url }: { id: string; url?: string }) {
  const [err, setErr] = useState(false);
  return <img className="setsym" src={err && url ? url : base(`img/sets/${id}_symbol.png`)} alt="" loading="lazy" onError={() => setErr(true)} />;
}
export function ProductImg({ prod, cat, className = "", big }: { prod: Product; cat: Catalog; className?: string; big?: boolean }) {
  const [err, setErr] = useState(0);
  const set = prod.setId ? cat.setById.get(prod.setId) : null;
  if (prod.img && err < 2) {
    const src = big && err === 0 && prod.imgRemote ? prod.imgRemote : base(prod.img);
    return <img className={"prodimg " + className} src={src} alt={prod.name} loading="lazy" draggable={false} onError={() => setErr(err + 1)} />;
  }
  const setPack = set ? cat.packProductBySet.get(set.id) : null;
  if (setPack && setPack.img && setPack.id !== prod.id && prod.type === "pack") return <ProductImg prod={setPack} cat={cat} className={className} big={big} />;
  return (
    <div className={"prodimg fakepack " + className}>
      <div className="fp-top" />
      {set ? <SetLogo id={set.id} url={set.logoUrl} /> : <Pokeball size={40} />}
      <b>{prod.type === "pack" ? "Booster Pack" : prod.type.toUpperCase()}</b>
    </div>
  );
}
export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")}><button className="x" onClick={onClose} aria-label="Close">×</button>{children}</div>
    </div>
  );
}
export function Btn({ children, onClick, kind = "red", disabled, small, title }: { children: React.ReactNode; onClick?: () => void; kind?: "red" | "blue" | "yellow" | "green" | "ghost"; disabled?: boolean; small?: boolean; title?: string }) {
  return <button title={title} className={`btn ${kind}${small ? " small" : ""}`} disabled={disabled} onClick={() => { sfx("click"); onClick?.(); }}>{children}</button>;
}
export function Chart({ points, w = 320, h = 100, color = "#3b8bf5", labels = true, fmt }: { points: { x: number; y: number }[]; w?: number; h?: number; color?: string; labels?: boolean; fmt?: (v: number) => string }) {
  if (points.length < 2) return <div className="chart-empty">Not enough history yet. Advance time to build a price history.</div>;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs); let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = 6; const sx = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (w - pad * 2); const sy = (y: number) => h - pad - ((y - y0) / (y1 - y0)) * (h - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${sx(x1)} ${h - pad} L${sx(x0)} ${h - pad} Z`;
  const gid = "g" + Math.abs(Math.round(y1 * 7 + w));
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{ height: h }}>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} /><path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {labels && <><text x="4" y="12" className="ct">{(fmt || ((v) => v.toFixed(0)))(y1)}</text><text x="4" y={h - 3} className="ct">{(fmt || ((v) => v.toFixed(0)))(y0)}</text></>}
    </svg>
  );
}
export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return <div className="stat"><div className="sl">{label}</div><div className={"sv " + (tone || "")}>{value}</div>{sub && <div className="ss">{sub}</div>}</div>;
}
export function Badge({ tier }: { tier: Tier }) { return <span className="rbadge" style={{ background: TIER_COLOR[tier] }}>{tierLabel(tier)}</span>; }
export function plClass(v: number) { return v > 0 ? "good" : v < 0 ? "bad" : ""; }
export function cardHistory(cat: Catalog, s: GameState, c: Card, v: Variant = "std", days = 90) {
  const out: { x: number; y: number }[] = []; const b = rawBase(s, c, v);
  for (let d = Math.max(0, s.day - days); d <= s.day; d++) out.push({ x: d, y: nmCents(cat, s, c, v, d) });
  return out;
}
export function Empty({ icon = "🎴", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return <div className="empty"><div className="ei">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void }) {
  return <div className="tabs">{tabs.map((t) => <button key={t.id} className={t.id === value ? "on" : ""} onClick={() => { sfx("click"); onChange(t.id); }}>{t.label}{t.badge != null && <i>{t.badge}</i>}</button>)}</div>;
}
