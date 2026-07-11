import { useMemo, useState } from "react";
import type { Store } from "../App";
import { supabase } from "../lib/supabase";
import { logAudit } from "../lib/audit";
import { daysUntil, localIsoOffset } from "../lib/compliance";
import { Pill } from "../components/ui";

const CATEGORIES = ["A", "B1.1", "B2", "C"];

export default function Engineers({
  store,
  reload,
}: {
  store: Store;
  reload: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [staffNo, setStaffNo] = useState("");
  const [licenceNo, setLicenceNo] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [ratings, setRatings] = useState<string[]>([]);
  const [expiry, setExpiry] = useState(localIsoOffset(365));
  const [companyAuth, setCompanyAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fleetTypes = useMemo(
    () => [...new Set(store.aircraft.map((a) => a.type_designator))].sort(),
    [store.aircraft],
  );

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function addEngineer(evt: React.FormEvent) {
    evt.preventDefault();
    setMsg(null);
    if (!fullName.trim() || !staffNo.trim() || !licenceNo.trim())
      return setMsg("Name, staff number and licence number are required.");
    if (cats.length === 0) return setMsg("Select at least one licence category.");
    setSaving(true);
    try {
      const { error } = await supabase.from("engineers").insert({
        full_name: fullName.trim(),
        staff_no: staffNo.trim().toUpperCase(),
        part66_licence_no: licenceNo.trim().toUpperCase(),
        licence_categories: cats,
        type_ratings: ratings,
        licence_expiry: expiry,
        company_auth: companyAuth,
      });
      if (error) throw error;
      await logAudit(
        "engineers",
        "Engineer added",
        "Certifying staff admin",
        `${fullName.trim()} (${staffNo.trim().toUpperCase()}) — ${cats.join("/")}${ratings.length ? ", rated " + ratings.join(", ") : ""}`,
      );
      setFullName("");
      setStaffNo("");
      setLicenceNo("");
      setCats([]);
      setRatings([]);
      setExpiry(localIsoOffset(365));
      setCompanyAuth(true);
      setMsg("Engineer added. Link them to a login in Settings → User management.");
      await reload();
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Certifying Staff</h1>
      <p className="subtitle">Part-66 licensed engineers and their certifying privileges</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Staff No.</th>
              <th>Licence No.</th>
              <th>Categories</th>
              <th>Type ratings</th>
              <th>Company auth</th>
              <th>Licence expiry</th>
            </tr>
          </thead>
          <tbody>
            {store.engineers.map((e) => {
              const d = daysUntil(e.licence_expiry);
              const expired = d !== null && d < 0;
              const soon = d !== null && d >= 0 && d <= 60;
              return (
                <tr key={e.id}>
                  <td><strong>{e.full_name}</strong></td>
                  <td className="muted">{e.staff_no}</td>
                  <td><code>{e.part66_licence_no}</code></td>
                  <td>
                    {e.licence_categories.map((c) => (
                      <Pill key={c} tone="info">{c}</Pill>
                    ))}
                  </td>
                  <td className="muted">{e.type_ratings.join(", ")}</td>
                  <td>{e.company_auth ? <Pill tone="ok">held</Pill> : <Pill tone="danger">none</Pill>}</td>
                  <td>
                    <Pill tone={expired ? "danger" : soon ? "warn" : "ok"}>
                      {new Date(e.licence_expiry).toLocaleDateString("en-GB")}
                      {expired ? " (expired)" : soon ? ` (${d}d)` : ""}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={(e) => void addEngineer(e)}>
        <fieldset style={{ marginTop: 18 }}>
          <legend>Add engineer</legend>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label htmlFor="ae-name">Full name</label>
              <input id="ae-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Aisha Khan" />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label htmlFor="ae-staff">Staff no</label>
              <input id="ae-staff" value={staffNo} onChange={(e) => setStaffNo(e.target.value)} placeholder="ENG-1234" autoCapitalize="characters" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="ae-lic">Part-66 licence no</label>
              <input id="ae-lic" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} placeholder="UK.66.12345" autoCapitalize="characters" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="ae-exp">Licence expiry</label>
              <input id="ae-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 24 }}>
            <fieldset style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <legend>Licence categories</legend>
              <div className="row">
                {CATEGORIES.map((c) => (
                  <label key={c} style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={cats.includes(c)}
                      onChange={() => toggle(cats, setCats, c)}
                      style={{ width: "auto", minHeight: "auto" }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <legend>Type ratings</legend>
              <div className="row">
                {fleetTypes.map((t) => (
                  <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={ratings.includes(t)}
                      onChange={() => toggle(ratings, setRatings, t)}
                      style={{ width: "auto", minHeight: "auto" }}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              <input
                type="checkbox"
                checked={companyAuth}
                onChange={(e) => setCompanyAuth(e.target.checked)}
                style={{ width: "auto", minHeight: "auto" }}
              />
              Part-145 company authorisation held
            </label>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Adding…" : "Add engineer"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: "8px 0 0" }}>
            Without a certifying category (B1/B2/C), a type rating and company authorisation, the
            engineer cannot sign a CRS — the gates enforce it. Engineers you add here survive a
            demo data reset.
          </p>
          {msg && (
            <div className={`banner ${msg.startsWith("Failed") ? "danger" : ""}`} style={{ marginTop: 10, marginBottom: 0 }} role="status">
              {msg}
            </div>
          )}
        </fieldset>
      </form>
    </>
  );
}
