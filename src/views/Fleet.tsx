import type { Store, Tab } from "../App";
import { statusPill, Pill, EntityLink } from "../components/ui";
import { mpDue, type DueItem, type Tone } from "../lib/compliance";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TONE_RANK: Record<Tone, number> = { danger: 0, warn: 1, ok: 2 };

export default function Fleet({
  store,
  go,
  focus,
}: {
  store: Store;
  go: (t: Tab, focusId?: string) => void;
  focus: string | null;
}) {
  function sectorsLast7Days(aircraftId: string): number {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return store.flights.filter(
      (f) => f.aircraft_id === aircraftId && new Date(f.flight_date).getTime() >= cutoff,
    ).length;
  }

  function worstDue(aircraftId: string): DueItem | null {
    const items = store.mpCompliance
      .filter((c) => c.aircraft_id === aircraftId)
      .map((c) => {
        const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
        const ac = store.aircraft.find((a) => a.id === aircraftId);
        return task && ac ? mpDue(task, c, ac) : null;
      })
      .filter((x): x is DueItem => x !== null);
    if (items.length === 0) return null;
    items.sort((a, b) => {
      if (TONE_RANK[a.tone] !== TONE_RANK[b.tone]) return TONE_RANK[a.tone] - TONE_RANK[b.tone];
      const marginsA = [a.remainingDays, a.remainingFh, a.remainingFc].filter(
        (v): v is number => v !== null,
      );
      const marginsB = [b.remainingDays, b.remainingFh, b.remainingFc].filter(
        (v): v is number => v !== null,
      );
      const minA = marginsA.length ? Math.min(...marginsA) : Infinity;
      const minB = marginsB.length ? Math.min(...marginsB) : Infinity;
      return minA - minB;
    });
    return items[0];
  }

  return (
    <>
      <h1>Fleet</h1>
      <p className="subtitle">Registered aircraft and next scheduled maintenance check</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Type</th>
              <th>MSN</th>
              <th>Base</th>
              <th>FH</th>
              <th>FC</th>
              <th>Status</th>
              <th>Sectors (7d)</th>
              <th>Next programme due</th>
              <th>Open defects</th>
            </tr>
          </thead>
          <tbody>
            {store.aircraft.map((a) => {
              const defects = store.defects.filter((d) => d.aircraft_id === a.id && d.status !== "closed");
              const due = worstDue(a.id);
              return (
                <tr key={a.id} className={focus === a.id ? "row-focus" : ""}>
                  <td><strong>{a.registration}</strong></td>
                  <td>{a.type_designator}</td>
                  <td className="muted">{a.msn}</td>
                  <td>{a.base}</td>
                  <td>{Number(a.total_hours).toLocaleString("en-GB")}</td>
                  <td>{a.total_cycles.toLocaleString("en-GB")}</td>
                  <td>{statusPill(a.status)}</td>
                  <td>
                    <EntityLink onClick={() => go("techlog", a.id)} title="Open tech log for this aircraft">
                      {sectorsLast7Days(a.id)}
                    </EntityLink>
                  </td>
                  <td>
                    {due ? (
                      <>
                        {due.task.title} <Pill tone={due.tone}>{due.limitingLabel}</Pill>
                      </>
                    ) : a.next_check_type && a.next_check_due ? (
                      // No programme rows tracked yet — fall back to the
                      // aircraft's own next-check fields rather than showing nothing.
                      <span className="muted">
                        {a.next_check_type} · {new Date(a.next_check_due + "T00:00:00").toLocaleDateString("en-GB")}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {defects.length ? (
                      <EntityLink onClick={() => go("defects", defects[0].id)} title="View defects">
                        <Pill tone="warn">{defects.length}</Pill>
                      </EntityLink>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
