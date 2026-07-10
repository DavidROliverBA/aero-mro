import type { Store } from "../App";
import { statusPill, Pill } from "../components/ui";
import { daysUntil } from "../lib/compliance";

export default function Fleet({ store }: { store: Store }) {
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
              <th>Hours</th>
              <th>Cycles</th>
              <th>Status</th>
              <th>Next check</th>
              <th>Open defects</th>
            </tr>
          </thead>
          <tbody>
            {store.aircraft.map((a) => {
              const defects = store.defects.filter((d) => d.aircraft_id === a.id && d.status !== "closed");
              const due = daysUntil(a.next_check_due);
              return (
                <tr key={a.id}>
                  <td><strong>{a.registration}</strong></td>
                  <td>{a.type_designator}</td>
                  <td className="muted">{a.msn}</td>
                  <td>{a.base}</td>
                  <td>{a.total_hours.toLocaleString()}</td>
                  <td>{a.total_cycles.toLocaleString()}</td>
                  <td>{statusPill(a.status)}</td>
                  <td>
                    {a.next_check_type}{" "}
                    {due !== null && (
                      <Pill tone={due < 0 ? "danger" : due <= 14 ? "warn" : "muted"}>
                        {due < 0 ? `${Math.abs(due)}d overdue` : `${due}d`}
                      </Pill>
                    )}
                  </td>
                  <td>
                    {defects.length ? <Pill tone="warn">{defects.length}</Pill> : <span className="muted">0</span>}
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
