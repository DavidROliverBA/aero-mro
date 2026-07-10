import { useMemo, useState } from "react";
import type { Store } from "../App";
import { supabase } from "../lib/supabase";
import { draftCrsStatement } from "../lib/ai";
import { checkCertifyingPrivilege } from "../lib/compliance";
import { Pill } from "../components/ui";

const WO_TONE: Record<string, "ok" | "warn" | "danger" | "muted" | "info"> = {
  open: "muted",
  in_progress: "info",
  awaiting_parts: "warn",
  awaiting_crs: "warn",
  closed: "ok",
};

export default function WorkOrders({
  store,
  reload,
  keySet,
  onNeedKey,
}: {
  store: Store;
  reload: () => Promise<void>;
  keySet: boolean;
  onNeedKey: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(store.workOrders[0]?.id ?? null);
  const wo = store.workOrders.find((w) => w.id === selected);
  const ac = wo && store.aircraft.find((a) => a.id === wo.aircraft_id);
  const tasks = useMemo(
    () => store.taskCards.filter((t) => t.work_order_id === selected).sort((a, b) => a.sequence - b.sequence),
    [store.taskCards, selected],
  );

  const [engId, setEngId] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState<"draft" | "issue" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const eng = store.engineers.find((e) => e.id === engId);
  const licence = eng && ac ? checkCertifyingPrivilege(eng, ac.type_designator) : null;
  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.status === "complete" || t.status === "inspected");

  async function draft() {
    if (!keySet) return onNeedKey();
    if (!wo || !ac) return;
    setBusy("draft");
    setMsg(null);
    try {
      const text = await draftCrsStatement(wo.title, tasks.map((t) => t.description), ac.registration);
      setStatement(text);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function issueCrs() {
    if (!wo || !eng || !licence?.valid) return;
    setBusy("issue");
    setMsg(null);
    try {
      const { error: e1 } = await supabase.from("crs_releases").insert({
        work_order_id: wo.id,
        engineer_id: eng.id,
        statement: statement || "Standard Part-145.A.50 release statement.",
        licence_valid: true,
        ai_drafted: !!statement,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("work_orders").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", wo.id);
      if (e2) throw e2;
      await supabase.from("audit_log").insert({
        entity: "crs_releases",
        action: "CRS issued",
        actor: `${eng.full_name} (${eng.part66_licence_no})`,
        detail: `${wo.wo_number} released to service`,
      });
      setStatement("");
      setEngId("");
      setMsg("CRS issued — work order closed and released to service.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1>Work Orders</h1>
      <p className="subtitle">Maintenance work packages, task cards, and release to service (CRS)</p>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
        <div>
          {store.workOrders.map((w) => {
            const acr = store.aircraft.find((a) => a.id === w.aircraft_id);
            return (
              <div
                key={w.id}
                className="card"
                style={{
                  marginBottom: 10,
                  cursor: "pointer",
                  borderColor: selected === w.id ? "var(--accent)" : "var(--border)",
                }}
                onClick={() => {
                  setSelected(w.id);
                  setMsg(null);
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{w.wo_number}</strong>
                  <Pill tone={WO_TONE[w.status]}>{w.status.replace(/_/g, " ")}</Pill>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{w.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{acr?.registration} · {w.wo_type}</div>
              </div>
            );
          })}
        </div>

        <div>
          {!wo ? (
            <p className="muted">Select a work order.</p>
          ) : (
            <>
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 style={{ margin: 0 }}>{wo.title}</h2>
                  <Pill tone={WO_TONE[wo.status]}>{wo.status.replace(/_/g, " ")}</Pill>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {wo.wo_number} · {ac?.registration} ({ac?.type_designator}) · opened{" "}
                  {new Date(wo.opened_at).toLocaleDateString("en-GB")}
                </div>
              </div>

              <h2>Task cards</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>ATA</th>
                      <th>Assigned</th>
                      <th>Est h</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const asg = store.engineers.find((e) => e.id === t.assigned_engineer);
                      return (
                        <tr key={t.id}>
                          <td>{t.sequence}</td>
                          <td>
                            {t.description}
                            {t.requires_inspection && (
                              <span title="Independent/duplicate inspection required">
                                {" "}
                                <Pill tone="info">insp</Pill>
                              </span>
                            )}
                          </td>
                          <td>{t.ata_chapter}</td>
                          <td className="muted">{asg?.full_name ?? "—"}</td>
                          <td>{t.est_hours}</td>
                          <td>
                            <Pill tone={t.status === "complete" || t.status === "inspected" ? "ok" : t.status === "in_progress" ? "info" : "muted"}>
                              {t.status}
                            </Pill>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {wo.status !== "closed" && (
                <div className="ai-box">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>Certificate of Release to Service (Part-145.A.50)</strong>
                    <span className="ai-tag">✨ AI-drafted statement</span>
                  </div>

                  {!allTasksDone && (
                    <div className="banner" style={{ marginTop: 10 }}>
                      Not all task cards are complete/inspected. CRS should only be issued once work is finished.
                    </div>
                  )}

                  <label>Certifying engineer</label>
                  <select value={engId} onChange={(e) => setEngId(e.target.value)}>
                    <option value="">— select certifying staff —</option>
                    {store.engineers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} · {e.part66_licence_no} · {e.licence_categories.join("/")}
                      </option>
                    ))}
                  </select>

                  {eng && licence && (
                    <div className="ai-out" style={{ marginTop: 10 }}>
                      <strong>Part-66 privilege check for {ac?.type_designator}</strong>
                      {licence.valid ? (
                        <div style={{ marginTop: 6 }}>
                          <Pill tone="ok">✓ Authorised to certify</Pill>
                          <div className="muted" style={{ marginTop: 4 }}>
                            {eng.licence_categories.join(", ")} · type ratings {eng.type_ratings.join(", ")} · expires{" "}
                            {new Date(eng.licence_expiry).toLocaleDateString("en-GB")}
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6 }}>
                          <Pill tone="danger">✗ Not authorised — release blocked</Pill>
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--danger)" }}>
                            {licence.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn ghost" onClick={draft} disabled={busy !== null}>
                      {busy === "draft" ? "Drafting…" : "✨ Draft CRS statement"}
                    </button>
                  </div>
                  {statement && (
                    <>
                      <label>Release statement</label>
                      <textarea value={statement} onChange={(e) => setStatement(e.target.value)} />
                    </>
                  )}

                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn"
                      onClick={issueCrs}
                      disabled={busy !== null || !licence?.valid}
                      title={!licence?.valid ? "Certifying engineer must hold a valid licence + type rating" : ""}
                    >
                      {busy === "issue" ? "Issuing…" : "Issue CRS & close work order"}
                    </button>
                  </div>
                  {msg && <div className="ai-out" style={{ color: msg.startsWith("CRS issued") ? "var(--ok)" : "var(--danger)" }}>{msg}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
