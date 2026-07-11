import type { Store } from "../App";
import { StatCard, Pill, EmptyState } from "../components/ui";
import { chronicDefects } from "../lib/compliance";
import type { Defect } from "../lib/types";

const WINDOW_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

const ATA_NAMES: Record<string, string> = {
  "21": "Air conditioning",
  "23": "Communications",
  "24": "Electrical",
  "27": "Flight controls",
  "28": "Fuel",
  "29": "Hydraulics",
  "32": "Landing gear",
  "33": "Lights",
  "34": "Navigation",
  "35": "Oxygen",
  "49": "APU",
  "52": "Doors",
  "72": "Engine",
  "73": "Fuel control",
};

const STATUS_TONE: Record<Defect["status"], "ok" | "warn" | "danger"> = {
  open: "warn",
  deferred: "warn",
  closed: "ok",
};

export default function Reliability({ store }: { store: Store }) {
  const cutoff = Date.now() - WINDOW_DAYS * DAY;
  const recentDefects = store.defects.filter(
    (d) => new Date(d.raised_at).getTime() >= cutoff,
  );

  const openOrDeferred = recentDefects.filter((d) => d.status !== "closed");

  const chronicGroups = chronicDefects(store.defects, WINDOW_DAYS);
  const chronicAircraftIds = new Set(chronicGroups.map((g) => g.aircraftId));

  // Defects by ATA chapter
  const ataCounts = new Map<string, number>();
  for (const d of recentDefects) {
    const ch = d.ata_chapter ?? "—";
    ataCounts.set(ch, (ataCounts.get(ch) ?? 0) + 1);
  }
  const ataRows = [...ataCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxAtaCount = ataRows.length > 0 ? ataRows[0][1] : 0;

  // Defect rate per aircraft
  const aircraftRows = store.aircraft.map((ac) => {
    const defectCount = recentDefects.filter((d) => d.aircraft_id === ac.id).length;
    const fh = store.flights
      .filter((f) => f.aircraft_id === ac.id && new Date(f.flight_date).getTime() >= cutoff)
      .reduce((sum, f) => sum + Number(f.block_hours), 0);
    const rate = fh > 0 ? (defectCount / fh) * 100 : null;
    return { aircraft: ac, defectCount, fh, rate, chronic: chronicAircraftIds.has(ac.id) };
  });

  return (
    <>
      <h1>Reliability</h1>
      <p className="subtitle">
        Defect trends, rates and chronic-defect detection — the reliability programme's first pass
      </p>

      <div className="grid">
        <StatCard label="Defects raised (90 d)" value={recentDefects.length} />
        <StatCard
          label="Currently open / deferred"
          value={openOrDeferred.length}
          tone={openOrDeferred.length ? "warn" : "ok"}
        />
        <StatCard
          label="Chronic patterns detected"
          value={chronicGroups.length}
          tone={chronicGroups.length ? "danger" : "ok"}
        />
      </div>

      <h2>Defects by ATA chapter (90 days)</h2>
      {ataRows.length === 0 ? (
        <EmptyState>No defects raised in the last 90 days</EmptyState>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ataRows.map(([ch, count]) => {
            const name = ATA_NAMES[ch] ?? "Other";
            const pct = maxAtaCount > 0 ? (count / maxAtaCount) * 100 : 0;
            return (
              <div key={ch} className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ minWidth: 220 }}>
                  ATA {ch} — {name}
                </span>
                <div className="row" style={{ gap: 10 }}>
                  <div className="bar ok" style={{ maxWidth: 320 }}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <span className="muted" style={{ minWidth: 24, textAlign: "right" }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2>Defect rate per aircraft (90 days)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Registration</th>
              <th>Type</th>
              <th>Defects (90 d)</th>
              <th>FH flown</th>
              <th>Defects per 100 FH</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {aircraftRows.map((r) => (
              <tr key={r.aircraft.id}>
                <td><strong>{r.aircraft.registration}</strong></td>
                <td>{r.aircraft.type_designator}</td>
                <td>{r.defectCount}</td>
                <td>{r.fh.toFixed(1)}</td>
                <td>{r.rate !== null ? (r.rate).toFixed(1) : "—"}</td>
                <td>
                  <Pill tone={r.chronic ? "danger" : "ok"}>{r.chronic ? "chronic" : "normal"}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Chronic defects — repeat offenders</h2>
      {chronicGroups.length === 0 ? (
        <EmptyState>No chronic patterns detected</EmptyState>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {chronicGroups.map((g) => {
            const ac = store.aircraftById.get(g.aircraftId);
            return (
              <div
                key={`${g.aircraftId}|${g.ataChapter}`}
                className="card"
                style={{ borderColor: "var(--danger)" }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {ac?.registration ?? g.aircraftId} — ATA {g.ataChapter}
                  </strong>
                  <Pill tone="danger">chronic</Pill>
                </div>
                <p className="muted" style={{ margin: "8px 0 12px", fontSize: 12.5 }}>
                  ≥3 defects on the same system inside 90 days — candidate for deeper
                  troubleshooting rather than another component swap (no-fault-found risk)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.defects.map((d) => (
                    <div key={d.id} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                      <span className="muted" style={{ minWidth: 90 }}>
                        {new Date(d.raised_at).toLocaleDateString("en-GB")}
                      </span>
                      <span style={{ flex: 1 }}>{d.description}</span>
                      <Pill tone={STATUS_TONE[d.status]}>{d.status}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
