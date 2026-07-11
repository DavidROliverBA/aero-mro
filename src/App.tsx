import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { hasApiKey, setApiKey } from "./lib/ai";
import Login from "./views/Login";
import type {
  AdCompliance,
  Aircraft,
  AirworthinessDirective,
  Audit,
  AuditFinding,
  Defect,
  Engineer,
  Flight,
  LlpComponent,
  MpCompliance,
  MpTask,
  Part,
  TaskCard,
  Tool,
  WorkOrder,
} from "./lib/types";
import { daysUntil, mpDue, toolCheck } from "./lib/compliance";
import Dashboard from "./views/Dashboard";
import Fleet from "./views/Fleet";
import TechLog from "./views/TechLog";
import Defects from "./views/Defects";
import WorkOrders from "./views/WorkOrders";
import Planning from "./views/Planning";
import Parts from "./views/Parts";
import Tooling from "./views/Tooling";
import Directives from "./views/Directives";
import Reliability from "./views/Reliability";
import Quality from "./views/Quality";
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
  flights: Flight[];
  tools: Tool[];
  mpTasks: MpTask[];
  mpCompliance: MpCompliance[];
  llps: LlpComponent[];
  audits: Audit[];
  auditFindings: AuditFinding[];
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
  flights: [],
  tools: [],
  mpTasks: [],
  mpCompliance: [],
  llps: [],
  audits: [],
  auditFindings: [],
};

export type Tab =
  | "dashboard"
  | "fleet"
  | "techlog"
  | "defects"
  | "workorders"
  | "planning"
  | "parts"
  | "tooling"
  | "directives"
  | "reliability"
  | "quality"
  | "engineers"
  | "assistant";

