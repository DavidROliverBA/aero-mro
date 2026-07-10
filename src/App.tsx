import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { hasApiKey, setApiKey } from "./lib/ai";
import Login from "./views/Login";
import type {
  AdCompliance,
  Aircraft,
  AirworthinessDirective,
  Defect,
  Engineer,
  Part,
  TaskCard,
  WorkOrder,
} from "./lib/types";
import { daysUntil } from "./lib/compliance";
import Dashboard from "./views/Dashboard";
import Fleet from "./views/Fleet";
import Defects from "./views/Defects";
import WorkOrders from "./views/WorkOrders";
import Parts from "./views/Parts";
import Directives from "./views/Directives";
import Engineers from "./views/Engineers";
import Assistant from "./views/Assistant";

export interface Store {
  aircraft: Aircraft[];
  engineers: Engineer[];
  defects: Defect[];
  parts: Part[];
  workOrders: WorkOrder[];
  taskCards: TaskCard[];
  directives: AirworthinessDirective[];
  adCompliance: AdCompliance[];
}

const EMPTY: Store = {
  aircraft: [],
  engineers: [],
  defects: [],
  parts: [],
  workOrders: [],
  taskCards: [],
  directives: [],
  adCompliance: [],
};

type Tab =
  | "dashboard"
  | "fleet"
  | "defects"
  | "workorders"
  | "parts"
  | "directives"
  | "engineers"
  | "assistant";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [store, setStore] = useState<Store>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keySet, setKeySet] = useState(hasApiKey());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [aircraft, engineers, defects, parts, workOrders, taskCards, directives, adCompliance] =
        await Promise.all([
          supabase.from("aircraft").select("*").order("registration"),
          supabase.from("engineers").select("*").order("full_name"),
          supabase.from("defects").select("*").order("raised_at", { ascending: false }),
          supabase.from("parts").select("*").order("part_number"),
          supabase.from("work_orders").select("*").order("opened_at", { ascending: false }),
          supabase.from("task_cards").select("*").order("sequence"),
          supabase.from("airworthiness_directives").select("*").order("effective_date"),
          supabase.from("ad_compliance").select("*"),
        ]);
      const first = [aircraft, engineers, defects, parts, workOrders, taskCards, directives, adCompliance].find(
        (r) => r.error,
      );
      if (first?.error) throw first.error;
      setStore({
        aircraft: aircraft.data ?? [],
        engineers: engineers.data ?? [],
        defects: defects.data ?? [],
        parts: parts.data ?? [],
        workOrders: workOrders.data ?? [],
        taskCards: taskCards.data ?? [],
        directives: directives.data ?? [],
        adCompliance: adCompliance.data ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Track the auth session (Supabase handles the OAuth code exchange on load).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load fleet data only once signed in (RLS restricts reads to authenticated users).
  useEffect(() => {
    if (session) void reload();
    else setLoading(false);
  }, [session]);

  // Badge counts for the sidebar
  const aogCount = store.aircraft.filter((a) => a.status === "aog").length;
  const openDefects = store.defects.filter((d) => d.status !== "closed").length;
  const overdueAd = useMemo(
    () =>
      store.adCompliance.filter((c) => {
        if (c.status === "complied" || c.status === "not_applicable") return false;
        const ad = store.directives.find((d) => d.id === c.ad_id);
        const due = c.status === "repetitive_active" ? c.next_due : ad?.compliance_by ?? null;
        const d = daysUntil(due);
        return d !== null && d < 0;
      }).length,
    [store],
  );

  const NAV: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: "▤" },
    { id: "fleet", label: "Fleet", icon: "✈", badge: aogCount || undefined },
    { id: "defects", label: "Defects", icon: "⚠", badge: openDefects || undefined },
    { id: "workorders", label: "Work Orders", icon: "🔧" },
    { id: "parts", label: "Parts & Stores", icon: "⚙" },
    { id: "directives", label: "AD / SB", icon: "📋", badge: overdueAd || undefined },
    { id: "engineers", label: "Certifying Staff", icon: "🧑‍🔧" },
    { id: "assistant", label: "AI Assistant", icon: "✨" },
  ];

  function handleKey() {
    const k = prompt("Paste a Claude API key (sk-ant-…). Held in memory only, never stored.");
    if (k) {
      setApiKey(k);
      setKeySet(hasApiKey());
    }
  }

  if (!authReady) {
    return (
      <div className="app">
        <main className="main">
          <p className="spinner">Checking sign-in…</p>
        </main>
      </div>
    );
  }
  if (!session) return <Login />;

  const account = session.user.user_metadata?.user_name ?? session.user.email ?? "signed in";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          AeroMRO
          <small>Part-145 / CAMO · UK CAA + EASA</small>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => setTab(n.id)}
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
              {n.badge ? <span className="badge">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 20, padding: "0 8px" }}>
          <button className="btn ghost" style={{ width: "100%" }} onClick={handleKey}>
            {keySet ? "✓ AI key set" : "Set Claude API key"}
          </button>
          <div className="muted" style={{ fontSize: 11, margin: "14px 0 6px", textAlign: "center" }}>
            {account}
          </div>
          <button
            className="btn ghost"
            style={{ width: "100%" }}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        {error && (
          <div className="banner" style={{ borderColor: "rgba(248,81,73,0.3)", color: "var(--danger)", background: "rgba(248,81,73,0.1)" }}>
            Data error: {error} — check your Supabase URL/key in <code>.env.local</code> and that schema.sql + seed.sql have been run.
          </div>
        )}
        {loading ? (
          <p className="spinner">Loading fleet data…</p>
        ) : (
          <>
            {tab === "dashboard" && <Dashboard store={store} setTab={setTab} />}
            {tab === "fleet" && <Fleet store={store} />}
            {tab === "defects" && <Defects store={store} reload={reload} keySet={keySet} onNeedKey={handleKey} />}
            {tab === "workorders" && <WorkOrders store={store} reload={reload} keySet={keySet} onNeedKey={handleKey} />}
            {tab === "parts" && <Parts store={store} />}
            {tab === "directives" && <Directives store={store} />}
            {tab === "engineers" && <Engineers store={store} />}
            {tab === "assistant" && <Assistant store={store} keySet={keySet} onNeedKey={handleKey} />}
          </>
        )}
      </main>
    </div>
  );
}
