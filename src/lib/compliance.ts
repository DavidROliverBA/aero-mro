// Regulatory helper logic — the rules that make this an MRO system rather than
// a generic CRUD app. Kept pure and unit-testable.

import type {
  AdCompliance,
  Aircraft,
  AirworthinessDirective,
  Defect,
  Engineer,
  LlpComponent,
  MpCompliance,
  MpTask,
  RosterEntry,
  TaskCard,
  Tool,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;

// Format a Date as YYYY-MM-DD in LOCAL time. toISOString() renders UTC, which
// shifts local-midnight dates back a day on UTC+ timezones (e.g. BST).
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// YYYY-MM-DD for today + offset days, DST-safe (calendar arithmetic, not ms).
export function localIsoOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localIso(d);
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((target - today) / DAY);
}

// MMEL rectification interval maximums (calendar days) per EASA/CAA MEL categories.
export const MEL_MAX_DAYS: Record<string, number> = { A: 0, B: 3, C: 10, D: 120 };

export interface MelClock {
  label: string;
  daysRemaining: number | null;
  breached: boolean;
  tone: "ok" | "warn" | "danger";
}

export function melClock(defect: Defect): MelClock | null {
  if (defect.status !== "deferred" || !defect.mel_cat) return null;
  const d = daysUntil(defect.deferred_until);
  const breached = d !== null && d < 0;
  const tone: MelClock["tone"] = breached ? "danger" : d !== null && d <= 3 ? "warn" : "ok";
  return {
    label: `MEL Cat ${defect.mel_cat} (max ${MEL_MAX_DAYS[defect.mel_cat]}d)`,
    daysRemaining: d,
    breached,
    tone,
  };
}

// Part-66: can this engineer certify a release for the given aircraft type?
export interface LicenceCheck {
  valid: boolean;
  reasons: string[];
}

export function checkCertifyingPrivilege(
  eng: Engineer,
  typeDesignator: string,
): LicenceCheck {
  const reasons: string[] = [];
  const expiryDays = daysUntil(eng.licence_expiry);
  if (expiryDays !== null && expiryDays < 0) reasons.push("Part-66 licence expired");
  if (!eng.company_auth) reasons.push("No Part-145 company authorisation");
  if (!eng.type_ratings.includes(typeDesignator))
    reasons.push(`No type rating for ${typeDesignator}`);
  const canCertify = eng.licence_categories.some((c) =>
    ["B1.1", "B1", "B1.3", "B2", "C"].includes(c),
  );
  if (!canCertify) reasons.push("No certifying category (B1/B2/C) held");
  return { valid: reasons.length === 0, reasons };
}

export interface AdAlert {
  ad: AirworthinessDirective;
  compliance: AdCompliance;
  daysRemaining: number | null;
  tone: "ok" | "warn" | "danger";
}

export function adAlert(ad: AirworthinessDirective, c: AdCompliance): AdAlert {
  const due = c.status === "repetitive_active" ? c.next_due : ad.compliance_by;
  const d = daysUntil(due);
  let tone: AdAlert["tone"] = "ok";
  if (c.status !== "complied" && c.status !== "not_applicable") {
    if (d !== null && d < 0) tone = "danger";
    else if (d !== null && d <= 14) tone = "warn";
  }
  return { ad, compliance: c, daysRemaining: d, tone };
}

export type Tone = "ok" | "warn" | "danger";

// ---------------------------------------------------------------------------
// Maintenance programme due list — FH / FC / calendar, whichever comes first.
// ---------------------------------------------------------------------------
export interface DueItem {
  task: MpTask;
  compliance: MpCompliance;
  aircraft: Aircraft;
  remainingFh: number | null;
  remainingFc: number | null;
  remainingDays: number | null;
  dueDate: string | null;
  limitingLabel: string; // which limit bites first, e.g. "49.5 FH"
  tone: Tone;
}

export function mpDue(task: MpTask, c: MpCompliance, ac: Aircraft): DueItem {
  const remainingFh =
    task.interval_fh !== null && c.last_done_fh !== null
      ? Number(c.last_done_fh) + Number(task.interval_fh) - Number(ac.total_hours)
      : null;
  const remainingFc =
    task.interval_fc !== null && c.last_done_fc !== null
      ? c.last_done_fc + task.interval_fc - ac.total_cycles
      : null;
  let remainingDays: number | null = null;
  let dueDate: string | null = null;
  if (task.interval_days !== null && c.last_done_date) {
    const due = new Date(c.last_done_date + "T00:00:00");
    due.setDate(due.getDate() + task.interval_days);
    dueDate = localIso(due);
    remainingDays = daysUntil(dueDate);
  }

  // The limiting parameter is whichever is proportionally most consumed;
  // approximate with the smallest normalised margin.
  // Normalised margin; a zero interval means "due at once", not "no limit".
  const norm = (remaining: number, interval: number) =>
    interval > 0 ? remaining / interval : remaining < 0 ? -1 : 0;
  const margins: { label: string; norm: number }[] = [];
  if (remainingFh !== null && task.interval_fh !== null)
    margins.push({ label: `${remainingFh.toFixed(1)} FH`, norm: norm(remainingFh, Number(task.interval_fh)) });
  if (remainingFc !== null && task.interval_fc !== null)
    margins.push({ label: `${remainingFc} FC`, norm: norm(remainingFc, task.interval_fc) });
  if (remainingDays !== null && task.interval_days !== null)
    margins.push({ label: `${remainingDays} days`, norm: norm(remainingDays, task.interval_days) });
  margins.sort((a, b) => a.norm - b.norm);
  const limiting = margins[0];

  let tone: Tone = "ok";
  if (limiting) {
    if (limiting.norm < 0) tone = "danger";
    else if (limiting.norm <= 0.1) tone = "warn";
  }
  return {
    task,
    compliance: c,
    aircraft: ac,
    remainingFh,
    remainingFc,
    remainingDays,
    dueDate,
    limitingLabel: limiting ? limiting.label : "no limit data",
    tone,
  };
}

