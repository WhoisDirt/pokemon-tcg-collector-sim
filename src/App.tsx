import React, { useEffect, useState } from "react";
import { useGame, useMsgs, msgs, getCat, run, flush } from "./store";
import { api } from "./api";
import { Catalog } from "./game/catalog";
import { totals } from "./game/economy";
import { RANKS, rankOf } from "./game/progress";
import { endDay, sleepDays } from "./game/actions";
import { DAY_HOURS } from "./game/work";
import { addDays, fmtDate, usd } from "./util";
import { Pokeball, Modal, Btn } from "./ui/common";
import { sfx, musicInfo, onMusicChange, nextTrack, setAudioConfig, startMusic } from "./audio";
import { Dashboard } from "./ui/Dashboard";
import { Shop } from "./ui/Shop";
import { Opening } from "./ui/Opening";
import { Cards } from "./ui/Cards";
import { Inventory } from "./ui/Inventory";
import { Grading } from "./ui/Grading";
import { Garage } from "./ui/Garage";
import { Work } from "./ui/Work";
import { Trends } from "./ui/Trends";
import { Settings } from "./ui/Settings";

export type Page = "home" | "shop" | "open" | "cards" | "inv" | "grade" | "garage" | "work" | "trends" | "settings";
const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" }, { id: "shop", label: "Pack Shop", icon: "🛍️" }, { id: "open", label: "Pack Opening", icon: "✨" },
  { id: "cards", label: "Card Market", icon: "🃏" }, { id: "inv", label: "Inventory", icon: "📒" }, { id: "grade", label: "Grading Center", icon: "🏅" },
  { id: "garage", label: "Private Sellers", icon: "🏷️" }, { id: "work", label: "Work", icon: "💼" }, { id: "trends", label: "Market Trends", icon: "📈" }, { id: "settings", label: "Settings", icon: "⚙️" },
];
export const NavContext = React.createContext<{ go: (p: Page, arg?: any) => void; arg: any }>({ go: () => {}, arg: null });

export function App({ cat }: { cat: Catalog }) {
  const s = useGame(); useMsgs();
  const [page, setPage] = useState<Page>("home"); const [arg, setArg] = useState<any>(null);
  const [, force] = useState(0);
  useEffect(() => { const off = onMusicChange(() => force((x) => x + 1)); return () => { off(); }; }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme; (document.body.style as any).zoom = String(s.settings.scale);
    document.documentElement.style.setProperty("--anim", String(1 / Math.max(0.25, s.settings.animSpeed)));
    setAudioConfig({ music: s.settings.music, sfx: s.settings.sfx, musicVol: s.settings.musicVol, sfxVol: s.settings.sfxVol });
  }, [s.settings]);
  useEffect(() => { void startMusic(); }, []);
  useEffect(() => { if (s.settings.autoBackup && s.day > 0 && s.day % Math.max(1, s.settings.backupEveryDays) === 0) { void flush().then(() => api.backup("auto-day" + s.day)).catch(() => {}); } }, [s.day]);
  const t = totals(cat, s); const rank = rankOf(t.netWorth); const next = RANKS[rank + 1];
  const go = (p: Page, a?: any) => { setPage(p); setArg(a ?? null); sfx("click"); };
  const mi = musicInfo();
  return (
    <NavContext.Provider value={{ go, arg }}>
      <div className="app">
        <aside className="side">
          <div className="brand"><img className="plogo" src={import.meta.env.BASE_URL + "img/pokemon-logo.svg"} alt="Pokémon" /><div className="sub">Collector &amp; Card Shop</div></div>
          <nav>{NAV.map((n) => (
            <button key={n.id} className={"nav" + (page === n.id ? " on" : "")} onClick={() => go(n.id)}>
              <span className="ni">{n.icon}</span>{n.label}
              {n.id === "grade" && s.grading.some((g) => g.done && false) ? <i /> : null}
              {n.id === "garage" && s.garage.length > 0 && <em>{s.garage.length}</em>}
              {n.id === "grade" && s.grading.filter((g) => !g.done).length > 0 && <em>{s.grading.filter((g) => !g.done).length}</em>}
            </button>))}
          </nav>
          <div className="rankbox"><Pokeball size={22} /> <b>{RANKS[rank].name}</b>
            {next && <div className="bar"><div style={{ width: Math.min(100, ((t.netWorth - RANKS[rank].at) / (next.at - RANKS[rank].at)) * 100) + "%" }} /></div>}
            {next && <small>{usd(next.at - t.netWorth)} to {next.name}</small>}
          </div>
          <div className="mini-music" title="Background music">
            <button onClick={() => { sfx("click"); void nextTrack(); }} title="Next track">⏭</button>
            <span>{s.settings.music ? (mi.nowPlaying ? "♪ " + mi.nowPlaying : "♪ loading…") : "Music off"}</span>
          </div>
        </aside>
        <main className="main">
          <header className="top">
            <div className="cash"><span>💵</span><b>{usd(s.cash)}</b></div>
            <div className="clock"><b>{fmtDate(addDays(s.startDate, s.day))}</b> · Day {s.day + 1}<div className="hours"><div style={{ width: (s.hour / DAY_HOURS) * 100 + "%" }} /></div><small>{DAY_HOURS - s.hour} hrs left today</small></div>
            <div className="timebtns">
              <Btn small kind="blue" onClick={() => run((d) => endDay(d, cat))} title="Sleep until tomorrow">Next day</Btn>
              <Btn small kind="blue" onClick={() => run((d) => sleepDays(d, cat, 7))} title="Skip a week (living costs apply)">+7 days</Btn>
            </div>
          </header>
          <div className="content" key={page}>
            {page === "home" && <Dashboard />}{page === "shop" && <Shop />}{page === "open" && <Opening />}{page === "cards" && <Cards />}
            {page === "inv" && <Inventory />}{page === "grade" && <Grading />}{page === "garage" && <Garage />}{page === "work" && <Work />}
            {page === "trends" && <Trends />}{page === "settings" && <Settings />}
          </div>
        </main>
        <div className="toasts">{msgs.map((m) => <div key={m.id} className={"toast " + m.kind}>{m.text}</div>)}</div>
        {!s.seenIntro && (
          <Modal onClose={() => run((d) => { d.seenIntro = true; })}>
            <h2>Welcome, trainer!</h2>
            <p>You have <b>{usd(s.cash)}</b>, one free booster pack, and a dream. Everything here uses simulated money.</p>
            <ul className="intro"><li>💼 <b>Work</b> small shifts for cash. It is slow on purpose.</li><li>🛍️ Buy packs at <b>real MSRP</b> when the shop has stock, or at market price from the secondary market.</li><li>🏷️ Check <b>Private Sellers</b> for undervalued lots. Haggle, visit, and flip.</li><li>🏅 Grade your best cards, and watch Market Trends for opportunities.</li></ul>
            <Btn onClick={() => run((d) => { d.seenIntro = true; })}>Let's go!</Btn>
          </Modal>
        )}
      </div>
    </NavContext.Provider>
  );
}
