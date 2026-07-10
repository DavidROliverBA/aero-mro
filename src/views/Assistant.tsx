import { useState } from "react";
import type { Store } from "../App";
import { askAssistant } from "../lib/ai";

const SUGGESTED = [
  "Which aircraft are AOG and why?",
  "Are any Part-66 licences expired or expiring soon?",
  "Which MEL deferrals are closest to their deadline?",
  "Summarise outstanding AD compliance across the fleet.",
  "Which work orders are awaiting a CRS?",
];

// Build a compact JSON snapshot for the model. We denormalise names so the
// assistant doesn't have to resolve foreign keys.
function snapshot(store: Store): string {
  const acName = (id: string) => store.aircraft.find((a) => a.id === id)?.registration ?? id;
  return JSON.stringify(
    {
      aircraft: store.aircraft.map((a) => ({
        reg: a.registration,
        type: a.type_designator,
        status: a.status,
        base: a.base,
        hours: a.total_hours,
        next_check: `${a.next_check_type} due ${a.next_check_due}`,
      })),
      defects: store.defects.map((d) => ({
        aircraft: acName(d.aircraft_id),
        description: d.description,
        ata: d.ata_chapter,
        severity: d.severity,
        status: d.status,
        mel_cat: d.mel_cat,
        deferred_until: d.deferred_until,
      })),
      engineers: store.engineers.map((e) => ({
        name: e.full_name,
        licence: e.part66_licence_no,
        categories: e.licence_categories,
        type_ratings: e.type_ratings,
        licence_expiry: e.licence_expiry,
        company_auth: e.company_auth,
      })),
      work_orders: store.workOrders.map((w) => ({
        number: w.wo_number,
        aircraft: acName(w.aircraft_id),
        title: w.title,
        type: w.wo_type,
        status: w.status,
      })),
      directives: store.directives.map((ad) => {
        const comp = store.adCompliance
          .filter((c) => c.ad_id === ad.id)
          .map((c) => ({ aircraft: acName(c.aircraft_id), status: c.status, next_due: c.next_due }));
        return { ad: ad.ad_number, authority: ad.authority, subject: ad.subject, compliance: comp };
      }),
    },
    null,
    0,
  );
}

export default function Assistant({
  store,
  keySet,
  onNeedKey,
}: {
  store: Store;
  keySet: boolean;
  onNeedKey: () => void;
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(question: string) {
    if (!keySet) return onNeedKey();
    if (!question.trim()) return;
    setBusy(true);
    setErr(null);
    setAnswer(null);
    try {
      setAnswer(await askAssistant(question, snapshot(store)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>AI Assistant</h1>
      <p className="subtitle">
        Ask questions in plain English about the live fleet. The assistant reasons over a snapshot of your
        current data — it never invents records.
      </p>

      <div className="ai-box">
        <label>Question</label>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Which aircraft can Priya Nair legally release to service?"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(q);
          }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => ask(q)} disabled={busy || !q.trim()}>
            {busy ? "Thinking…" : "Ask"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>⌘/Ctrl + Enter</span>
        </div>

        <div style={{ marginTop: 12 }} className="row">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              className="btn ghost"
              style={{ fontSize: 12, padding: "5px 10px" }}
              onClick={() => {
                setQ(s);
                ask(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {err && <div className="ai-out" style={{ color: "var(--danger)" }}>{err}</div>}
        {answer && (
          <div className="ai-out">
            <div className="ai-tag" style={{ marginBottom: 8 }}>✨ Claude · reasoning over live data</div>
            {answer}
          </div>
        )}
      </div>
    </>
  );
}