// ---------------------------------------------------------------------------
// Life-limited parts — % life consumed against the most restrictive limit.
// ---------------------------------------------------------------------------
export interface LlpStatus {
  pctUsed: number;
  remainingLabel: string;
  tone: Tone;
}

export function llpStatus(llp: LlpComponent): LlpStatus {
  const pcts: { pct: number; remaining: string }[] = [];
  if (llp.limit_fc)
    pcts.push({
      pct: (llp.accumulated_fc / llp.limit_fc) * 100,
      remaining: `${llp.limit_fc - llp.accumulated_fc} FC remaining`,
    });
  if (llp.limit_fh)
    pcts.push({
      pct: (Number(llp.accumulated_fh) / Number(llp.limit_fh)) * 100,
      remaining: `${(Number(llp.limit_fh) - Number(llp.accumulated_fh)).toFixed(0)} FH remaining`,
    });
  pcts.sort((a, b) => b.pct - a.pct);
  const worst = pcts[0] ?? { pct: 0, remaining: "no limit set" };
  const tone: Tone = worst.pct >= 95 ? "danger" : worst.pct >= 85 ? "warn" : "ok";
  return { pctUsed: worst.pct, remainingLabel: worst.remaining, tone };
}

// ---------------------------------------------------------------------------
// Tooling — 145.A.40 calibration control.
// ---------------------------------------------------------------------------
export interface ToolCheck {
  label: string;
  tone: Tone;
  usable: boolean;
}

export function toolCheck(tool: Tool): ToolCheck {
  if (tool.condition === "quarantine")
    return { label: "Quarantined", tone: "danger", usable: false };
  const d = daysUntil(tool.calibration_due);
  if (d !== null && d < 0)
    return { label: `Calibration overdue ${-d}d`, tone: "danger", usable: false };
  if (d !== null && d <= 30)
    return { label: `Calibration due in ${d}d`, tone: "warn", usable: true };
  return { label: "Serviceable", tone: "ok", usable: true };
}

// ---------------------------------------------------------------------------
// Task-card sign-off gating — 145.A.45(e) / 145.A.48 independent inspection.
// ---------------------------------------------------------------------------
export interface CardGate {
  done: boolean; // fully signed off (incl. independent inspection if required)
  reason: string | null;
}

export function cardGate(card: TaskCard): CardGate {
  if (!card.completed_by || !card.completed_at)
    return { done: false, reason: "Not yet signed off by an engineer" };
  if (card.requires_inspection) {
    if (!card.inspected_by || !card.inspected_at)
      return { done: false, reason: "Awaiting independent inspection (145.A.48)" };
    if (card.inspected_by === card.completed_by)
      return { done: false, reason: "Inspector must be independent of the engineer who performed the task" };
  }
  return { done: true, reason: null };
}

// Everything blocking CRS issue on a set of task cards.
export function crsBlockers(cards: TaskCard[]): string[] {
  if (cards.length === 0) return ["Work order has no task cards"];
  return cards
    .map((c) => {
      const g = cardGate(c);
      return g.done ? null : `Card ${c.sequence} — ${g.reason}`;
    })
    .filter((r): r is string => r !== null);
}

// ---------------------------------------------------------------------------
// Reliability — chronic (repeat-offender) defect detection: 3+ defects on the
// same aircraft + ATA chapter inside a 90-day window.
// ---------------------------------------------------------------------------
export interface ChronicGroup {
  aircraftId: string;
  ataChapter: string;
  defects: Defect[];
}

