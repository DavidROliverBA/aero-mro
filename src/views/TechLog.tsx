import { useMemo, useState } from "react";
import type { Store, Tab } from "../App";
import { supabase } from "../lib/supabase";
import { rollOntoAircraft } from "../lib/actions";
import { EntityLink, Pill, StatCard, EmptyState } from "../components/ui";

export default function TechLog({
  store,
  reload,
  go,
  focus,
}: {
  store: Store;
  reload: () => Promise<void>;
  go: (t: Tab, focusId?: string) => void;
  focus: string | null;
}) {
  // A deep link (e.g. from Fleet's sector count) pre-filters to that aircraft.
  const [aircraftFilter, setAircraftFilter] = useState(focus ?? "");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Record-sector form state
  const [formAircraftId, setFormAircraftId] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [flightDate, setFlightDate] = useState(new Date().toISOString().slice(0, 10));
  const [dep, setDep] = useState("");
  const [arr, setArr] = useState("");
  const [blockHours, setBlockHours] = useState("");
  const [captain, setCaptain] = useState("");
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const openSectors = store.flights.filter((f) => f.status === "open").length;
  const recentFlights = useMemo(
    () => store.flights.filter((f) => f.flight_date >= cutoffStr),
    [store.flights, cutoffStr],
  );
  const sectorsLast7 = recentFlights.length;
  const fleetFhLast7 = recentFlights.reduce((sum, f) => sum + Number(f.block_hours), 0);

  const sectors = useMemo(() => {
    const rows = aircraftFilter
      ? store.flights.filter((f) => f.aircraft_id === aircraftFilter)
      : store.flights;
    return [...rows].sort((a, b) => (a.flight_date < b.flight_date ? 1 : a.flight_date > b.flight_date ? -1 : 0));
  }, [store.flights, aircraftFilter]);

  async function closeSector(flightId: string) {
    const flight = store.flights.find((f) => f.id === flightId);
    if (!flight) return;
    const ac = store.aircraft.find((a) => a.id === flight.aircraft_id);
    setClosingId(flightId);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("flights").update({ status: "closed" }).eq("id", flightId);
      if (e1) throw e1;
      await rollOntoAircraft(flight.aircraft_id, Number(flight.block_hours), flight.cycles);
      const { error: e3 } = await supabase.from("audit_log").insert({
        entity: "flights",
        action: "Tech log sector closed",
        actor: "Tech log",
        detail: `${flight.flight_no} ${flight.dep}-${flight.arr} closed, ${flight.block_hours} FH rolled to ${ac?.registration ?? flight.aircraft_id}`,
      });
      if (e3) throw e3;
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClosingId(null);
    }
  }

  function resetForm() {
    setFormAircraftId("");
    setFlightNo("");
    setFlightDate(new Date().toISOString().slice(0, 10));
    setDep("");
    setArr("");
    setBlockHours("");
    setCaptain("");
    setRemarks("");
  }

  async function recordSector(evt: React.FormEvent) {
    evt.preventDefault();
    setFormError(null);
    const hours = Number(blockHours);
    if (!formAircraftId) return setFormError("Choose an aircraft.");
    if (!flightNo.trim()) return setFormError("Flight number is required.");
    if (!dep.trim() || !arr.trim()) return setFormError("Departure and arrival are required.");
    if (!(hours > 0)) return setFormError("Block hours must be greater than zero.");

    const ac = store.aircraft.find((a) => a.id === formAircraftId);
    setSaving(true);
    try {
      const { error: e1 } = await supabase.from("flights").insert({
        aircraft_id: formAircraftId,
        flight_no: flightNo.trim(),
        flight_date: flightDate,
        dep: dep.trim().toUpperCase(),
        arr: arr.trim().toUpperCase(),
        block_hours: hours,
        cycles: 1,
        captain: captain.trim(),
        remarks: remarks.trim() || null,
        status: "closed",
      });
      if (e1) throw e1;
      await rollOntoAircraft(formAircraftId, hours, 1);
      const { error: e3 } = await supabase.from("audit_log").insert({
        entity: "flights",
        action: "Tech log sector recorded",
        actor: captain.trim() || "Tech log",
        detail: `${flightNo.trim()} ${dep.trim().toUpperCase()}-${arr.trim().toUpperCase()} recorded, ${hours} FH rolled to ${ac?.registration ?? formAircraftId}`,
      });
      if (e3) throw e3;
      resetForm();
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Electronic Tech Log</h1>
      <p className="subtitle">Flight sector recording, block hours &amp; cycles roll-up (Part-M / CAMO)</p>

      {error && <div className="banner danger" role="alert">{error}</div>}

      <div className="grid">
        <StatCard label="Open sectors" value={openSectors} />
        <StatCard label="Sectors flown (7d)" value={sectorsLast7} />
        <StatCard label="Fleet FH flown (7d)" value={fleetFhLast7.toFixed(1)} />
      </div>

      <h2>Sectors</h2>
      <label>Aircraft</label>
      <select value={aircraftFilter} onChange={(e) => setAircraftFilter(e.target.value)} style={{ maxWidth: 260 }}>
        <option value="">All aircraft</option>
        {store.aircraft.map((a) => (
          <option key={a.id} value={a.id}>{a.registration}</option>
        ))}
      </select>

      {sectors.length === 0 ? (
        <EmptyState>No sectors recorded.</EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Flight</th>
                <th>Sector</th>
                <th>Aircraft</th>
                <th>FH</th>
                <th>FC</th>
                <th>Captain</th>
                <th>Fuel uplift kg</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((f) => {
                const ac = store.aircraft.find((a) => a.id === f.aircraft_id);
                return (
                  <tr key={f.id}>
                    <td>{new Date(f.flight_date).toLocaleDateString("en-GB")}</td>
                    <td>{f.flight_no}</td>
                    <td>{f.dep}&rarr;{f.arr}</td>
                    <td>
                      {ac ? (
                        <EntityLink onClick={() => go("fleet", ac.id)} title="View aircraft in Fleet">
                          {ac.registration}
                        </EntityLink>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{Number(f.block_hours).toFixed(1)}</td>
                    <td>{f.cycles}</td>
                    <td>{f.captain}</td>
                    <td>{f.fuel_uplift_kg ?? "—"}</td>
                    <td>
                      {f.status === "open" ? (
                        <div className="row">
                          <Pill tone="warn">open</Pill>
                          <button
                            className="btn ghost"
                            onClick={() => closeSector(f.id)}
                            disabled={closingId === f.id}
                          >
                            {closingId === f.id ? "Closing…" : "Close sector"}
                          </button>
                        </div>
                      ) : (
                        <Pill tone="ok">closed</Pill>
                      )}
                    </td>
                    <td className="muted">{f.remarks ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Record sector</h2>
      <form onSubmit={recordSector}>
        <fieldset>
          <legend>Record sector</legend>

          <label>Aircraft</label>
          <select value={formAircraftId} onChange={(e) => setFormAircraftId(e.target.value)}>
            <option value="">— select aircraft —</option>
            {store.aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.registration} ({a.type_designator})</option>
            ))}
          </select>

          <label>Flight no</label>
          <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)} placeholder="BA123" />

          <label>Date</label>
          <input type="date" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} />

          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Dep</label>
              <input
                value={dep}
                onChange={(e) => setDep(e.target.value.toUpperCase())}
                placeholder="LHR"
                maxLength={4}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Arr</label>
              <input
                value={arr}
                onChange={(e) => setArr(e.target.value.toUpperCase())}
                placeholder="JFK"
                maxLength={4}
              />
            </div>
          </div>

          <label>Block hours</label>
          <input
            type="number"
            step="0.1"
            value={blockHours}
            onChange={(e) => setBlockHours(e.target.value)}
            placeholder="7.5"
          />

          <label>Captain</label>
          <input value={captain} onChange={(e) => setCaptain(e.target.value)} placeholder="Capt. Smith" />

          <label>Remarks (optional)</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />

          {formError && <div className="banner danger" style={{ marginTop: 10 }} role="alert">{formError}</div>}

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record sector"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
