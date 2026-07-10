import type { Store } from "../App";
import { StatCard, statusPill, Pill } from "../components/ui";
import { adAlert, daysUntil, melClock } from "../lib/compliance";

export default function Dashboard({
  store,
  setTab,
}: {
  store: Store;
  setTab: (t: any) => void;
}) {
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

  const adAlerts = store.adCompliance
    .map((c) => {
      const ad = store.directives.find((d) => d.id === c.ad_id);
      return ad ? adAlert(ad, c) : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.tone !== "ok")
    .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

  return (
    <>
      <h1>Fleet Airworthiness Dashboard</h1>
      <p className="subtitle">
        Albion Atlantic Airways · continuing airworthiness status at a glance
      </p>

      <div className="grid">
        <StatCard label="Aircraft in fleet" value={store.aircraft.length} />
        <StatCard label="AOG" value={aog.length} tone={aog.length ? "danger" : "ok"} />
        <StatCard label="Open defects" value={openDefects.length} tone={openDefects.length ? "warn" : "ok"} />
        <StatCard label="Open work orders" value={openWo.length} />
        <StatCard
          label="MEL clocks breached"
          value={melBreached.length}
          tone={melBreached.length ? "danger" : "ok"}
        />
        <StatCard
          label="Expired licences"
          value={expiredLicences.length}
          tone={expiredLicences.length ? "danger" : "ok"}
        />
      </div>

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
                const ac = store.aircraft.find((a) => a.id === al.compliance.aircraft_id);
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
                const ac = store.aircraft.find((a) => a.id === d.aircraft_id);
                const c = melClock(d)!;
                return (
                  <tr key={d.id} onClick={() => setTab("defects")} style={{ cursor: "pointer" }}>
                    <td>{c.label}</td>
                    <td>{ac?.registration}</td>
                    <td className="muted">{d.description}</td>
                    <td><Pill tone="danger">{Math.abs(c.daysRemaining ?? 0)}d overdue</Pill></td>
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
