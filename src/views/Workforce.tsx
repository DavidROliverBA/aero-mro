import { useMemo, useState } from "react";
import type { Store } from "../App";
import { supabase } from "../lib/supabase";
import { logAudit } from "../lib/audit";
import {
  baseManHours,
  coverageGaps,
  expiringLicences,
  localIsoOffset,
  SHIFT_PRODUCTIVE_HOURS,
  WORKING_SHIFTS,
} from "../lib/compliance";
import type { DutyShift } from "../lib/types";
import { Pill, StatCard, EmptyState } from "../components/ui";

const SHIFT_TONE: Record<DutyShift, "ok" | "warn" | "danger" | "muted" | "info"> = {
  early: "ok",
  late: "info",
  night: "info",
  off: "muted",
  leave: "warn",
  training: "info",
};

const SHIFTS: DutyShift[] = ["early", "late", "night", "off", "leave", "training"];

const isoDaysFromToday = localIsoOffset;

export default function Workforce({
  store,
  reload,
}: {
  store: Store;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formEngId, setFormEngId] = useState("");
  const [formDate, setFormDate] = useState(isoDaysFromToday(0));
  const [formShift, setFormShift] = useState<DutyShift>("early");
  const [formBase, setFormBase] = useState("LGW");

  const today = isoDaysFromToday(0);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDaysFromToday(i)), []);
  const bases = useMemo(() => [...new Set(store.aircraft.map((a) => a.base))].sort(), [store.aircraft]);

  const gaps = useMemo(
    () => coverageGaps(store.roster, store.engineers, store.aircraft),
    [store],
  );
  const manHours = useMemo(
    () => bases.map((b) => baseManHours(b, store.roster, store.taskCards, store.workOrders, store.aircraft)),
    [bases, store],
  );
  const expiring = useMemo(() => expiringLicences(store.engineers), [store.engineers]);
  const onDutyToday = store.roster.filter(
    (r) => r.duty_date === today && WORKING_SHIFTS.has(r.shift),
  ).length;

  async function amendRoster() {
    if (!formEngId || !formDate) return;
    const eng = store.engineers.find((e) => e.id === formEngId);
    if (!eng) return;
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("roster_entries").upsert(
        { engineer_id: formEngId, duty_date: formDate, shift: formShift, base: formBase },
        { onConflict: "engineer_id,duty_date" },
      );
      if (e1) throw e1;
      await logAudit(
        "roster_entries",
        "Roster amended",
        "Workforce planning",
        `${eng.full_name} (${eng.staff_no}) → ${formShift} at ${formBase} on ${formDate}`,
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Workforce Planning</h1>
      <p className="subtitle">
        Duty roster, 145.A.30 man-hour plan, certifying-coverage gaps and licence-renewal horizon
      </p>

      {error && <div className="banner danger" role="alert">{error}</div>}

      <div className="grid">
        <StatCard label="Certifying staff" value={store.engineers.length} />
        <StatCard label="On duty today" value={onDutyToday} />
        <StatCard
          label="Coverage gaps (7 d)"
          value={gaps.length}
          tone={gaps.length > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Licences expiring ≤ 90 d"
          value={expiring.length}
          tone={expiring.length > 0 ? "warn" : undefined}
        />
      </div>

      <h2>Man-hour plan — next 7 days (145.A.30)</h2>
      <div className="grid">
        {manHours.map((m) => (
          <div className="card" key={m.base}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{m.base}</strong>
              <Pill tone={m.tone}>
                {m.utilisationPct === null ? "no cover" : `${m.utilisationPct.toFixed(0)}% loaded`}
              </Pill>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {m.availableHrs.toFixed(1)} productive hrs rostered · {m.backlogHrs.toFixed(1)} hrs open task-card backlog
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Productive hours assume ~75% of a rostered shift survives handovers, breaks and paperwork
        (early/late {SHIFT_PRODUCTIVE_HOURS.early} h, night {SHIFT_PRODUCTIVE_HOURS.night} h).
      </p>

      <h2>Certifying coverage gaps — next 7 days</h2>
      {gaps.length === 0 ? (
        <EmptyState>Every base has valid certifying cover for its based types all week ✈</EmptyState>
      ) : (
        gaps.map((g, i) => (
          <div className="card" key={i} style={{ borderColor: "var(--danger)", marginBottom: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>
                {new Date(g.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                {" · "}{g.base} · {g.typeDesignator}
              </strong>
              <Pill tone="danger">no certifying cover</Pill>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{g.reason}</div>
          </div>
        ))
      )}

      <h2>Duty roster — next 7 days</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Engineer</th>
              <th>Base</th>
              {week.map((d) => (
                <th key={d}>
                  {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {store.engineers.map((e) => {
              const homeBase = store.roster.find((r) => r.engineer_id === e.id)?.base ?? "—";
              return (
                <tr key={e.id}>
                  <td>
                    <strong>{e.full_name}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {e.licence_categories.join("/")} · {e.type_ratings.join(", ")}
                    </div>
                  </td>
                  <td className="muted">{homeBase}</td>
                  {week.map((d) => {
                    const entry = store.roster.find((r) => r.engineer_id === e.id && r.duty_date === d);
                    return (
                      <td key={d}>
                        {entry ? <Pill tone={SHIFT_TONE[entry.shift]}>{entry.shift}</Pill> : <span className="muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <fieldset style={{ marginTop: 18 }}>
        <legend>Amend roster</legend>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label htmlFor="wf-eng">Engineer</label>
            <select id="wf-eng" value={formEngId} onChange={(e) => setFormEngId(e.target.value)}>
              <option value="">— select engineer —</option>
              {store.engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.staff_no}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="wf-date">Date</label>
            <input id="wf-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="wf-shift">Shift</label>
            <select id="wf-shift" value={formShift} onChange={(e) => setFormShift(e.target.value as DutyShift)}>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label htmlFor="wf-base">Base</label>
            <select id="wf-base" value={formBase} onChange={(e) => setFormBase(e.target.value)}>
              {bases.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={() => void amendRoster()} disabled={saving || !formEngId}>
            {saving ? "Saving…" : "Save duty"}
          </button>
        </div>
      </fieldset>

      <h2>Licence renewals due (90-day horizon)</h2>
      {expiring.length === 0 ? (
        <EmptyState>No licences expiring inside 90 days</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Engineer</th>
                <th>Licence</th>
                <th>Categories</th>
                <th>Expires</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map(({ engineer: e, days }) => (
                <tr key={e.id}>
                  <td><strong>{e.full_name}</strong></td>
                  <td className="muted">{e.part66_licence_no}</td>
                  <td>{e.licence_categories.join(", ")}</td>
                  <td>{new Date(e.licence_expiry + "T00:00:00").toLocaleDateString("en-GB")}</td>
                  <td>
                    <Pill tone={days < 0 ? "danger" : days <= 30 ? "danger" : "warn"}>
                      {days < 0 ? `expired ${-days}d ago` : `${days}d`}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
