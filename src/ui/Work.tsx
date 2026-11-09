import React, { useState } from "react";
import { useGame, run, pushMsg } from "../store";
import { JOBS, MAX_PAID_HOURS, DAY_HOURS, hourlyBase, level, streakFactor, unlocked, workShift } from "../game/work";
import { Btn, Stat } from "./common";
import { usd } from "../util";
import { sfx } from "../audio";
import { endDay } from "../game/actions";
import { getCat } from "../store";

export function Work() {
  const s = useGame(); const cat = getCat();
  const [hours, setHours] = useState(2); const [busy, setBusy] = useState<string | null>(null); const [last, setLast] = useState<string>("");
  const left = Math.min(MAX_PAID_HOURS - s.work.today, DAY_HOURS - s.hour);
  const go = (id: string) => {
    if (busy) return; const h = Math.min(hours, left); if (h < 1) { pushMsg("No paid hours left today. Rest until tomorrow.", "error"); return; }
    setBusy(id); sfx("work");
    setTimeout(() => {
      const r = run((d) => workShift(d, id, h));
      setBusy(null);
      if (r) { sfx("coin"); setLast(`${r.hours}h shift: gross ${usd(r.gross)}${r.tax ? `, tax -${usd(r.tax)}` : ""}${r.cost ? `, expenses -${usd(r.cost)}` : ""} = ${usd(r.net)}. ${r.note}`); }
    }, 900);
  };
  return (
    <div className="page">
      <h1>Work</h1>
      <p className="muted">Jobs pay small wages on purpose. Paid hours are capped at {MAX_PAID_HOURS} per day, living costs are $4/day, and working many days in a row wears you out. Pack pulls, deals and grading are where real money comes from.</p>
      <div className="stats small"><Stat label="Paid hours left today" value={`${Math.max(0, left)} / ${MAX_PAID_HOURS}`} /><Stat label="Work streak" value={`${s.work.streak} day${s.work.streak === 1 ? "" : "s"}`} sub={streakFactor(s) < 1 ? `Exhausted: pay ×${streakFactor(s).toFixed(2)}` : "Rest day resets"} /><Stat label="Shifts worked" value={s.stats.shiftsWorked} /><Stat label="Earned from work" value={usd(s.stats.earnedWork)} /></div>
      <div className="row"><span>Shift length</span>{[1, 2, 3, 4, 5].map((h) => <button key={h} className={"chip" + (hours === h ? " on" : "")} onClick={() => setHours(h)}>{h}h</button>)}</div>
      <div className="jobs">{JOBS.map((j) => { const ok = unlocked(s, j); const rate = hourlyBase(s, j); return (
        <div className={"job" + (ok ? "" : " locked")} key={j.id}>
          <h3>{j.name}</h3><p>{j.blurb}</p>
          <div className="kv"><span>Base wage</span><b>{usd(rate)}/hr{j.id === "delivery" ? " (varies)" : ""}</b><span>Taxes</span><b>{Math.round(j.tax * 100)}%</b>{j.cost > 0 && <><span>Expenses</span><b>{usd(j.cost)}/hr</b></>}<span>Experience level</span><b>{level(s, j.id)}</b>
            <span>Est. take-home ({hours}h)</span><b>{usd(Math.round(rate * hours * streakFactor(s) * (1 - j.tax)) - j.cost * hours)}</b></div>
          {ok ? <Btn disabled={!!busy || left < 1} onClick={() => go(j.id)}>{busy === j.id ? "Working…" : `Work a ${Math.min(hours, Math.max(1, left))}h shift`}</Btn> : <div className="muted">Unlocks after {j.minShifts} shifts</div>}
          {busy === j.id && <div className="bar"><div className="fill" style={{ animation: "fillbar .9s linear forwards" }} /></div>}
        </div>); })}</div>
      {last && <div className="chat">{last}</div>}
      <div className="row" style={{ marginTop: 16 }}><Btn kind="blue" onClick={() => run((d) => endDay(d, cat))}>Rest until tomorrow</Btn><span className="muted">Resting keeps your streak at zero and lets prices, listings and gradings move forward.</span></div>
    </div>
  );
}
