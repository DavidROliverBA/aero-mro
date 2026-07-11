// Mirrors the Supabase schema. Kept hand-written and small for the demo.

export type AircraftStatus =
  | "in_service"
  | "scheduled_maintenance"
  | "aog"
  | "stored";

export interface Aircraft {
  id: string;
  registration: string;
  type_designator: string;
  msn: string;
  operator: string;
  total_hours: number;
  total_cycles: number;
  status: AircraftStatus;
  base: string;
  next_check_type: string | null;
  next_check_due: string | null;
}

export interface Engineer {
  id: string;
  full_name: string;
  staff_no: string;
  part66_licence_no: string;
  licence_categories: string[];
  type_ratings: string[];
  licence_expiry: string;
  company_auth: boolean;
}

export interface Defect {
  id: string;
  aircraft_id: string;
  raised_at: string;
  raised_by: string;
  description: string;
  ata_chapter: string | null;
  mel_reference: string | null;
  mel_cat: "A" | "B" | "C" | "D" | null;
  severity: string;
  status: "open" | "deferred" | "closed";
  deferred_until: string | null;
  closed_at: string | null;
  ai_triaged: boolean;
}

export interface Part {
  id: string;
  part_number: string;
  serial_number: string | null;
  description: string;
  condition: "serviceable" | "unserviceable" | "scrap" | "quarantine";
  form1_ref: string | null;
  shelf_expiry: string | null;
  fitted_to: string | null;
  ata_chapter: string | null;
  location: string | null;
  quantity: number;
}

export interface WorkOrder {
  id: string;
  wo_number: string;
  aircraft_id: string;
  title: string;
  wo_type: "scheduled" | "unscheduled" | "ad_sb" | "mod";
  status: "open" | "in_progress" | "awaiting_parts" | "awaiting_crs" | "closed";
  opened_at: string;
  closed_at: string | null;
  source_defect: string | null;
}

export interface TaskCard {
  id: string;
  work_order_id: string;
  sequence: number;
  description: string;
  ata_chapter: string | null;
  status: "open" | "in_progress" | "complete" | "inspected";
  assigned_engineer: string | null;
  est_hours: number;
  requires_inspection: boolean;
  completed_by: string | null;
  completed_at: string | null;
  inspected_by: string | null;
  inspected_at: string | null;
}

export interface AirworthinessDirective {
  id: string;
  ad_number: string;
  authority: string;
  applies_to_type: string;
  subject: string;
  effective_date: string;
  compliance_by: string | null;
  repetitive: boolean;
  interval_days: number | null;
}

export interface AdCompliance {
  id: string;
  ad_id: string;
  aircraft_id: string;
  status: "open" | "complied" | "not_applicable" | "repetitive_active";
  complied_at: string | null;
  next_due: string | null;
  work_order_id: string | null;
}

export interface Flight {
  id: string;
  aircraft_id: string;
  flight_no: string;
  flight_date: string;
  dep: string;
  arr: string;
  block_hours: number;
  cycles: number;
  captain: string;
  fuel_uplift_kg: number | null;
  oil_uplift_qt: number | null;
  status: "open" | "closed";
  remarks: string | null;
}

export interface Tool {
  id: string;
  tool_no: string;
  description: string;
  location: string;
  last_calibrated: string | null;
  calibration_due: string | null;
  condition: "serviceable" | "quarantine";
  assigned_to: string | null;
}

export interface MpTask {
  id: string;
  task_code: string;
  applies_to_type: string;
  title: string;
  ata_chapter: string | null;
  interval_fh: number | null;
  interval_fc: number | null;
  interval_days: number | null;
  source: string;
}

export interface MpCompliance {
  id: string;
  mp_task_id: string;
  aircraft_id: string;
  last_done_date: string | null;
  last_done_fh: number | null;
  last_done_fc: number | null;
  work_order_id: string | null;
}

export interface LlpComponent {
  id: string;
  aircraft_id: string;
  part_number: string;
  serial_number: string;
  description: string;
  position: string | null;
  limit_fc: number | null;
  limit_fh: number | null;
  accumulated_fc: number;
  accumulated_fh: number;
  installed_on: string | null;
}

export interface Audit {
  id: string;
  audit_ref: string;
  area: string;
  regulation_ref: string | null;
  audit_date: string;
  auditor: string;
  status: "planned" | "in_progress" | "closed";
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  level: "level_1" | "level_2" | "observation";
  description: string;
  corrective_action: string | null;
  owner: string | null;
  due_date: string | null;
  status: "open" | "closed";
  closed_at: string | null;
}
