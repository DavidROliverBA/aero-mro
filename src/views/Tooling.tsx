import { useMemo, useState } from "react";
import type { Store } from "../App";
import { supabase } from "../lib/supabase";
import { daysUntil, toolCheck } from "../lib/compliance";
import { Pill, StatCard } from "../components/ui";

export default function Tooling({ store, reload }: { store: Store; reload: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overdue = useMemo(
    () =>
      store.tools.filter((t) => {
        const d = daysUntil(t.calibration_due);
        return d !== null && d < 0;
      }),
    [store.tools],
  );
  const quarantined = useMemo(() => store.tools.filter((t) => t.condition === "quarantine"), [store.tools]);
  // Same warn threshold as the sidebar badge — via toolCheck, not a local copy.
  const dueSoon = useMemo(
    () => store.tools.filter((t) => toolCheck(t).tone === "warn"),
    [store.tools],
  );

  async function quarantine(toolId: string) {
    const tool = store.tools.find((t) => t.id === toolId);
    if (!tool) return;
    setBusyId(toolId);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("tools").update({ condition: "quarantine" }).eq("id", toolId);
      if (e1) throw e1;
      await supabase.from("audit_log").insert({
        entity: "tools",
        action: "Tool quarantined",
        actor: "Tooling control",
        detail: `${tool.tool_no} ${tool.description} quarantined`,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function returnToService(toolId: string) {
    const tool = store.tools.find((t) => t.id === toolId);
    if (!tool) return;
    setBusyId(toolId);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("tools").update({ condition: "serviceable" }).eq("id", toolId);
      if (e1) throw e1;
      await supabase.from("audit_log").insert({
        entity: "tools",
        action: "Tool returned to service",
        actor: "Tooling control",
        detail: `${tool.tool_no} ${tool.description} returned to service`,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>Tooling</h1>
      <p className="subtitle">Calibrated tooling register — 145.A.40 control &amp; recall</p>

      {error && <div className="banner danger" role="alert">{error}</div>}

      <div className="grid" style={{ marginBottom: 20 }}>
        <StatCard label="Total tools" value={store.tools.length} />
        <StatCard label="Calibration overdue" value={overdue.length} tone={overdue.length > 0 ? "danger" : undefined} />
        <StatCard label="Quarantined" value={quarantined.length} tone={quarantined.length > 0 ? "danger" : undefined} />
        <StatCard label="Due within 30 days" value={dueSoon.length} tone={dueSoon.length > 0 ? "warn" : undefined} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tool no</th>
              <th>Description</th>
              <th>Location</th>
              <th>Assigned to</th>
              <th>Last calibrated</th>
              <th>Calibration due</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {store.tools.map((tool) => {
              const check = toolCheck(tool);
              const assigned = store.engineers.find((e) => e.id === tool.assigned_to);
              const overdueCal = tool.condition === "quarantine" && daysUntil(tool.calibration_due) !== null && (daysUntil(tool.calibration_due) as number) < 0;
              return (
                <tr key={tool.id}>
                  <td>{tool.tool_no}</td>
                  <td>{tool.description}</td>
                  <td>{tool.location}</td>
                  <td className="muted">{assigned?.full_name ?? "—"}</td>
                  <td>{tool.last_calibrated ? new Date(tool.last_calibrated).toLocaleDateString("en-GB") : "—"}</td>
                  <td>{tool.calibration_due ? new Date(tool.calibration_due).toLocaleDateString("en-GB") : "—"}</td>
                  <td>
                    <Pill tone={check.tone}>{check.label}</Pill>
                  </td>
                  <td>
                    {tool.condition === "serviceable" ? (
                      <button className="btn ghost" disabled={busyId === tool.id} onClick={() => quarantine(tool.id)}>
                        Quarantine
                      </button>
                    ) : (
                      <button
                        className="btn ghost"
                        disabled={busyId === tool.id || overdueCal}
                        title={overdueCal ? "Cannot return to service — calibration overdue (145.A.40)" : undefined}
                        onClick={() => returnToService(tool.id)}
                      >
                        Return to service
                      </button>
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