interface NavItem {
  id: Tab;
  label: string;
  icon: string;
  badge?: number;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [store, setStore] = useState<Store>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keySet, setKeySet] = useState(hasApiKey());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all([
        supabase.from("aircraft").select("*").order("registration"),
        supabase.from("engineers").select("*").order("full_name"),
        supabase.from("defects").select("*").order("raised_at", { ascending: false }),
        supabase.from("parts").select("*").order("part_number"),
        supabase.from("work_orders").select("*").order("opened_at", { ascending: false }),
        supabase.from("task_cards").select("*").order("sequence"),
        supabase.from("airworthiness_directives").select("*").order("effective_date"),
        supabase.from("ad_compliance").select("*"),
        supabase.from("flights").select("*").order("flight_date", { ascending: false }),
        supabase.from("tools").select("*").order("tool_no"),
        supabase.from("mp_tasks").select("*").order("task_code"),
        supabase.from("mp_compliance").select("*"),
        supabase.from("llp_components").select("*").order("part_number"),
        supabase.from("audits").select("*").order("audit_date", { ascending: false }),
        supabase.from("audit_findings").select("*"),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      const [
        aircraft, engineers, defects, parts, workOrders, taskCards, directives, adCompliance,
        flights, tools, mpTasks, mpCompliance, llps, audits, auditFindings,
      ] = results;
      setStore({
        aircraft: aircraft.data ?? [],
        engineers: engineers.data ?? [],
        defects: defects.data ?? [],
        parts: parts.data ?? [],
        workOrders: workOrders.data ?? [],
        taskCards: taskCards.data ?? [],
        directives: directives.data ?? [],
        adCompliance: adCompliance.data ?? [],
        flights: flights.data ?? [],
        tools: tools.data ?? [],
        mpTasks: mpTasks.data ?? [],
        mpCompliance: mpCompliance.data ?? [],
        llps: llps.data ?? [],
        audits: audits.data ?? [],
        auditFindings: auditFindings.data ?? [],
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

  // Badge counts
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
  const overdueMp = useMemo(
    () =>
      store.mpCompliance.filter((c) => {
        const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
        const ac = store.aircraft.find((a) => a.id === c.aircraft_id);
        return task && ac && mpDue(task, c, ac).tone === "danger";
      }).length,
    [store],
  );
  const toolIssues = store.tools.filter((t) => toolCheck(t).tone === "danger").length;
  const openFindings = store.auditFindings.filter((f) => f.status === "open").length;

  const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
      label: "Operations",
      items: [
        { id: "dashboard", label: "Dashboard", icon: "▤" },
        { id: "fleet", label: "Fleet", icon: "✈", badge: aogCount || undefined },
        { id: "techlog", label: "Tech Log", icon: "🛫" },
        { id: "defects", label: "Defects", icon: "⚠", badge: openDefects || undefined },
      ],
    },
    {
      label: "Maintenance",
      items: [
        { id: "workorders", label: "Work Orders", icon: "🔧" },
        { id: "planning", label: "Planning & LLP", icon: "📅", badge: overdueMp || undefined },
        { id: "directives", label: "AD / SB", icon: "📋", badge: overdueAd || undefined },
      ],
    },
    {
      label: "Resources",
      items: [
        { id: "parts", label: "Parts & Stores", icon: "⚙" },
        { id: "tooling", label: "Tooling", icon: "🧰", badge: toolIssues || undefined },
        { id: "engineers", label: "Certifying Staff", icon: "🧑‍🔧" },
      ],
    },
    {
      label: "Compliance",
      items: [
        { id: "reliability", label: "Reliability", icon: "📈" },
        { id: "quality", label: "Quality & Audit", icon: "🛡", badge: openFindings || undefined },
      ],
    },
    {
      label: "AI",
      items: [{ id: "assistant", label: "Assistant", icon: "✨" }],
    },
  ];
  const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
  const PRIMARY: Tab[] = ["dashboard", "techlog", "defects", "workorders"];
  const primaryItems = PRIMARY.map((id) => ALL_ITEMS.find((n) => n.id === id)!);
  const moreBadge = ALL_ITEMS.filter((n) => !PRIMARY.includes(n.id))
    .reduce((s, n) => s + (n.badge ?? 0), 0);

  function handleKey() {
    const k = prompt("Paste a Claude API key (sk-ant-…). Held in memory only, never stored.");
    if (k) {
      setApiKey(k);
      setKeySet(hasApiKey());
    }
  }

  function go(t: Tab) {
    setTab(t);
    setMoreOpen(false);
  }

  if (!authReady) {
    return (
      <div className="app">
        <main className="main">
          <p className="spinner" role="status">Checking sign-in…</p>
        </main>
      </div>
    );
  }
  if (!session) return <Login />;

  const account = session.user.user_metadata?.user_name ?? session.user.email ?? "signed in";

  const view = (
    <>
      {tab === "dashboard" && <Dashboard store={store} setTab={go} />}
      {tab === "fleet" && <Fleet store={store} />}
      {tab === "techlog" && <TechLog store={store} reload={reload} />}
      {tab === "defects" && <Defects store={store} reload={reload} keySet={keySet} onNeedKey={handleKey} />}
      {tab === "workorders" && <WorkOrders store={store} reload={reload} keySet={keySet} onNeedKey={handleKey} />}
      {tab === "planning" && <Planning store={store} />}
      {tab === "parts" && <Parts store={store} />}
      {tab === "tooling" && <Tooling store={store} reload={reload} />}
      {tab === "directives" && <Directives store={store} />}
      {tab === "reliability" && <Reliability store={store} />}
      {tab === "quality" && <Quality store={store} reload={reload} />}
      {tab === "engineers" && <Engineers store={store} />}
      {tab === "assistant" && (
        <Assistant store={store} reload={reload} keySet={keySet} onNeedKey={handleKey} setTab={go} account={account} />
      )}
    </>
  );

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">
          AeroMRO
          <small>Part-145 / CAMO · UK CAA + EASA</small>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {NAV_GROUPS.map((g) => (
            <div className="nav-group" key={g.label}>
              <div className="nav-group-label">{g.label}</div>
              {g.items.map((n) => (
                <button
                  key={n.id}
                  className={tab === n.id ? "active" : ""}
                  aria-current={tab === n.id ? "page" : undefined}
                  onClick={() => go(n.id)}
                >
                  <span aria-hidden>{n.icon}</span>
                  {n.label}
                  {n.badge ? <span className="badge" aria-label={`${n.badge} items need attention`}>{n.badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn ghost" style={{ width: "100%" }} onClick={handleKey}>
            {keySet ? "✓ AI key set" : "Set Claude API key"}
          </button>
          <div className="muted" style={{ fontSize: 11, margin: "14px 0 6px", textAlign: "center" }}>
            {account}
          </div>
          <button className="btn ghost" style={{ width: "100%" }} onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="mobile-header">
        <div className="brand">AeroMRO</div>
        <button className="btn ghost" onClick={() => go("assistant")} aria-label="Open AI assistant">
          ✨ Ask AI
        </button>
      </header>

      <main className="main" id="main">
        {error && (
          <div className="banner danger" role="alert">
            Data error: {error} — check your Supabase URL/key in <code>.env.local</code> and that migrations have been applied.
          </div>
        )}
        {loading ? <p className="spinner" role="status">Loading fleet data…</p> : view}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="tabbar" aria-label="Primary">
        {primaryItems.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "active" : ""}
            aria-current={tab === n.id ? "page" : undefined}
            onClick={() => go(n.id)}
          >
            <span className="t-icon" aria-hidden>{n.icon}</span>
            {n.label}
            {n.badge ? <span className="badge">{n.badge}</span> : null}
          </button>
        ))}
        <button
          className={!PRIMARY.includes(tab) ? "active" : ""}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="t-icon" aria-hidden>☰</span>
          More
          {moreBadge ? <span className="badge">{moreBadge}</span> : null}
        </button>
      </nav>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="sheet" role="dialog" aria-label="All sections">
            {NAV_GROUPS.map((g) => (
              <div className="nav-group nav" key={g.label}>
                <div className="nav-group-label">{g.label}</div>
                {g.items.map((n) => (
                  <button key={n.id} className={tab === n.id ? "active" : ""} onClick={() => go(n.id)}>
                    <span aria-hidden>{n.icon}</span>
                    {n.label}
                    {n.badge ? <span className="badge">{n.badge}</span> : null}
                  </button>
                ))}
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={handleKey}>
                {keySet ? "✓ AI key set" : "Set Claude API key"}
              </button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