export function chronicDefects(defects: Defect[], windowDays = 90, threshold = 3): ChronicGroup[] {
  const cutoff = Date.now() - windowDays * DAY;
  const groups = new Map<string, Defect[]>();
  for (const d of defects) {
    if (!d.ata_chapter) continue;
    if (new Date(d.raised_at).getTime() < cutoff) continue;
    const key = `${d.aircraft_id}|${d.ata_chapter}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()]
    .filter(([, ds]) => ds.length >= threshold)
    .map(([key, ds]) => {
      const [aircraftId, ataChapter] = key.split("|");
      return { aircraftId, ataChapter, defects: ds };
    })
    .sort((a, b) => b.defects.length - a.defects.length);
}

// Shelf-life check for stores (145.A.42).
export function shelfLife(expiry: string | null): { label: string; tone: Tone } | null {
  const d = daysUntil(expiry);
  if (d === null) return null;
  if (d < 0) return { label: `Shelf-life expired ${-d}d ago`, tone: "danger" };
  if (d <= 30) return { label: `Shelf-life expires in ${d}d`, tone: "warn" };
  return { label: `Shelf-life OK (${d}d)`, tone: "ok" };
}

// ---------------------------------------------------------------------------
// Workforce planning — 145.A.30 man-hour plan + certifying-coverage gaps.
// ---------------------------------------------------------------------------

// Productive maintenance hours per rostered shift (industry convention:
// roughly 75% of an 8h shift survives briefings, breaks and paperwork).
export const SHIFT_PRODUCTIVE_HOURS: Record<string, number> = {
  early: 6,
  late: 6,
  night: 5.5,
  off: 0,
  leave: 0,
  training: 0,
};

export const WORKING_SHIFTS = new Set(["early", "late", "night"]);

export interface BaseManHours {
  base: string;
  availableHrs: number; // rostered productive hours over the horizon
  backlogHrs: number; // est_hours of open task cards on aircraft at this base
  utilisationPct: number | null; // backlog / available
  tone: Tone;
}

export function baseManHours(
  base: string,
  roster: RosterEntry[],
  cards: TaskCard[],
  workOrders: { id: string; aircraft_id: string; status: string }[],
  aircraft: Aircraft[],
  horizonDays = 7,
): BaseManHours {
  const startStr = localIsoOffset(0);
  const endStr = localIsoOffset(horizonDays);
  const availableHrs = roster
    .filter((r) => r.base === base && r.duty_date >= startStr && r.duty_date < endStr)
    .reduce((sum, r) => sum + (SHIFT_PRODUCTIVE_HOURS[r.shift] ?? 0), 0);
  const baseAircraft = new Set(aircraft.filter((a) => a.base === base).map((a) => a.id));
  const openWoIds = new Set(
    workOrders.filter((w) => w.status !== "closed" && baseAircraft.has(w.aircraft_id)).map((w) => w.id),
  );
  const backlogHrs = cards
    .filter((c) => openWoIds.has(c.work_order_id) && c.status !== "complete" && c.status !== "inspected")
    .reduce((sum, c) => sum + Number(c.est_hours), 0);
  const utilisationPct = availableHrs > 0 ? (backlogHrs / availableHrs) * 100 : null;
  const tone: Tone =
    utilisationPct === null ? "danger" : utilisationPct > 100 ? "danger" : utilisationPct > 80 ? "warn" : "ok";
  return { base, availableHrs, backlogHrs, utilisationPct, tone };
}

export interface CoverageGap {
  date: string;
  base: string;
  typeDesignator: string;
  reason: string;
}

// For each of the next `horizonDays`, each base must have at least one rostered
// working engineer who can legally certify each aircraft type at that base.
export function coverageGaps(
  roster: RosterEntry[],
  engineers: Engineer[],
  aircraft: Aircraft[],
  horizonDays = 7,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const bases = [...new Set(aircraft.map((a) => a.base))];
  for (let i = 0; i < horizonDays; i++) {
    const date = localIsoOffset(i);
    for (const base of bases) {
      const types = [...new Set(aircraft.filter((a) => a.base === base).map((a) => a.type_designator))];
      const onDuty = roster
        .filter((r) => r.duty_date === date && r.base === base && WORKING_SHIFTS.has(r.shift))
        .map((r) => engineers.find((e) => e.id === r.engineer_id))
        .filter((e): e is Engineer => !!e);
      for (const type of types) {
        if (onDuty.length === 0) {
          gaps.push({ date, base, typeDesignator: type, reason: "no engineers rostered" });
          continue;
        }
        const covered = onDuty.some((e) => checkCertifyingPrivilege(e, type).valid);
        if (!covered) {
          const why = onDuty.length
            ? `on-duty staff cannot certify ${type} (${onDuty
                .map((e) => `${e.full_name.split(" ")[0]}: ${checkCertifyingPrivilege(e, type).reasons[0] ?? "ok"}`)
                .join("; ")})`
            : "no engineers rostered";
          gaps.push({ date, base, typeDesignator: type, reason: why });
        }
      }
    }
  }
  return gaps;
}

// Licence renewals falling due inside the horizon (default 90 days).
export function expiringLicences(engineers: Engineer[], horizonDays = 90): { engineer: Engineer; days: number }[] {
  return engineers
    .map((e) => ({ engineer: e, days: daysUntil(e.licence_expiry) }))
    .filter((x): x is { engineer: Engineer; days: number } => x.days !== null && x.days <= horizonDays)
    .sort((a, b) => a.days - b.days);
}
