import { useState } from "react";
import type { Store, Tab } from "../App";
import { supabase } from "../lib/supabase";
import { triageDefect, type TriageResult } from "../lib/ai";
import { melClock } from "../lib/compliance";
import { EntityLink, Pill } from "../components/ui";

export default function Defects({
  store,
  reload,
  keySet,
  onNeedKey,
  go,
  focus,
}: {
  store: Store;
  reload: () => Promise<void>;
  keySet: boolean;
  onNeedKey: () => void;
  go: (t: Tab, focusId?: string) => void;
  focus: string | null;
}) {
  const [acId, setAcId] = useState(store.aircraft[0]?.id ?? "");
  const [desc, setDesc] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [busy, setBusy] = useState<"triage" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ac = store.aircraft.find((a) => a.id === acId);

  async function runTriage() {
    if (!keySet) return onNeedKey();
    if (!desc.trim() || !ac) return;
    setErr(null);
    setBusy("triage");
    try {
      setTriage(await triageDefect(desc, ac.type_designator));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!ac || !desc.trim()) return;
    setBusy("save");
    setErr(null);
    try {
      const deferred = triage && triage.suggested_mel_cat !== "none" && !triage.aog_risk;
      const melDays = triage
        ? { A: 0, B: 3, C: 10, D: 120 }[triage.suggested_mel_cat as "A" | "B" | "C" | "D"]
        : undefined;
      const deferredUntil =
        deferred && melDays !== undefined
          ? new Date(Date.now() + melDays * 86400000).toISOString().slice(0, 10)
          : null;
      const { error } = await supabase.from("defects").insert({
        aircraft_id: ac.id,
        raised_by: raisedBy || "Unattributed",
        description: desc,
        ata_chapter: triage?.ata_chapter ?? null,
        mel_cat: deferred ? triage?.suggested_mel_cat : null,
        severity: triage?.severity ?? "minor",
        status: deferred ? "deferred" : "open",
        deferred_until: deferredUntil,
        ai_triaged: !!triage,
      });
      if (error) throw error;
      setDesc("");
      setRaisedBy("");
      setTriage(null);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const acName = (id: string) => store.aircraft.find((a) => a.id === id)?.registration ?? "?";

  return (
    <>
      <h1>Defects</h1>
      <p className="subtitle">Tech log entries and the deferred defect register (MEL controlled)</p>

      <div className="ai-box">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Raise a defect</strong>
          <span className="ai-tag">✨ AI-assisted triage</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: "0 0 160px" }}>
            <label>Aircraft</label>
            <select value={acId} onChange={(e) => setAcId(e.target.value)}>
              {store.aircraft.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} ({a.type_designator})
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label>Raised by</label>
            <input value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} placeholder="Capt / FO / engineer" />
          </div>
        </div>
        <label>Defect description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. No.1 hydraulic system low pressure warning intermittent in cruise"
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={runTriage} disabled={busy !== null || !desc.trim()}>
            {busy === "triage" ? "Triaging…" : "✨ Triage with AI"}
          </button>
          <button className="btn" onClick={save} disabled={busy !== null || !desc.trim()}>
            {busy === "save" ? "Saving…" : "Save defect"}
          </button>
        </div>
        {err && <div className="ai-out" style={{ color: "var(--danger)" }}>{err}</div>}
        {triage && (
          <div className="ai-out">
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Pill tone="info">ATA {triage.ata_chapter} · {triage.ata_system}</Pill>
              <Pill tone={triage.severity === "critical" ? "danger" : triage.severity === "major" ? "warn" : "muted"}>
                {triage.severity}
              </Pill>
              {triage.aog_risk && <Pill tone="danger">AOG risk</Pill>}
              <Pill tone={triage.suggested_mel_cat === "none" ? "danger" : "ok"}>
                MEL {triage.suggested_mel_cat === "none" ? "not deferrable" : `Cat ${triage.suggested_mel_cat}`}
              </Pill>
            </div>
            <div style={{ marginBottom: 6 }}>{triage.rationale}</div>
            <strong>Recommended actions</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {triage.recommended_actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
              Decision support only — a licensed engineer makes the airworthiness determination. Saving applies these
              values; the MEL category sets the rectification deadline.
            </div>
          </div>
        )}
      </div>

      <h2>Register</h2>
      <div className="desktop-only">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aircraft</th>
                <th>Description</th>
                <th>ATA</th>
                <th>Severity</th>
                <th>Status</th>
                <th>MEL clock</th>
                <th>WO</th>
                <th>Raised</th>
              </tr>
            </thead>
            <tbody>
              {store.defects.map((d) => {
                const clock = melClock(d);
                const wo = store.workOrders.find((w) => w.source_defect === d.id);
                return (
                  <tr key={d.id} className={focus === d.id ? "row-focus" : ""}>
                    <td>
                      <EntityLink onClick={() => go("fleet", d.aircraft_id)} title="View aircraft in Fleet">
                        {acName(d.aircraft_id)}
                      </EntityLink>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      {d.description} {d.ai_triaged && <span className="ai-tag" title="AI-triaged">✨</span>}
                    </td>
                    <td>{d.ata_chapter ?? "—"}</td>
                    <td>
                      <Pill tone={d.severity === "critical" ? "danger" : d.severity === "major" ? "warn" : "muted"}>
                        {d.severity}
                      </Pill>
                    </td>
                    <td>
                      <Pill tone={d.status === "open" ? "warn" : d.status === "deferred" ? "info" : "ok"}>{d.status}</Pill>
                    </td>
                    <td>
                      {clock ? (
                        <Pill tone={clock.tone}>
                          {clock.daysRemaining !== null && clock.daysRemaining < 0
                            ? `${Math.abs(clock.daysRemaining)}d overdue`
                            : `${clock.daysRemaining}d left`}
                        </Pill>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {wo ? (
                        <EntityLink onClick={() => go("workorders", wo.id)} title="Open work order">
                          {wo.wo_number}
                        </EntityLink>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{new Date(d.raised_at).toLocaleDateString("en-GB")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-only">
        {store.defects.map((d) => {
          const clock = melClock(d);
          const wo = store.workOrders.find((w) => w.source_defect === d.id);
          return (
            <div
              key={d.id}
              className="card"
              style={{ marginBottom: 10, ...(focus === d.id ? { borderColor: "var(--accent)" } : {}) }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <EntityLink onClick={() => go("fleet", d.aircraft_id)} title="View aircraft in Fleet">
                  {acName(d.aircraft_id)}
                </EntityLink>
                <Pill tone={d.status === "open" ? "warn" : d.status === "deferred" ? "info" : "ok"}>{d.status}</Pill>
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {d.description} {d.ai_triaged && <span className="ai-tag" title="AI-triaged">✨</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <Pill tone={d.severity === "critical" ? "danger" : d.severity === "major" ? "warn" : "muted"}>
                  {d.severity}
                </Pill>
                {clock && (
                  <Pill tone={clock.tone}>
                    {clock.daysRemaining !== null && clock.daysRemaining < 0
                      ? `${Math.abs(clock.daysRemaining)}d overdue`
                      : `${clock.daysRemaining}d left`}
                  </Pill>
                )}
                {wo && (
                  <EntityLink onClick={() => go("workorders", wo.id)} title="Open work order">
                    {wo.wo_number}
                  </EntityLink>
                )}
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                ATA {d.ata_chapter ?? "—"} · Raised {new Date(d.raised_at).toLocaleDateString("en-GB")}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
