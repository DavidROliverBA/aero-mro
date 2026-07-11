// Executes assistant-proposed actions AFTER human confirmation, and builds the
// compact data snapshot the assistant reasons over. Every confirmed action is
// written to the audit log attributed "via AI assistant (confirmed by <user>)".

import { supabase } from "./supabase";
import type { ProposedAction } from "./ai";
import type { Store } from "../App";

// Short refs keep the snapshot small and give the model stable handles.
const ref = (id: string) => id.slice(0, 8);

export function buildSnapshot(store: Store): string {
  return JSON.stringify({
    today: new Date().toISOString().slice(0, 10),
    aircraft: store.aircraft.map((a) => ({
      reg: a.registration, type: a.type_designator, status: a.status, base: a.base,
      fh: a.total_hours, fc: a.total_cycles, next_check: a.next_check_type, next_check_due: a.next_check_due,
    })),
    engineers: store.engineers.map((e) => ({
      name: e.full_name, staff_no: e.staff_no, licence: e.part66_licence_no,
      cats: e.licence_categories, ratings: e.type_ratings, expiry: e.licence_expiry, company_auth: e.company_auth,
    })),
    defects: store.defects.map((d) => ({
      ref: ref(d.id), reg: store.aircraft.find((a) => a.id === d.aircraft_id)?.registration,
      desc: d.description, ata: d.ata_chapter, severity: d.severity, status: d.status,
      mel: d.mel_reference, mel_cat: d.mel_cat, deferred_until: d.deferred_until, raised: d.raised_at.slice(0, 10),
    })),
    work_orders: store.workOrders.map((w) => ({
      wo: w.wo_number, reg: store.aircraft.find((a) => a.id === w.aircraft_id)?.registration,
      title: w.title, type: w.wo_type, status: w.status,
      cards: store.taskCards.filter((t) => t.work_order_id === w.id).map((t) => ({
        seq: t.sequence, desc: t.description, status: t.status,
        signed: !!t.completed_by, inspected: !!t.inspected_by, needs_inspection: t.requires_inspection,
      })),
    })),
    flights: store.flights.map((f) => ({
      reg: store.aircraft.find((a) => a.id === f.aircraft_id)?.registration,
      no: f.flight_no, date: f.flight_date, sector: `${f.dep}-${f.arr}`, fh: f.block_hours, status: f.status,
    })),
    parts: store.parts.map((p) => ({
      pn: p.part_number, sn: p.serial_number, desc: p.description, condition: p.condition,
      form1: p.form1_ref, shelf_expiry: p.shelf_expiry, location: p.location, qty: p.quantity,
    })),
    tools: store.tools.map((t) => ({
      no: t.tool_no, desc: t.description, location: t.location, condition: t.condition, cal_due: t.calibration_due,
    })),
    maintenance_programme: store.mpCompliance.map((c) => {
      const task = store.mpTasks.find((t) => t.id === c.mp_task_id);
      return {
        code: task?.task_code, title: task?.title,
        reg: store.aircraft.find((a) => a.id === c.aircraft_id)?.registration,
        interval: { fh: task?.interval_fh, fc: task?.interval_fc, days: task?.interval_days },
        last_done: { date: c.last_done_date, fh: c.last_done_fh, fc: c.last_done_fc },
      };
    }),
    llps: store.llps.map((l) => ({
      reg: store.aircraft.find((a) => a.id === l.aircraft_id)?.registration,
      pn: l.part_number, sn: l.serial_number, desc: l.description,
      limit_fc: l.limit_fc, acc_fc: l.accumulated_fc, limit_fh: l.limit_fh, acc_fh: l.accumulated_fh,
    })),
    directives: store.directives.map((ad) => ({
      ad: ad.ad_number, type: ad.applies_to_type, subject: ad.subject, by: ad.compliance_by,
      repetitive: ad.repetitive,
      per_aircraft: store.adCompliance.filter((c) => c.ad_id === ad.id).map((c) => ({
        reg: store.aircraft.find((a) => a.id === c.aircraft_id)?.registration,
        status: c.status, next_due: c.next_due,
      })),
    })),
    roster: store.roster.map((r) => {
      const eng = store.engineers.find((e) => e.id === r.engineer_id);
      return { staff_no: eng?.staff_no, name: eng?.full_name, date: r.duty_date, shift: r.shift, base: r.base };
    }),
    audits: store.audits.map((a) => ({
      ref: a.audit_ref, area: a.area, reg_ref: a.regulation_ref, date: a.audit_date, status: a.status,
      findings: store.auditFindings.filter((f) => f.audit_id === a.id).map((f) => ({
        level: f.level, desc: f.description, status: f.status, due: f.due_date,
      })),
    })),
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

// Rolls sector hours/cycles onto the airframe. Reads the aircraft fresh from
// the DB first, so rapid successive closes don't overwrite each other with
// stale absolute totals (the React store lags behind writes).
export async function rollOntoAircraft(
  aircraftId: string,
  hours: number,
  cycles: number,
): Promise<{ totalHours: number; totalCycles: number }> {
  const { data, error } = await supabase
    .from("aircraft")
    .select("total_hours,total_cycles")
    .eq("id", aircraftId)
    .single();
  if (error) throw error;
  const totalHours = Number(data.total_hours) + hours;
  const totalCycles = data.total_cycles + cycles;
  const { error: e2 } = await supabase
    .from("aircraft")
    .update({ total_hours: totalHours, total_cycles: totalCycles })
    .eq("id", aircraftId);
  if (e2) throw e2;
  return { totalHours, totalCycles };
}

// Human-readable one-liner for the confirmation card.
export function describeAction(a: ProposedAction): string {
  const i = a.input;
  switch (a.tool) {
    case "create_defect":
      return `Raise ${str(i.severity)} defect on ${str(i.aircraft_reg)}: “${str(i.description)}”`;
    case "create_work_order":
      return `Open ${str(i.wo_type)} work order on ${str(i.aircraft_reg)}: “${str(i.title)}”`;
    case "add_task_card":
      return `Add task card to ${str(i.wo_number)}: “${str(i.description)}”${i.requires_inspection ? " (independent inspection required)" : ""}`;
    case "record_flight":
      return `Record sector ${str(i.flight_no)} ${str(i.dep)}→${str(i.arr)} on ${str(i.aircraft_reg)} (${str(i.block_hours)} FH)`;
    case "update_aircraft_status":
      return `Set ${str(i.aircraft_reg)} status to ${str(i.status).replace(/_/g, " ")} — ${str(i.reason)}`;
    case "set_roster":
      return `Roster ${str(i.engineer_staff_no)} as ${str(i.shift)} at ${str(i.base)} on ${str(i.date)}`;
    default:
      return `${a.tool}(${JSON.stringify(i)})`;
  }
}

export async function executeAction(
  a: ProposedAction,
  store: Store,
  confirmedBy: string,
): Promise<string> {
  const i = a.input;
  const findAircraft = () => {
    const ac = store.aircraft.find(
      (x) => x.registration.toLowerCase() === str(i.aircraft_reg).toLowerCase(),
    );
    if (!ac) throw new Error(`Unknown aircraft registration ${str(i.aircraft_reg)}`);
    return ac;
  };
  const audit = (action: string, detail: string) =>
    supabase.from("audit_log").insert({
      entity: a.tool,
      action,
      actor: `AI assistant (confirmed by ${confirmedBy})`,
      detail,
    });

  switch (a.tool) {
    case "create_defect": {
      const ac = findAircraft();
      const { error } = await supabase.from("defects").insert({
        aircraft_id: ac.id,
        raised_by: str(i.raised_by),
        description: str(i.description),
        ata_chapter: i.ata_chapter ? str(i.ata_chapter) : null,
        severity: str(i.severity),
        status: "open",
        ai_triaged: false,
      });
      if (error) throw error;
      await audit("Defect raised", `${ac.registration}: ${str(i.description)}`);
      return `Defect raised on ${ac.registration}.`;
    }
    case "create_work_order": {
      const ac = findAircraft();
      // Number from a fresh query, not the possibly-stale store, to avoid
      // duplicate WO numbers when several are created between reloads.
      const { data: latest, error: eNum } = await supabase
        .from("work_orders")
        .select("wo_number")
        .order("wo_number", { ascending: false })
        .limit(1);
      if (eNum) throw eNum;
      const next = parseInt(latest?.[0]?.wo_number.split("-").pop() ?? "0", 10) + 1;
      const woNumber = `WO-${new Date().getFullYear()}-${String(next).padStart(4, "0")}`;
      let sourceDefect: string | null = null;
      if (i.source_defect_ref) {
        sourceDefect =
          store.defects.find((d) => d.id.startsWith(str(i.source_defect_ref)))?.id ?? null;
      }
      const { error } = await supabase.from("work_orders").insert({
        wo_number: woNumber,
        aircraft_id: ac.id,
        title: str(i.title),
        wo_type: str(i.wo_type),
        status: "open",
        source_defect: sourceDefect,
      });
      if (error) throw error;
      await audit("Work order opened", `${woNumber} on ${ac.registration}: ${str(i.title)}`);
      return `${woNumber} opened on ${ac.registration}.`;
    }
    case "add_task_card": {
      const wo = store.workOrders.find((w) => w.wo_number === str(i.wo_number));
      if (!wo) throw new Error(`Unknown work order ${str(i.wo_number)}`);
      // Sequence from a fresh query — two cards confirmed before a reload
      // would otherwise both compute the same number from the stale store.
      const { data: maxSeq, error: eSeq } = await supabase
        .from("task_cards")
        .select("sequence")
        .eq("work_order_id", wo.id)
        .order("sequence", { ascending: false })
        .limit(1);
      if (eSeq) throw eSeq;
      const seq = (maxSeq?.[0]?.sequence ?? 0) + 1;
      const { error } = await supabase.from("task_cards").insert({
        work_order_id: wo.id,
        sequence: seq,
        description: str(i.description),
        ata_chapter: i.ata_chapter ? str(i.ata_chapter) : null,
        status: "open",
        est_hours: typeof i.est_hours === "number" ? i.est_hours : 1,
        requires_inspection: i.requires_inspection === true,
      });
      if (error) throw error;
      await audit("Task card added", `${wo.wo_number} card ${seq}: ${str(i.description)}`);
      return `Card ${seq} added to ${wo.wo_number}.`;
    }
    case "record_flight": {
      const ac = findAircraft();
      const hours = Number(i.block_hours);
      const { error } = await supabase.from("flights").insert({
        aircraft_id: ac.id,
        flight_no: str(i.flight_no),
        flight_date: str(i.flight_date),
        dep: str(i.dep).toUpperCase(),
        arr: str(i.arr).toUpperCase(),
        block_hours: hours,
        cycles: 1,
        captain: str(i.captain),
        status: "closed",
        remarks: i.remarks ? str(i.remarks) : null,
      });
      if (error) throw error;
      // Closed sectors roll hours/cycles onto the airframe.
      const { totalHours, totalCycles } = await rollOntoAircraft(ac.id, hours, 1);
      await audit("Tech log sector recorded", `${str(i.flight_no)} ${str(i.dep)}-${str(i.arr)} on ${ac.registration}, ${hours} FH`);
      return `Sector recorded — ${ac.registration} now ${totalHours.toFixed(1)} FH / ${totalCycles} FC.`;
    }
    case "update_aircraft_status": {
      const ac = findAircraft();
      const { error } = await supabase
        .from("aircraft")
        .update({ status: str(i.status) })
        .eq("id", ac.id);
      if (error) throw error;
      await audit("Aircraft status changed", `${ac.registration} → ${str(i.status)}: ${str(i.reason)}`);
      return `${ac.registration} status set to ${str(i.status).replace(/_/g, " ")}.`;
    }
    case "set_roster": {
      const eng = store.engineers.find(
        (e) => e.staff_no.toLowerCase() === str(i.engineer_staff_no).toLowerCase(),
      );
      if (!eng) throw new Error(`Unknown engineer staff no ${str(i.engineer_staff_no)}`);
      const { error } = await supabase.from("roster_entries").upsert(
        {
          engineer_id: eng.id,
          duty_date: str(i.date),
          shift: str(i.shift),
          base: str(i.base).toUpperCase(),
        },
        { onConflict: "engineer_id,duty_date" },
      );
      if (error) throw error;
      await audit(
        "Roster amended",
        `${eng.full_name} (${eng.staff_no}) → ${str(i.shift)} at ${str(i.base).toUpperCase()} on ${str(i.date)}`,
      );
      return `Roster updated — ${eng.full_name} is ${str(i.shift)} at ${str(i.base).toUpperCase()} on ${str(i.date)}.`;
    }
    default:
      throw new Error(`Unknown action ${a.tool}`);
  }
}
