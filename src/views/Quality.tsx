import { useMemo, useState } from "react";
import type { Store } from "../App";
import type { AuditFinding } from "../lib/types";
import { supabase } from "../lib/supabase";
import { logAudit } from "../lib/audit";
import { daysUntil } from "../lib/compliance";
import { EmptyState, Pill, StatCard } from "../components/ui";

const AUDIT_STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "muted" | "info"> = {
  planned: "info",
  in_progress: "warn",
  closed: "ok",
};

const LEVEL_LABEL: Record<AuditFinding["level"], string> = {
  level_1: "Level 1",
  level_2: "Level 2",
  observation: "Observation",
};

const LEVEL_TONE: Record<AuditFinding["level"], "ok" | "warn" | "danger" | "muted" | "info"> = {
  level_1: "danger",
  level_2: "warn",
  observation: "info",
};

export default function Quality({ store, reload }: { store: Store; reload: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFindings = useMemo(() => store.auditFindings.filter((f) => f.status === "open"), [store.auditFindings]);
  const overdueFindings = useMemo(
    () =>
      openFindings.filter((f) => {
        const d = daysUntil(f.due_date);
        return d !== null && d < 0;
      }),
    [openFindings],
  );
  const thisYear = new Date().getFullYear();
  const auditsThisYear = useMemo(
    () => store.audits.filter((a) => new Date(a.audit_date).getFullYear() === thisYear),
    [store.audits, thisYear],
  );

  async function closeFinding(finding: AuditFinding, auditRef: string) {
    setBusyId(finding.id);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from("audit_findings")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", finding.id);
      if (e1) throw e1;
      await logAudit(
        "audit_findings",
        "Finding closed",
        "Quality",
        `${auditRef}: finding closed`,
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>Quality &amp; Audit</h1>
      <p className="subtitle">Independent quality monitoring, findings &amp; corrective action — 145.A.65</p>

      {error && <div className="banner danger" role="alert">{error}</div>}

      <div className="grid" style={{ marginBottom: 20 }}>
        <StatCard label="Open findings" value={openFindings.length} tone={openFindings.length > 0 ? "warn" : undefined} />
        <StatCard label="Overdue findings" value={overdueFindings.length} tone={overdueFindings.length > 0 ? "danger" : undefined} />
        <StatCard label="Audits this year" value={auditsThisYear.length} />
      </div>

      {store.audits.length === 0 ? (
        <EmptyState>No audits recorded.</EmptyState>
      ) : (
        store.audits.map((audit) => {
          const findings = store.auditFindings.filter((f) => f.audit_id === audit.id);
          return (
            <div className="card" style={{ marginBottom: 14 }} key={audit.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {audit.audit_ref} — {audit.area}
                </strong>
                <Pill tone={AUDIT_STATUS_TONE[audit.status]}>{audit.status.replace(/_/g, " ")}</Pill>
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                {audit.regulation_ref ? `${audit.regulation_ref} · ` : ""}
                {new Date(audit.audit_date).toLocaleDateString("en-GB")} · {audit.auditor}
              </div>

              {findings.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No findings recorded.</p>
              ) : (
                findings.map((finding) => {
                  const overdue =
                    finding.status === "open" &&
                    daysUntil(finding.due_date) !== null &&
                    (daysUntil(finding.due_date) as number) < 0;
                  const canClose = !!finding.corrective_action && finding.corrective_action.trim().length > 0;
                  return (
                    <div
                      key={finding.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 12,
                        marginTop: 8,
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div className="row">
                          <Pill tone={LEVEL_TONE[finding.level]}>{LEVEL_LABEL[finding.level]}</Pill>
                          <Pill tone={finding.status === "open" ? "warn" : "ok"}>{finding.status}</Pill>
                          {overdue && <Pill tone="danger">overdue</Pill>}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>{finding.description}</div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                        {finding.corrective_action || "No corrective action recorded yet"}
                      </div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                        Owner: {finding.owner ?? "—"} · Due:{" "}
                        {finding.due_date ? new Date(finding.due_date).toLocaleDateString("en-GB") : "—"}
                      </div>
                      {finding.status === "open" && (
                        <div className="row" style={{ marginTop: 8 }}>
                          <button
                            className="btn ghost"
                            disabled={busyId === finding.id || !canClose}
                            title={!canClose ? "Record a corrective action before closing — 145.A.65" : undefined}
                            onClick={() => closeFinding(finding, audit.audit_ref)}
                          >
                            Close finding
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })
      )}
    </>
  );
}
