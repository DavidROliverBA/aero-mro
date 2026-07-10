import type { Store } from "../App";
import { Pill } from "../components/ui";
import { adAlert } from "../lib/compliance";

export default function Directives({ store }: { store: Store }) {
  return (
    <>
      <h1>Airworthiness Directives &amp; Service Bulletins</h1>
      <p className="subtitle">Mandatory continuing-airworthiness actions, per aircraft (EASA / UK CAA)</p>

      {store.directives.map((ad) => {
        const rows = store.adCompliance.filter((c) => c.ad_id === ad.id);
        return (
          <div key={ad.id} className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{ad.ad_number}</strong> <Pill tone="info">{ad.authority}</Pill>{" "}
                {ad.repetitive && <Pill tone="muted">repetitive · {ad.interval_days}d</Pill>}
                <div style={{ fontSize: 13, marginTop: 4 }}>{ad.subject}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Applies to {ad.applies_to_type} · effective {new Date(ad.effective_date).toLocaleDateString("en-GB")}
                  {ad.compliance_by && ` · comply by ${new Date(ad.compliance_by).toLocaleDateString("en-GB")}`}
                </div>
              </div>
            </div>
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Aircraft</th>
                  <th>Status</th>
                  <th>Complied</th>
                  <th>Next / deadline</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const ac = store.aircraft.find((a) => a.id === c.aircraft_id);
                  const al = adAlert(ad, c);
                  return (
                    <tr key={c.id}>
                      <td><strong>{ac?.registration}</strong></td>
                      <td>
                        <Pill tone={c.status === "complied" ? "ok" : c.status === "not_applicable" ? "muted" : al.tone === "ok" ? "info" : al.tone}>
                          {c.status.replace(/_/g, " ")}
                        </Pill>
                      </td>
                      <td className="muted">{c.complied_at ? new Date(c.complied_at).toLocaleDateString("en-GB") : "—"}</td>
                      <td>
                        {al.daysRemaining === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <Pill tone={al.tone}>
                            {al.daysRemaining < 0 ? `${Math.abs(al.daysRemaining)}d overdue` : `${al.daysRemaining}d`}
                          </Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
