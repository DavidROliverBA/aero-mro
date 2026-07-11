import type { Store, Tab } from "../App";
import { EntityLink, Pill, StatCard, LifeBar } from "../components/ui";
import { mpDue, llpStatus, type DueItem, type Tone } from "../lib/compliance";

const TONE_ORDER: Record<Tone, number> = { danger: 0, warn: 1, ok: 2 };

const MP_STATUS_LABEL: Record<Tone, string> = {
  danger: "overdue",
  warn: "due soon",
  ok: "ok",
};

const LLP_STATUS_LABEL: Record<Tone, string> = {
  danger: "retire soon",
  warn: "monitor",
  ok: "ok",
};

function intervalLabel(task: DueItem["task"]): string {
  const parts: string[] = [];
  if (task.interval_fh !== null) parts.push(`${Number(task.interval_fh).toLocaleString("en-GB")} FH`);
  if (task.interval_fc !== null) parts.push(`${task.interval_fc.toLocaleString("en-GB")} FC`);
  if (task.interval_days !== null) parts.push(`${task.interval_days.toLocaleString("en-GB")} d`);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

export default function Planning({
  store,
  go,
}: {
  store: Store;
  go: (t: Tab, focusId?: string) => void;
}) {
  const dueItems: DueItem[] = store.mpCompliance
    .map((c) => {
      const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
      const ac = store.aircraftById.get(c.aircraft_id);
      if (!task || !ac) return null;
      return mpDue(task, c, ac);
    })
    .filter((d): d is DueItem => d !== null)
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.task.task_code.localeCompare(b.task.task_code));

  const overdueCount = dueItems.filter((d) => d.tone === "danger").length;
  const dueSoonCount = dueItems.filter((d) => d.tone === "warn").length;

  const llps = [...store.llps].sort((a, b) => {
    const sa = llpStatus(a);
    const sb = llpStatus(b);
    return TONE_ORDER[sa.tone] - TONE_ORDER[sb.tone] || sb.pctUsed - sa.pctUsed;
  });

  return (
    <>
      <h1>Planning &amp; Life-Limited Parts</h1>
      <p className="subtitle">
        Maintenance programme due list and LLP life-consumed tracking, per aircraft (CAMO.A.315 / M.A.305)
      </p>

      <div className="grid">
        <StatCard label="Overdue" value={overdueCount} tone={overdueCount > 0 ? "danger" : undefined} />
        <StatCard label="Due soon" value={dueSoonCount} tone={dueSoonCount > 0 ? "warn" : undefined} />
        <StatCard label="Tracked items" value={dueItems.length} />
      </div>

      <h2>Maintenance programme — due list</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task code</th>
              <th>Title</th>
              <th>Aircraft</th>
              <th>Interval</th>
              <th>Last done</th>
              <th>Next due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dueItems.map((d) => (
              <tr key={d.compliance.id}>
                <td style={d.tone === "danger" ? { borderLeft: "3px solid var(--danger)" } : undefined}>
                  {d.task.task_code}
                </td>
                <td>{d.task.title}</td>
                <td>
                  <EntityLink onClick={() => go("fleet", d.aircraft.id)} title="View aircraft in Fleet">
                    {d.aircraft.registration}
                  </EntityLink>
                </td>
                <td className="muted">{intervalLabel(d.task)}</td>
                <td className="muted">
                  {d.compliance.last_done_date
                    ? new Date(d.compliance.last_done_date).toLocaleDateString("en-GB")
                    : "—"}
                  {d.compliance.last_done_fh !== null &&
                    ` · ${Number(d.compliance.last_done_fh).toLocaleString("en-GB")} FH`}
                </td>
                <td>
                  {d.limitingLabel}
                  {d.dueDate && (
                    <span className="muted"> ({new Date(d.dueDate).toLocaleDateString("en-GB")})</span>
                  )}
                </td>
                <td>
                  <Pill tone={d.tone}>{MP_STATUS_LABEL[d.tone]}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Life-limited parts (M.A.305)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Aircraft</th>
              <th>Part no</th>
              <th>Serial</th>
              <th>Description</th>
              <th>Position</th>
              <th>Limit</th>
              <th>Accumulated</th>
              <th>Life used</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {llps.map((llp) => {
              const ac = store.aircraftById.get(llp.aircraft_id);
              const status = llpStatus(llp);
              const limitLabel =
                llp.limit_fc !== null
                  ? `${llp.limit_fc.toLocaleString("en-GB")} FC`
                  : llp.limit_fh !== null
                    ? `${Number(llp.limit_fh).toLocaleString("en-GB")} FH`
                    : "—";
              const accLabel =
                llp.limit_fc !== null
                  ? `${llp.accumulated_fc.toLocaleString("en-GB")} FC`
                  : llp.limit_fh !== null
                    ? `${Number(llp.accumulated_fh).toLocaleString("en-GB")} FH`
                    : "—";
              return (
                <tr key={llp.id}>
                  <td>
                    {ac ? (
                      <EntityLink onClick={() => go("fleet", ac.id)} title="View aircraft in Fleet">
                        {ac.registration}
                      </EntityLink>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{llp.part_number}</td>
                  <td className="muted">{llp.serial_number}</td>
                  <td>{llp.description}</td>
                  <td className="muted">{llp.position ?? "—"}</td>
                  <td className="muted">{limitLabel}</td>
                  <td className="muted">{accLabel}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <LifeBar pct={status.pctUsed} tone={status.tone} />
                      <span className="muted" style={{ fontSize: 11 }}>
                        {status.pctUsed.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <Pill tone={status.tone}>{LLP_STATUS_LABEL[status.tone]}</Pill>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {status.remainingLabel}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Due-list computed across flight hours, cycles and calendar — whichever limit comes first (CAMO.A.315).
      </p>
    </>
  );
}
