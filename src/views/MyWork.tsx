import { useMemo, useState } from "react";
import type { Store } from "../App";
import { signCard } from "../lib/actions";
import {
  cardGate,
  checkCertifyingPrivilege,
  daysUntil,
  localIsoOffset,
} from "../lib/compliance";
import type { DutyShift, TaskCard } from "../lib/types";
import { Pill, StatCard, EmptyState } from "../components/ui";

const SHIFT_TONE: Record<DutyShift, "ok" | "warn" | "danger" | "muted" | "info"> = {
  early: "ok", late: "info", night: "info", off: "muted", leave: "warn", training: "info",
};

const PERSONA_KEY = "aeromro.engineerId";

export default function MyWork({
  store,
  reload,
}: {
  store: Store;
  reload: () => Promise<void>;
}) {
  const [meId, setMeId] = useState<string>(() => localStorage.getItem(PERSONA_KEY) ?? "");
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = store.engineersById.get(meId);

  function choose(id: string) {
    setMeId(id);
    localStorage.setItem(PERSONA_KEY, id);
  }

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => localIsoOffset(i)), []);
  const myRoster = week.map((d) => store.roster.find((r) => r.engineer_id === meId && r.duty_date === d));

  const woById = (id: string) => store.workOrders.find((w) => w.id === id);
  const acOfWo = (woId: string) => {
    const wo = woById(woId);
    return wo ? store.aircraftById.get(wo.aircraft_id) : undefined;
  };

  // Cards on my plate: assigned to me and not fully signed off.
  const myCards = store.taskCards.filter(
    (t) => t.assigned_engineer === meId && !cardGate(t).done && woById(t.work_order_id)?.status !== "closed",
  );
  // Cards awaiting an independent inspection that I am allowed to give:
  // completed by someone else, and I hold privilege for the aircraft type.
  const inspectable = store.taskCards.filter((t) => {
    if (!me || !t.requires_inspection || !t.completed_by || t.inspected_by) return false;
    if (t.completed_by === meId) return false;
    if (woById(t.work_order_id)?.status === "closed") return false;
    const ac = acOfWo(t.work_order_id);
    return !!ac && checkCertifyingPrivilege(me, ac.type_designator).valid;
  });

  const licenceDays = me ? daysUntil(me.licence_expiry) : null;
  const licenceTone = licenceDays === null ? "muted" : licenceDays < 0 ? "danger" : licenceDays <= 30 ? "danger" : licenceDays <= 90 ? "warn" : "ok";

  async function sign(card: TaskCard, kind: "completion" | "inspection") {
    if (!me) return;
    setBusyCard(card.id);
    setError(null);
    try {
      await signCard(card, me, kind, woById(card.work_order_id)?.wo_number ?? "");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCard(null);
    }
  }

  return (
    <>
      <h1>My Work</h1>
      <p className="subtitle">Your cards, your inspections, your week — sign off without leaving the page</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <label htmlFor="mw-me" style={{ margin: 0 }}>I am</label>
        <select
          id="mw-me"
          value={meId}
          onChange={(e) => choose(e.target.value)}
          style={{ maxWidth: 320 }}
        >
          <option value="">— select yourself —</option>
          {store.engineers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name} · {e.staff_no}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="banner danger" role="alert">{error}</div>}

      {!me ? (
        <EmptyState>Select yourself to see your work. (Demo persona — a real system binds this to your login.)</EmptyState>
      ) : (
        <>
          <div className="grid">
            <StatCard label="My open cards" value={myCards.length} tone={myCards.length ? "warn" : undefined} />
            <StatCard label="Awaiting my inspection" value={inspectable.length} tone={inspectable.length ? "warn" : undefined} />
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="stat-label">Licence {me.part66_licence_no}</div>
                <Pill tone={licenceTone === "muted" ? "muted" : licenceTone}>
                  {licenceDays === null ? "—" : licenceDays < 0 ? `expired ${-licenceDays}d` : `${licenceDays}d left`}
                </Pill>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {me.licence_categories.join(", ")} · {me.type_ratings.join(", ")} ·{" "}
                {me.company_auth ? "company authorised" : "NO company authorisation"}
              </div>
            </div>
          </div>

          <h2>My week</h2>
          <div className="row">
            {week.map((d, i) => {
              const entry = myRoster[i];
              return (
                <div className="card" key={d} style={{ padding: "10px 14px", textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {entry ? <Pill tone={SHIFT_TONE[entry.shift]}>{entry.shift}</Pill> : <span className="muted">—</span>}
                  </div>
                  {entry && <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>{entry.base}</div>}
                </div>
              );
            })}
          </div>

          <h2>My task cards</h2>
          {myCards.length === 0 ? (
            <EmptyState>Nothing on your plate ✔</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>WO</th><th>Aircraft</th><th>Card</th><th>Est h</th><th>State</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {myCards.map((t) => {
                    const wo = woById(t.work_order_id);
                    const ac = acOfWo(t.work_order_id);
                    const gate = cardGate(t);
                    return (
                      <tr key={t.id}>
                        <td>{wo?.wo_number}</td>
                        <td>{ac?.registration}</td>
                        <td>
                          {t.description}
                          {t.requires_inspection && <>{" "}<Pill tone="info">insp req'd</Pill></>}
                        </td>
                        <td>{t.est_hours}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{gate.reason}</td>
                        <td>
                          {!t.completed_by ? (
                            <button
                              className="btn small"
                              disabled={busyCard === t.id}
                              onClick={() => void sign(t, "completion")}
                            >
                              {busyCard === t.id ? "Signing…" : "Sign task"}
                            </button>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>awaiting inspection</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2>Awaiting my independent inspection (145.A.48)</h2>
          {inspectable.length === 0 ? (
            <EmptyState>No inspections waiting on you</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>WO</th><th>Aircraft</th><th>Card</th><th>Performed by</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {inspectable.map((t) => {
                    const wo = woById(t.work_order_id);
                    const ac = acOfWo(t.work_order_id);
                    const performer = t.completed_by ? store.engineersById.get(t.completed_by) : undefined;
                    return (
                      <tr key={t.id}>
                        <td>{wo?.wo_number}</td>
                        <td>{ac?.registration}</td>
                        <td>{t.description}</td>
                        <td className="muted">{performer?.full_name}</td>
                        <td>
                          <button
                            className="btn small"
                            disabled={busyCard === t.id}
                            onClick={() => void sign(t, "inspection")}
                          >
                            {busyCard === t.id ? "Signing…" : "Sign inspection"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
