import { useState } from "react";
import type { Store, Tab } from "../App";
import { dailyBrief } from "../lib/ai";
import { buildSnapshot } from "../lib/actions";
import { EmptyState, Pill, StatCard, statusPill } from "../components/ui";
import {
  adAlert,
  daysUntil,
  llpStatus,
  melClock,
  mpDue,
  shelfLife,
  toolCheck,
  type Tone,
} from "../lib/compliance";

interface AttentionItem {
  id: string;
  tone: Tone;
  pillLabel: string;
  description: string;
  target: Tab;
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warn: 1, ok: 2 };

export default function Dashboard({
  store,
  setTab,
  keySet,
  onNeedKey,
}: {
  store: Store;
  setTab: (t: Tab, focusId?: string) => void;
  keySet: boolean;
  onNeedKey: () => void;
}) {
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);

  async function runBrief() {
    if (!keySet) return onNeedKey();
    setBriefing(true);
    try {
      setBrief(await dailyBrief(buildSnapshot(store)));
    } catch (e) {
      setBrief(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBriefing(false);
    }
  }
  const aog = store.aircraft.filter((a) => a.status === "aog");
  const openDefects = store.defects.filter((d) => d.status !== "closed");
  const melBreached = store.defects.filter((d) => {
    const c = melClock(d);
    return c?.breached;
  });
  const openWo = store.workOrders.filter((w) => w.status !== "closed");
  const expiredLicences = store.engineers.filter((e) => {
    const d = daysUntil(e.licence_expiry);
    return d !== null && d < 0;
  });

  const openSectors = store.flights.filter((f) => f.status === "open");

  const overdueChecks = store.mpCompliance.filter((c) => {
    const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
    const ac = store.aircraftById.get(c.aircraft_id);
    return task && ac && mpDue(task, c, ac).tone === "danger";
  });

  const toolIssues = store.tools.filter((t) => toolCheck(t).tone === "danger");
  const openFindings = store.auditFindings.filter((f) => f.status === "open");

  const adAlerts = store.adCompliance
    .map((c) => {
      const ad = store.directives.find((d) => d.id === c.ad_id);
      return ad ? adAlert(ad, c) : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.tone !== "ok")
    .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

  // ---------------------------------------------------------------------
  // "Needs attention" — a single cross-module worklist of anything that
  // isn't compliant right now, each item deep-linking to the owning view.
  // ---------------------------------------------------------------------
  const attention: AttentionItem[] = [];

  for (const a of aog) {
    attention.push({
      id: `aog-${a.id}`,
      tone: "danger",
      pillLabel: "AOG",
      description: `${a.registration} (${a.type_designator}) grounded at ${a.base}`,
      target: "fleet",
    });
  }

  for (const d of store.defects) {
    const c = melClock(d);
    if (c && (c.tone === "danger" || c.tone === "warn")) {
      const ac = store.aircraftById.get(d.aircraft_id);
      attention.push({
        id: `mel-${d.id}`,
        tone: c.tone,
        pillLabel: c.breached ? "MEL breached" : "MEL due soon",
        description: `${ac?.registration ?? "?"} — ${d.description} (${c.label})`,
        target: "defects",
      });
    }
  }

  for (const al of adAlerts) {
    if (al.tone !== "danger") continue;
    const ac = store.aircraftById.get(al.compliance.aircraft_id);
    attention.push({
      id: `ad-${al.compliance.id}`,
      tone: "danger",
      pillLabel: "AD overdue",
      description: `${al.ad.ad_number} — ${ac?.registration ?? "?"} (${al.ad.subject})`,
      target: "directives",
    });
  }

  for (const c of overdueChecks) {
    const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
    const ac = store.aircraftById.get(c.aircraft_id);
    if (!task || !ac) continue;
    attention.push({
      id: `mp-${c.id}`,
      tone: "danger",
      pillLabel: "Check overdue",
      description: `${task.title} — ${ac.registration}`,
      target: "planning",
    });
  }

  for (const llp of store.llps) {
    const s = llpStatus(llp);
    if (s.tone !== "danger") continue;
    const ac = store.aircraftById.get(llp.aircraft_id);
    attention.push({
      id: `llp-${llp.id}`,
      tone: "danger",
      pillLabel: "LLP critical",
      description: `${llp.description} ${llp.serial_number} — ${ac?.registration ?? "?"} (${s.remainingLabel})`,
      target: "planning",
    });
  }

  for (const p of store.parts) {
    const s = shelfLife(p.shelf_expiry);
    if (!s || s.tone !== "danger") continue;
    attention.push({
      id: `part-${p.id}`,
      tone: "danger",
      pillLabel: "Shelf-life expired",
      description: `${p.part_number}${p.serial_number ? ` ${p.serial_number}` : ""} — ${p.description}`,
      target: "parts",
    });
  }

  for (const t of toolIssues) {
    const c = toolCheck(t);
    attention.push({
      id: `tool-${t.id}`,
      tone: "danger",
      pillLabel: "Tooling",
      description: `${t.tool_no} — ${c.label}`,
      target: "tooling",
    });
  }

  for (const f of store.auditFindings) {
    if (f.status !== "open" || !f.due_date) continue;
    const d = daysUntil(f.due_date);
    if (d === null || d >= 0) continue;
    const audit = store.audits.find((a) => a.id === f.audit_id);
    attention.push({
      id: `finding-${f.id}`,
      tone: "danger",
      pillLabel: "Finding overdue",
      description: `${audit?.audit_ref ?? "Audit"} — ${f.description}`,
      target: "quality",
    });
  }

  attention.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Fleet Airworthiness Dashboard</h1>
          <p className="subtitle">
            Albion Atlantic Airways · continuing airworthiness status at a glance
          </p>
        </div>
        <button className="btn ghost" onClick={() => void runBrief()} disabled={briefing}>
          {briefing ? "Briefing…" : "✨ Daily briefing"}
        </button>
      </div>

      {brief && (
        <div className="ai-box" style={{ marginTop: 0, marginBottom: 18 }}>
          <span className="ai-tag">✨ Duty manager briefing — {new Date().toLocaleDateString("en-GB")}</span>
          <div className="ai-out">{brief}</div>
        </div>
      )}

      <div className="grid">
        <StatCard label="Aircraft in fleet" value={store.aircraft.length} onClick={() => setTab("fleet")} />
        <StatCard
          label="AOG"
          value={aog.length}
          tone={aog.length ? "danger" : "ok"}
          onClick={() => setTab("fleet", aog[0]?.id)}
        />
        <StatCard
          label="Open defects"
          value={openDefects.length}
          tone={openDefects.length ? "warn" : "ok"}
          onClick={() => setTab("defects")}
        />
        <StatCard label="Open work orders" value={openWo.length} onClick={() => setTab("workorders", openWo[0]?.id)} />
        <StatCard label="Open tech-log sectors" value={openSectors.length} onClick={() => setTab("techlog")} />
        <StatCard
          label="Overdue programme checks"
          value={overdueChecks.length}
          tone={overdueChecks.length ? "danger" : "ok"}
          onClick={() => setTab("planning")}
        />
        <StatCard
          label="Tooling issues"
          value={toolIssues.length}
          tone={toolIssues.length ? "danger" : "ok"}
          onClick={() => setTab("tooling")}
        />
        <StatCard
          label="Open audit findings"
          value={openFindings.length}
          tone={openFindings.length ? "warn" : "ok"}
          onClick={() => setTab("quality")}
        />
        <StatCard
          label="MEL clocks breached"
          value={melBreached.length}
          tone={melBreached.length ? "danger" : "ok"}
          onClick={() => setTab("defects", melBreached[0]?.id)}
        />
        <StatCard
          label="Expired licences"
          value={expiredLicences.length}
          tone={expiredLicences.length ? "danger" : "ok"}
          onClick={() => setTab("engineers")}
        />
      </div>

      <h2>Needs attention</h2>
      {attention.length === 0 ? (
        <EmptyState>All clear — nothing needs attention today ✈</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attention.map((item) => (
            <div
              key={item.id}
              className="card clickable"
              role="button"
              tabIndex={0}
              onClick={() => setTab(item.target)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setTab(item.target);
              }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{item.description}</span>
                <Pill tone={item.tone}>{item.pillLabel}</Pill>
              </div>
            </div>
          ))}
        </div>
      )}

      {aog.length > 0 && (
        <>
          <h2>Aircraft on ground</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Type</th>
                  <th>Base</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {aog.map((a) => {
                  const d = store.defects.find(
                    (x) => x.aircraft_id === a.id && x.severity === "critical" && x.status === "open",
                  );
                  return (
                    <tr key={a.id} onClick={() => setTab("fleet")} style={{ cursor: "pointer" }}>
                      <td><strong>{a.registration}</strong></td>
                      <td>{a.type_designator}</td>
                      <td>{a.base}</td>
                      <td>{statusPill(a.status)}</td>
                      <td className="muted">{d?.description ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Compliance alerts</h2>
      {adAlerts.length === 0 && melBreached.length === 0 ? (
        <p className="muted">No overdue ADs or breached MEL clocks. Fleet compliant.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Aircraft</th>
                <th>Detail</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {adAlerts.map((al) => {
                const ac = store.aircraftById.get(al.compliance.aircraft_id);
                return (
                  <tr key={al.compliance.id} onClick={() => setTab("directives")} style={{ cursor: "pointer" }}>
                    <td>{al.ad.ad_number}</td>
                    <td>{ac?.registration}</td>
                    <td className="muted">{al.ad.subject}</td>
                    <td>
                      <Pill tone={al.tone}>
                        {al.daysRemaining === null
                          ? "no deadline"
                          : al.daysRemaining < 0
                            ? `${Math.abs(al.daysRemaining)}d overdue`
                            : `${al.daysRemaining}d`}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
              {melBreached.map((d) => {
                const ac = store.aircraftById.get(d.aircraft_id);
                const c = melClock(d)!;
                return (
                  <tr key={d.id} onClick={() => setTab("defects")} style={{ cursor: "pointer" }}>
                    <td>{c.label}</td>
                    <td>{ac?.registration}</td>
                    <td className="muted">{d.description}</td>
                    <td>
                      <Pill tone="danger">
                        {c.daysRemaining === null ? "no deadline" : `${Math.abs(c.daysRemaining)}d overdue`}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
