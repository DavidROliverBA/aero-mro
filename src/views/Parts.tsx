import type { Store, Tab } from "../App";
import { EntityLink, Pill, StatCard } from "../components/ui";
import { shelfLife } from "../lib/compliance";

const COND_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = {
  serviceable: "ok",
  unserviceable: "warn",
  quarantine: "warn",
  scrap: "danger",
};

export default function Parts({
  store,
  go,
}: {
  store: Store;
  go: (t: Tab, focusId?: string) => void;
}) {
  const serviceable = store.parts.filter((p) => p.condition === "serviceable");
  const quarantine = store.parts.filter((p) => p.condition === "quarantine");
  const unserviceable = store.parts.filter((p) => p.condition === "unserviceable");
  const shelfExpiringSoon = store.parts.filter((p) => shelfLife(p.shelf_expiry)?.tone === "warn");

  return (
    <>
      <h1>Parts &amp; Stores</h1>
      <p className="subtitle">
        Serialised rotables and consumables — 145.A.42 stores control: segregation, shelf-life, Form 1 traceability
      </p>

      <div className="grid">
        <StatCard label="Serviceable line items" value={serviceable.length} />
        <StatCard
          label="Quarantine"
          value={quarantine.length}
          tone={quarantine.length ? "danger" : "ok"}
        />
        <StatCard label="Unserviceable" value={unserviceable.length} tone={unserviceable.length ? "warn" : "ok"} />
        <StatCard
          label="Shelf-life expiring ≤30d"
          value={shelfExpiringSoon.length}
          tone={shelfExpiringSoon.length ? "warn" : "ok"}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part No.</th>
              <th>Serial</th>
              <th>Description</th>
              <th>ATA</th>
              <th>Location</th>
              <th>Qty</th>
              <th>Condition</th>
              <th>Form 1</th>
              <th>Fitted to</th>
              <th>Shelf life</th>
            </tr>
          </thead>
          <tbody>
            {store.parts.map((p) => {
              const fitted = store.aircraft.find((a) => a.id === p.fitted_to);
              const shelf = shelfLife(p.shelf_expiry);
              const noForm1 = !p.form1_ref && p.condition !== "scrap";
              return (
                <tr key={p.id}>
                  <td
                    style={
                      p.condition === "quarantine"
                        ? { borderLeft: "3px solid var(--danger)" }
                        : undefined
                    }
                  >
                    <strong>{p.part_number}</strong>
                  </td>
                  <td className="muted">{p.serial_number ?? "—"}</td>
                  <td>{p.description}</td>
                  <td>{p.ata_chapter ?? "—"}</td>
                  <td className="muted">{p.location ?? "—"}</td>
                  <td>{p.quantity}</td>
                  <td>
                    <Pill tone={COND_TONE[p.condition]}>{p.condition}</Pill>{" "}
                    {noForm1 && <Pill tone="warn">no Form 1</Pill>}
                  </td>
                  <td>{p.form1_ref ? <code>{p.form1_ref}</code> : <Pill tone="danger">missing</Pill>}</td>
                  <td>
                    {fitted ? (
                      <EntityLink onClick={() => go("fleet", fitted.id)} title="View aircraft in Fleet">
                        {fitted.registration}
                      </EntityLink>
                    ) : (
                      <span className="muted">stores</span>
                    )}
                  </td>
                  <td>{shelf ? <Pill tone={shelf.tone}>{shelf.label}</Pill> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
