// Regulatory helper logic — the rules that make this an MRO system rather than
// a generic CRUD app. Kept pure and unit-testable.

import type { AdCompliance, AirworthinessDirective, Defect, Engineer } from "./types";

const DAY = 24 * 60 * 60 * 1000;

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
