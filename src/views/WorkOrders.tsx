import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Store, Tab } from "../App";
import { supabase } from "../lib/supabase";
import { draftCrsStatement } from "../lib/ai";
import { checkCertifyingPrivilege, crsBlockers } from "../lib/compliance";
import { EntityLink, Pill } from "../components/ui";

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
  const [selected, setSelected] = useState<string | null>(focus ?? store.workOrders[0]?.id ?? null);
  // Deep links (e.g. from a defect row) select the referenced work order.
  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);
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
  const [actingEngId, setActingEngId] = useState("");
  const [signingCard, setSigningCard] = useState<string | null>(null);

  const eng = store.engineers.find((e) => e.id === engId);
  const licence = eng && ac ? checkCertifyingPrivilege(eng, ac.type_designator) : null;
  const actingEng = store.engineers.find((e) => e.id === actingEngId);
  const blockers = crsBlockers(tasks);

  async function signTask(card: (typeof tasks)[number]) {
    if (!actingEng || !wo) return;
    setSigningCard(card.id);
    setMsg(null);
    try {
      const now = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("task_cards")
        .update({ status: "complete", completed_by: actingEng.id, completed_at: now })
        .eq("id", card.id);
      if (e1) throw e1;
      await supabase.from("audit_log").insert({
        entity: "task_cards",
        action: "Task signed off",
        actor: `${actingEng.full_name} (${actingEng.part66_licence_no})`,
        detail: `${wo.wo_number} card ${card.sequence}: ${card.description}`,
      });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningCard(null);
    }
  }

  async function signInspection(card: (typeof tasks)[number]) {
    if (!actingEng || !wo) return;
    setSigningCard(card.id);
    setMsg(null);
    try {
      const now = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("task_cards")
        .update({ status: "inspected", inspected_by: actingEng.id, inspected_at: now })
        .eq("id", card.id);
      if (e1) throw e1;
      await supabase.from("audit_log").insert({
        entity: "task_cards",
        action: "Independent inspection signed",
        actor: `${actingEng.full_name} (${actingEng.part66_licence_no})`,
        detail: `${wo.wo_number} card ${card.sequence}: ${card.description}`,
      });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningCard(null);
    }
  }

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
    if (!wo || !eng || !licence?.valid || busy) return;
    // Re-check the sign-off gates in the mutator itself, not just the button's
    // disabled prop — a stale render or double-click must not release the WO.
    if (crsBlockers(tasks).length > 0) {
      setMsg("Cannot issue CRS — task cards remain unsigned or awaiting independent inspection.");
      return;
    }
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

      <div className="split">
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
                  {wo.wo_number} ·{" "}
                  {ac && (
                    <EntityLink onClick={() => go("fleet", ac.id)} title="View aircraft in Fleet">
                      {ac.registration}
                    </EntityLink>
                  )}{" "}
                  ({ac?.type_designator}) · opened {new Date(wo.opened_at).toLocaleDateString("en-GB")}
                  {wo.source_defect && (() => {
                    const src = store.defects.find((d) => d.id === wo.source_defect);
                    return (
                      <>
                        {" · raised from "}
                        <EntityLink onClick={() => go("defects", wo.source_defect!)} title="View source defect">
                          defect{src ? ` “${src.description.slice(0, 42)}${src.description.length > 42 ? "…" : ""}”` : ""}
                        </EntityLink>
                      </>
                    );
                  })()}
                </div>
              </div>

              <h2>Task cards</h2>

              <label htmlFor="acting-engineer">Acting as</label>
              <select id="acting-engineer" value={actingEngId} onChange={(e) => setActingEngId(e.target.value)}>
                <option value="">— select engineer —</option>
                {store.engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} · {e.part66_licence_no}
                  </option>
                ))}
              </select>

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
                      <th>Sign-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const asg = store.engineers.find((e) => e.id === t.assigned_engineer);
                      const completedBy = store.engineers.find((e) => e.id === t.completed_by);
                      const inspectedBy = store.engineers.find((e) => e.id === t.inspected_by);
                      const isBusy = signingCard === t.id;

                      let signOffCell: ReactNode;
                      if (t.status !== "complete" && t.status !== "inspected") {
                        const disabled = isBusy || !actingEng;
                        signOffCell = (
                          <>
                            <span className="muted">unsigned</span>{" "}
                            <button
                              className="btn ghost small"
                              disabled={disabled}
                              title={!actingEng ? "Select an acting engineer above first" : ""}
                              onClick={() => signTask(t)}
                            >
                              {isBusy ? "Signing…" : "Sign task"}
                            </button>
                          </>
                        );
                      } else if (t.status === "complete") {
                        const canInspect = t.requires_inspection;
                        let inspectDisabledReason = "";
                        if (!actingEng) inspectDisabledReason = "Select an acting engineer above first";
                        else if (actingEng.id === t.completed_by)
                          inspectDisabledReason = "Independent inspection — must be a different engineer (145.A.48)";
                        else if (ac) {
                          const priv = checkCertifyingPrivilege(actingEng, ac.type_designator);
                          if (!priv.valid) inspectDisabledReason = priv.reasons[0] ?? "Not authorised to certify";
                        }
                        signOffCell = (
                          <>
                            <span className="muted">
                              ✓ {completedBy?.full_name ?? "—"} {t.completed_at ? new Date(t.completed_at).toLocaleDateString("en-GB") : ""}
                            </span>
                            {canInspect && (
                              <>
                                {" "}
                                <button
                                  className="btn ghost small"
                                  disabled={isBusy || !!inspectDisabledReason}
                                  title={inspectDisabledReason}
                                  onClick={() => signInspection(t)}
                                >
                                  {isBusy ? "Signing…" : "Sign inspection"}
                                </button>
                              </>
                            )}
                          </>
                        );
                      } else {
                        signOffCell = (
                          <span className="muted">
                            ✓✓ insp. {inspectedBy?.full_name ?? "—"} {t.inspected_at ? new Date(t.inspected_at).toLocaleDateString("en-GB") : ""}
                          </span>
                        );
                      }

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
                          <td>{signOffCell}</td>
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

                  {blockers.length > 0 && (
                    <div className="banner" style={{ marginTop: 10 }}>
                      {blockers.map((b, i) => (
                        <div key={i}>{b}</div>
                      ))}
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
                      disabled={busy !== null || !licence?.valid || blockers.length > 0}
                      title={
                        !licence?.valid
                          ? "Certifying engineer must hold a valid licence + type rating"
                          : blockers.length > 0
                            ? "All task cards must be signed off (and independently inspected where required) before CRS can be issued"
                            : ""
                      }
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
