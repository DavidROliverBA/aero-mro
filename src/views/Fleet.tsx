import { useEffect, useState } from "react";
import type { Store, Tab } from "../App";
import { supabase } from "../lib/supabase";
import { logAudit } from "../lib/audit";
import { assessDamagePhoto, hasApiKey, type DamageAssessment } from "../lib/ai";
import { statusPill, Pill, EntityLink, EmptyState } from "../components/ui";
import DamageSchematic, { damageTone } from "../components/DamageSchematic";
import { mpDue, type DueItem, type Tone } from "../lib/compliance";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TONE_RANK: Record<Tone, number> = { danger: 0, warn: 1, ok: 2 };
const DAMAGE_TYPES = ["dent", "scratch", "corrosion", "lightning strike", "buckle", "delamination"];

export default function Fleet({
  store,
  go,
  focus,
  reload,
}: {
  store: Store;
  go: (t: Tab, focusId?: string) => void;
  focus: string | null;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(focus);
  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);

  // Damage add-flow state
  const [addMode, setAddMode] = useState(false);
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedDamage, setSelectedDamage] = useState<string | null>(null);
  const [dType, setDType] = useState("dent");
  const [dStation, setDStation] = useState("");
  const [dDims, setDDims] = useState({ l: "", w: "", d: "" });
  const [dWithin, setDWithin] = useState(true);
  const [dSrm, setDSrm] = useState("");
  const [dBy, setDBy] = useState("");
  const [dNotes, setDNotes] = useState("");
  // AI photo-assessment state (proposal only — see applyAiProposal below)
  const [aiPhoto, setAiPhoto] = useState<{ mediaType: string; base64: string; previewUrl: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<DamageAssessment | null>(null);
  // Photo add-flow state
  const [pUrl, setPUrl] = useState("");
  const [pCaption, setPCaption] = useState("");
  const [busy, setBusy] = useState<"damage" | "photo" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const ac = selected ? store.aircraftById.get(selected) : undefined;
  const acDamage = ac ? store.damage.filter((d) => d.aircraft_id === ac.id) : [];
  const acPhotos = ac ? store.photos.filter((p) => p.aircraft_id === ac.id) : [];

  function pick(id: string) {
    setSelected(id);
    setSelectedDamage(null);
    setAddMode(false);
    setPendingPos(null);
    setMsg(null);
    resetAiAssessment();
  }

  function resetAiAssessment() {
    setAiPhoto(null);
    setAiBusy(false);
    setAiError(null);
    setAiResult(null);
  }

  function resetDamageForm() {
    setAddMode(false);
    setPendingPos(null);
    setDType("dent");
    setDStation("");
    setDDims({ l: "", w: "", d: "" });
    setDWithin(true);
    setDSrm("");
    setDBy("");
    setDNotes("");
    resetAiAssessment();
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAiError(null);
    setAiResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        setAiError("Could not read that image file.");
        return;
      }
      setAiPhoto({ mediaType: match[1], base64: match[2], previewUrl: dataUrl });
    };
    reader.onerror = () => setAiError("Could not read that image file.");
    reader.readAsDataURL(file);
  }

  async function runPhotoAssessment() {
    if (!ac || !aiPhoto) return;
    setAiBusy(true);
    setAiError(null);
    try {
      setAiResult(
        await assessDamagePhoto(aiPhoto.base64, aiPhoto.mediaType, {
          registration: ac.registration,
          type: ac.type_designator,
        }),
      );
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  // RED LINE: within_limits is a licence-holder airworthiness determination
  // (Part-145 / EASA NPA 2025-07), not something a photo assessment can make.
  // This deliberately copies type/station/dimensions but never touches
  // dWithin — the checkbox stays wherever the engineer left it, and the AI's
  // within_limits_suggestion is only ever displayed beside it as advice.
  function applyAiProposal() {
    if (!aiResult) return;
    setDType(aiResult.damage_type);
    if (aiResult.station) setDStation(aiResult.station);
    setDDims({
      l: aiResult.length_mm != null ? String(aiResult.length_mm) : "",
      w: aiResult.width_mm != null ? String(aiResult.width_mm) : "",
      d: aiResult.depth_mm != null ? String(aiResult.depth_mm) : "",
    });
  }

  async function saveDamage() {
    if (!ac || !pendingPos) return;
    if (!dBy.trim()) return setMsg("Recorded by is required.");
    setBusy("damage");
    setMsg(null);
    try {
      const { error } = await supabase.from("damage_records").insert({
        aircraft_id: ac.id,
        pos_x: pendingPos.x,
        pos_y: pendingPos.y,
        damage_type: dType,
        station: dStation.trim() || null,
        length_mm: dDims.l ? Number(dDims.l) : null,
        width_mm: dDims.w ? Number(dDims.w) : null,
        depth_mm: dDims.d ? Number(dDims.d) : null,
        within_limits: dWithin,
        srm_ref: dSrm.trim() || null,
        status: "open",
        recorded_by: dBy.trim(),
        notes: dNotes.trim() || null,
      });
      if (error) throw error;
      await logAudit(
        "damage_records",
        "Damage recorded",
        dBy.trim(),
        `${ac.registration}: ${dType} at ${dStation.trim() || `(${pendingPos.x}, ${pendingPos.y})`}${dWithin ? "" : " — BEYOND SRM LIMITS"}`,
      );
      resetDamageForm();
      await reload();
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto() {
    if (!ac || !pUrl.trim().startsWith("https://")) return setMsg("Photo URL must start with https://");
    setBusy("photo");
    setMsg(null);
    try {
      const { error } = await supabase.from("aircraft_photos").insert({
        aircraft_id: ac.id,
        url: pUrl.trim(),
        caption: pCaption.trim() || null,
        added_by: "Fleet records",
      });
      if (error) throw error;
      await logAudit("aircraft_photos", "Photo added", "Fleet records", `${ac.registration}: ${pCaption.trim() || pUrl.trim().slice(0, 60)}`);
      setPUrl("");
      setPCaption("");
      await reload();
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function sectorsLast7Days(aircraftId: string): number {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return store.flights.filter(
      (f) => f.aircraft_id === aircraftId && new Date(f.flight_date).getTime() >= cutoff,
    ).length;
  }

  function worstDue(aircraftId: string): DueItem | null {
    const items = store.mpCompliance
      .filter((c) => c.aircraft_id === aircraftId)
      .map((c) => {
        const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
        const a = store.aircraftById.get(aircraftId);
        return task && a ? mpDue(task, c, a) : null;
      })
      .filter((x): x is DueItem => x !== null);
    if (items.length === 0) return null;
    items.sort((a, b) => {
      if (TONE_RANK[a.tone] !== TONE_RANK[b.tone]) return TONE_RANK[a.tone] - TONE_RANK[b.tone];
      const marginsA = [a.remainingDays, a.remainingFh, a.remainingFc].filter((v): v is number => v !== null);
      const marginsB = [b.remainingDays, b.remainingFh, b.remainingFc].filter((v): v is number => v !== null);
      const minA = marginsA.length ? Math.min(...marginsA) : Infinity;
      const minB = marginsB.length ? Math.min(...marginsB) : Infinity;
      return minA - minB;
    });
    return items[0];
  }

  const selDamage = acDamage.find((d) => d.id === selectedDamage);

  return (
    <>
      <h1>Fleet</h1>
      <p className="subtitle">
        Registered aircraft, next scheduled maintenance, photos and dent &amp; buckle charts — select a tail for detail
      </p>

      {ac && (
        <div className="card" style={{ marginBottom: 18, borderColor: "var(--accent)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>
              {ac.registration} <span className="muted">· {ac.type_designator} · MSN {ac.msn}</span>
            </h2>
            <div className="row">
              {statusPill(ac.status)}
              <button className="btn ghost small" onClick={() => setSelected(null)} aria-label="Close aircraft detail">
                ✕ Close
              </button>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {Number(ac.total_hours).toLocaleString("en-GB")} FH · {ac.total_cycles.toLocaleString("en-GB")} FC · based {ac.base}
          </div>

          {msg && <div className="banner danger" style={{ marginTop: 10 }} role="alert">{msg}</div>}

          <h2 style={{ marginTop: 16 }}>Photos</h2>
          {acPhotos.length === 0 ? (
            <EmptyState>No photos on record for this tail</EmptyState>
          ) : (
            <div className="row" style={{ overflowX: "auto", flexWrap: "nowrap", alignItems: "flex-start" }}>
              {acPhotos.map((p) => (
                <figure key={p.id} style={{ margin: 0, flex: "0 0 auto" }}>
                  <img
                    src={p.url}
                    alt={p.caption ?? `${ac.registration} photo`}
                    loading="lazy"
                    style={{ height: 150, borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
                  />
                  <figcaption className="muted" style={{ fontSize: 11, maxWidth: 220, marginTop: 4 }}>
                    {p.caption}{p.credit ? ` — ${p.credit}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label htmlFor="ph-url">Add photo (https URL)</label>
              <input id="ph-url" value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="ph-cap">Caption</label>
              <input id="ph-cap" value={pCaption} onChange={(e) => setPCaption(e.target.value)} placeholder="e.g. Post-paint, Mar 2026" />
            </div>
            <button className="btn ghost" disabled={busy !== null || !pUrl.trim()} onClick={() => void addPhoto()}>
              {busy === "photo" ? "Adding…" : "Add photo"}
            </button>
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: 18 }}>
            <h2 style={{ margin: 0 }}>Dent &amp; buckle chart</h2>
            {!addMode ? (
              <button className="btn ghost small" onClick={() => { setAddMode(true); setSelectedDamage(null); setMsg(null); }}>
                + Mark new damage
              </button>
            ) : (
              <button className="btn ghost small" onClick={resetDamageForm}>Cancel</button>
            )}
          </div>
          {addMode && !pendingPos && (
            <div className="banner" style={{ marginTop: 8 }}>
              Click (or tap) the schematic at the damage location.
            </div>
          )}
          <DamageSchematic
            type={ac.type_designator}
            records={acDamage}
            selectedId={selectedDamage}
            onSelect={(d) => setSelectedDamage(d.id === selectedDamage ? null : d.id)}
            addMode={addMode && !pendingPos}
            onPlace={(x, y) => setPendingPos({ x, y })}
          />

          {addMode && pendingPos && (
            <fieldset style={{ marginTop: 6 }}>
              <legend>New damage at ({pendingPos.x}, {pendingPos.y})</legend>

              <div className="ai-box" style={{ marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Assess damage from photo</strong>
                  <span className="ai-tag">✨ AI photo assessment</span>
                </div>
                {!hasApiKey() ? (
                  <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    Add a Claude API key in Settings to assess damage photos with AI.
                  </p>
                ) : (
                  <>
                    <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelect}
                        aria-label="Photograph or choose a photo of the damage"
                      />
                      {aiPhoto && (
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={aiBusy}
                          onClick={() => void runPhotoAssessment()}
                        >
                          {aiBusy ? "Assessing…" : "✨ Assess with AI"}
                        </button>
                      )}
                    </div>
                    {aiPhoto && (
                      <img
                        src={aiPhoto.previewUrl}
                        alt="Selected damage photo preview"
                        style={{ height: 90, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginTop: 8 }}
                      />
                    )}
                    {aiError && (
                      <div className="banner danger" role="alert" style={{ marginTop: 8 }}>
                        {aiError}
                      </div>
                    )}
                    {aiResult && (
                      <div className="ai-out">
                        <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <Pill tone="info">{aiResult.damage_type}</Pill>
                          {aiResult.station && <Pill tone="muted">{aiResult.station}</Pill>}
                          <Pill tone={aiResult.confidence === "low" ? "danger" : aiResult.confidence === "medium" ? "warn" : "ok"}>
                            {aiResult.confidence} confidence
                          </Pill>
                        </div>
                        {aiResult.confidence === "low" && (
                          <div className="banner danger" role="alert">
                            Low confidence — this photo may not be good enough to assess reliably. Consider a
                            clearer photo (better angle, lighting, or a scale reference) or a physical inspection.
                          </div>
                        )}
                        <div style={{ marginBottom: 6 }}>
                          <strong>Proposed dimensions (L×W×D mm):</strong>{" "}
                          {aiResult.length_mm ?? "—"}×{aiResult.width_mm ?? "—"}×{aiResult.depth_mm ?? "—"}
                        </div>
                        <div style={{ marginBottom: 6 }}>{aiResult.reasoning}</div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>Recommended action:</strong> {aiResult.recommended_action}
                        </div>
                        <div className="row" style={{ marginTop: 4 }}>
                          <button type="button" className="btn ghost small" onClick={applyAiProposal}>
                            Use these values in the form below
                          </button>
                        </div>
                        <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                          ✨ AI-generated proposal from a photograph, not a determination — check every value
                          before saving. Position on the schematic stays as you placed it; whether the damage is
                          within SRM limits is for you to decide below (see the AI's suggestion beside that
                          control).
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="row" style={{ alignItems: "flex-end" }}>
                <div style={{ minWidth: 140 }}>
                  <label htmlFor="dm-type">Type</label>
                  <select id="dm-type" value={dType} onChange={(e) => setDType(e.target.value)}>
                    {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label htmlFor="dm-station">Station / zone</label>
                  <input id="dm-station" value={dStation} onChange={(e) => setDStation(e.target.value)} placeholder="e.g. FR34, stringer S-12L" />
                </div>
                <div style={{ minWidth: 90 }}>
                  <label htmlFor="dm-l">L (mm)</label>
                  <input id="dm-l" inputMode="numeric" value={dDims.l} onChange={(e) => setDDims({ ...dDims, l: e.target.value })} />
                </div>
                <div style={{ minWidth: 90 }}>
                  <label htmlFor="dm-w">W (mm)</label>
                  <input id="dm-w" inputMode="numeric" value={dDims.w} onChange={(e) => setDDims({ ...dDims, w: e.target.value })} />
                </div>
                <div style={{ minWidth: 90 }}>
                  <label htmlFor="dm-d">Depth (mm)</label>
                  <input id="dm-d" inputMode="decimal" value={dDims.d} onChange={(e) => setDDims({ ...dDims, d: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
                <div style={{ minWidth: 140 }}>
                  <label htmlFor="dm-srm">SRM reference</label>
                  <input id="dm-srm" value={dSrm} onChange={(e) => setDSrm(e.target.value)} placeholder="SRM 53-11-01" />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label htmlFor="dm-by">Recorded by</label>
                  <input id="dm-by" value={dBy} onChange={(e) => setDBy(e.target.value)} placeholder="Name (licence no)" />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                  <input type="checkbox" checked={dWithin} onChange={(e) => setDWithin(e.target.checked)} style={{ width: "auto", minHeight: "auto" }} />
                  Within SRM limits
                </label>
                {aiResult && (
                  // Advisory only — see the RED LINE comment on applyAiProposal. The
                  // checkbox above is never set from this; the engineer sets it.
                  <span className="muted" style={{ fontSize: 11, maxWidth: 260 }} title={aiResult.reasoning}>
                    ✨ AI suggestion (advisory, not applied):{" "}
                    {aiResult.within_limits_suggestion === null
                      ? "cannot say from this photo"
                      : aiResult.within_limits_suggestion
                        ? "appears within limits"
                        : "appears beyond limits"}
                  </span>
                )}
                <button className="btn" disabled={busy !== null} onClick={() => void saveDamage()}>
                  {busy === "damage" ? "Saving…" : "Record damage"}
                </button>
              </div>
              <label htmlFor="dm-notes">Notes</label>
              <textarea id="dm-notes" value={dNotes} onChange={(e) => setDNotes(e.target.value)} style={{ minHeight: 50 }} />
            </fieldset>
          )}

          {acDamage.length === 0 ? (
            <EmptyState>No recorded structural damage — clean airframe ✔</EmptyState>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>Type</th><th>Station</th><th>Size (L×W×D mm)</th><th>SRM</th><th>Limits</th><th>Status</th><th>Recorded</th></tr>
                </thead>
                <tbody>
                  {acDamage.map((d, i) => (
                    <tr
                      key={d.id}
                      className={d.id === selectedDamage ? "row-focus" : ""}
                      onClick={() => setSelectedDamage(d.id === selectedDamage ? null : d.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td><strong>{i + 1}</strong></td>
                      <td>{d.damage_type}</td>
                      <td className="muted">{d.station ?? "—"}</td>
                      <td>{d.length_mm ?? "—"}×{d.width_mm ?? "—"}×{d.depth_mm ?? "—"}</td>
                      <td className="muted">{d.srm_ref ?? "—"}</td>
                      <td>{d.within_limits ? <Pill tone="ok">within</Pill> : <Pill tone="danger">beyond</Pill>}</td>
                      <td><Pill tone={damageTone(d)}>{d.status}</Pill></td>
                      <td className="muted">{new Date(d.recorded_at).toLocaleDateString("en-GB")} · {d.recorded_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selDamage?.notes && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              <strong>#{acDamage.findIndex((d) => d.id === selDamage.id) + 1} notes:</strong> {selDamage.notes}
            </p>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Type</th>
              <th>MSN</th>
              <th>Base</th>
              <th>FH</th>
              <th>FC</th>
              <th>Status</th>
              <th>Sectors (7d)</th>
              <th>Damage</th>
              <th>Next programme due</th>
              <th>Open defects</th>
            </tr>
          </thead>
          <tbody>
            {store.aircraft.map((a) => {
              const defects = store.defects.filter((d) => d.aircraft_id === a.id && d.status !== "closed");
              const due = worstDue(a.id);
              const dmg = store.damage.filter((d) => d.aircraft_id === a.id);
              const dmgBad = dmg.some((d) => damageTone(d) === "danger");
              return (
                <tr
                  key={a.id}
                  className={(focus ?? selected) === a.id ? "row-focus" : ""}
                  onClick={() => pick(a.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td><strong>{a.registration}</strong></td>
                  <td>{a.type_designator}</td>
                  <td className="muted">{a.msn}</td>
                  <td>{a.base}</td>
                  <td>{Number(a.total_hours).toLocaleString("en-GB")}</td>
                  <td>{a.total_cycles.toLocaleString("en-GB")}</td>
                  <td>{statusPill(a.status)}</td>
                  <td>
                    <EntityLink onClick={() => go("techlog", a.id)} title="Open tech log for this aircraft">
                      {sectorsLast7Days(a.id)}
                    </EntityLink>
                  </td>
                  <td>
                    {dmg.length ? (
                      <Pill tone={dmgBad ? "danger" : "warn"}>{dmg.length}</Pill>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td>
                    {due ? (
                      <>
                        {due.task.title} <Pill tone={due.tone}>{due.limitingLabel}</Pill>
                      </>
                    ) : a.next_check_type && a.next_check_due ? (
                      <span className="muted">
                        {a.next_check_type} · {new Date(a.next_check_due + "T00:00:00").toLocaleDateString("en-GB")}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {defects.length ? (
                      <EntityLink onClick={() => go("defects", defects[0].id)} title="View defects">
                        <Pill tone="warn">{defects.length}</Pill>
                      </EntityLink>
                    ) : (
                      <span className="muted">0</span>
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
