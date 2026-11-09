import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { loadCatalog, Catalog } from "./game/catalog";
import { initStore, run, getState } from "./store";
import { Pokeball } from "./ui/common";
import { ensureSoundtrack } from "./audio";
import { runAutoRefresh } from "./refresh";

function Boot() {
  const [cat, setCat] = React.useState<Catalog | null>(null);
  const [prog, setProg] = React.useState("Loading card database…");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    (async () => {
      try {
        const c = await loadCatalog("data", (n, t) => setProg(`Loading card database… ${n}/${t} sets`));
        const s = await initStore(c);
        setCat(c);
        void ensureSoundtrack(s.settings.offline).catch(() => {});
        void runAutoRefresh(c);
      } catch (e) { setErr(String(e)); }
    })();
  }, []);
  if (err) return <div className="boot"><h2>Could not start</h2><p>{err}</p></div>;
  if (!cat) return <div className="boot"><Pokeball size={90} spin /><h2>Pokémon TCG Collector &amp; Card Shop Simulator</h2><p>{prog}</p></div>;
  return <App cat={cat} />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Boot />);
