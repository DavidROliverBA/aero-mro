import type { Store } from "../App";
import { Pill } from "../components/ui";
import { daysUntil } from "../lib/compliance";

const COND_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = {
  serviceable: "ok",
  unserviceable: "warn",
  quarantine: "warn",
  scrap: "danger",
};

export default function Parts({ store }: { store: Store }) {
  return (
    <>
      <h1>Parts &amp; Stores</h1>
      <p className="subtitle">Serialised rotables and consumables with EASA Form 1 traceability</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part No.</th>
              <th>Serial</th>
              <th>Description</th>
              <th>ATA</th>
              <th>Condition</th>
              <th>Form 1</th>
              <th>Fitted to</th>
              <th>Shelf life</th>
            </tr>
          </thead>
          <tbody>
            {store.parts.map((p) => {
              const fitted = store.aircraft.find((a) => a.id === p.fitted_to);
              const shelf = daysUntil(p.shelf_expiry);
              return (
                <tr key={p.id}>
                  <td><strong>{p.part_number}</strong></td>
                  <td className="muted">{p.serial_number ?? "—"}</td>
                  <td>{p.description}</td>
                  <td>{p.ata_chapter ?? "—"}</td>
                  <td><Pill tone={COND_TONE[p.condition]}>{p.condition}</Pill></td>
                  <td>{p.form1_ref ? <code>{p.form1_ref}</code> : <Pill tone="danger">missing</Pill>}</td>
                  <td>{fitted ? fitted.registration : <span className="muted">stores</span>}</td>
                  <td>
                    {p.shelf_expiry ? (
                      <Pill tone={shelf !== null && shelf < 0 ? "danger" : shelf !== null && shelf <= 30 ? "warn" : "muted"}>
                        {new Date(p.shelf_expiry).toLocaleDateString("en-GB")}
                      </Pill>
                    ) : (
                      <span className="muted">—</span>
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
