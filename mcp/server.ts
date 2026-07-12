#!/usr/bin/env bun
// AeroMRO MCP server (stdio) — lets any MCP client (e.g. Claude Code) operate
// the MRO system through typed, compliance-aware tools instead of raw SQL.
//
// Same red lines as the in-app assistant: management/query tools only. Task
// sign-off, independent inspection, CRS, deferral and quarantine are
// licence-holder acts and have no tool here. Every write is audit-logged as
// "MCP (Claude Code)". The MCP client's own permission prompt is the
// human-confirmation step.
//
// Auth: runs server-side with the Supabase service_role key from .env.local
// (never shipped to the browser — no VITE_ prefix). RLS still protects the
// deployed app; this key exists only on this machine.

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  adAlert,
  coverageGaps,
  crsBlockers,
  expiringLicences,
  melClock,
  mpDue,
  shelfLife,
  toolCheck,
} from "../src/lib/compliance";
import type {
  AdCompliance,
  Aircraft,
  AirworthinessDirective,
  Defect,
  Engineer,
  MpCompliance,
  MpTask,
  RosterEntry,
  TaskCard,
  WorkOrder,
} from "../src/lib/types";

// ---------------------------------------------------------------------------
// Env: parse .env.local relative to this file so cwd doesn't matter.
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    // fall through to process.env
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const env = loadEnv();
const URL_ = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
if (!URL_ || !SERVICE_KEY) {
  console.error(
    "AeroMRO MCP: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local. " +
      "Add SUPABASE_SERVICE_KEY=<service_role key> (Supabase dashboard → Settings → API).",
  );
  process.exit(1);
}

const db = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

async function rows<T>(table: string, build?: (q: any) => any): Promise<T[]> {
  let q: any = db.from(table).select("*");
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function audit(entity: string, action: string, detail: string) {
  // Throw, never swallow: a silently dropped audit row is a hole in an
  // append-only evidence trail, which is worse than a failed write.
  const { error } = await db.from("audit_log").insert({ entity, action, actor: "MCP (Claude Code)", detail });
  if (error) throw new Error(`audit_log: ${error.message}`);
}

const text = (v: unknown) => ({
  content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }],
});

async function findAircraft(reg: string): Promise<Aircraft> {
  const list = await rows<Aircraft>("aircraft", (q) => q.ilike("registration", reg));
  if (!list[0]) throw new Error(`Unknown aircraft registration ${reg}`);
  return list[0];
}

// ---------------------------------------------------------------------------
const server = new McpServer({ name: "aeromro", version: "1.0.0" });

server.tool(
  "fleet_status",
  "Fleet overview: status, hours/cycles, open defects, worst maintenance-programme due item per aircraft.",
  {},
  async () => {
    const [aircraft, defects, mpTasks, mpCompliance] = await Promise.all([
      rows<Aircraft>("aircraft"),
      rows<Defect>("defects", (q) => q.neq("status", "closed")),
      rows<MpTask>("mp_tasks"),
      rows<MpCompliance>("mp_compliance"),
    ]);
    return text(
      aircraft.map((a) => {
        const due = mpCompliance
          .filter((c) => c.aircraft_id === a.id)
          .map((c) => {
            const t = mpTasks.find((x) => x.id === c.mp_task_id);
            return t ? mpDue(t, c, a) : null;
          })
          .filter((d) => d !== null)
          .sort((x, y) => ["danger", "warn", "ok"].indexOf(x!.tone) - ["danger", "warn", "ok"].indexOf(y!.tone))[0];
        return {
          reg: a.registration,
          type: a.type_designator,
          base: a.base,
          status: a.status,
          fh: Number(a.total_hours),
          fc: a.total_cycles,
          open_defects: defects.filter((d) => d.aircraft_id === a.id).length,
          next_due: due ? `${due.task.title} — ${due.limitingLabel} (${due.tone})` : null,
        };
      }),
    );
  },
);

server.tool(
  "open_defects",
  "All open/deferred defects with live MEL rectification clocks.",
  {},
  async () => {
    const [defects, aircraft] = await Promise.all([
      rows<Defect>("defects", (q) => q.neq("status", "closed").order("raised_at", { ascending: false })),
      rows<Aircraft>("aircraft"),
    ]);
    return text(
      defects.map((d) => {
        const clock = melClock(d);
        return {
          reg: aircraft.find((a) => a.id === d.aircraft_id)?.registration,
          description: d.description,
          ata: d.ata_chapter,
          severity: d.severity,
          status: d.status,
          mel: d.mel_reference ? `${d.mel_reference} Cat ${d.mel_cat}` : null,
          clock: clock
            ? clock.daysRemaining === null
              ? `NO RECTIFICATION DEADLINE SET (${clock.tone})`
              : `${clock.daysRemaining}d remaining (${clock.tone})`
            : null,
        };
      }),
    );
  },
);

server.tool(
  "due_list",
  "Maintenance-programme due list (FH/FC/calendar, whichever first) plus AD/SB compliance alerts.",
  {},
  async () => {
    const [aircraft, mpTasks, mpCompliance, ads, adc] = await Promise.all([
      rows<Aircraft>("aircraft"),
      rows<MpTask>("mp_tasks"),
      rows<MpCompliance>("mp_compliance"),
      rows<AirworthinessDirective>("airworthiness_directives"),
      rows<AdCompliance>("ad_compliance"),
    ]);
    const programme = mpCompliance
      .map((c) => {
        const t = mpTasks.find((x) => x.id === c.mp_task_id);
        const a = aircraft.find((x) => x.id === c.aircraft_id);
        return t && a ? mpDue(t, c, a) : null;
      })
      .filter((d) => d !== null)
      .map((d) => ({
        task: d!.task.task_code,
        title: d!.task.title,
        reg: d!.aircraft.registration,
        next_due: d!.limitingLabel,
        due_date: d!.dueDate,
        tone: d!.tone,
      }))
      .sort((x, y) => ["danger", "warn", "ok"].indexOf(x.tone) - ["danger", "warn", "ok"].indexOf(y.tone));
    const directives = adc
      .filter((c) => c.status !== "complied" && c.status !== "not_applicable")
      .map((c) => {
        const ad = ads.find((x) => x.id === c.ad_id)!;
        const alert = adAlert(ad, c);
        return {
          ad: ad.ad_number,
          subject: ad.subject,
          reg: aircraft.find((a) => a.id === c.aircraft_id)?.registration,
          days_remaining: alert.daysRemaining,
          tone: alert.tone,
        };
      });
    return text({ programme, directives });
  },
);

server.tool(
  "work_order_status",
  "Work orders with task cards, sign-off state, and anything blocking CRS issue.",
  { wo_number: z.string().optional().describe("Filter to one WO, e.g. WO-2026-0002") },
  async ({ wo_number }) => {
    const [wos, cards, engineers, aircraft] = await Promise.all([
      rows<WorkOrder>("work_orders", (q) => (wo_number ? q.eq("wo_number", wo_number) : q.neq("status", "closed"))),
      rows<TaskCard>("task_cards"),
      rows<Engineer>("engineers"),
      rows<Aircraft>("aircraft"),
    ]);
    const name = (id: string | null) => engineers.find((e) => e.id === id)?.full_name ?? null;
    return text(
      wos.map((w) => {
        const woCards = cards.filter((c) => c.work_order_id === w.id).sort((a, b) => a.sequence - b.sequence);
        return {
          wo: w.wo_number,
          title: w.title,
          reg: aircraft.find((a) => a.id === w.aircraft_id)?.registration,
          status: w.status,
          cards: woCards.map((c) => ({
            seq: c.sequence,
            description: c.description,
            status: c.status,
            signed_by: name(c.completed_by),
            inspected_by: name(c.inspected_by),
            needs_inspection: c.requires_inspection,
          })),
          crs_blockers: crsBlockers(woCards),
        };
      }),
    );
  },
);

server.tool(
  "coverage_and_staff",
  "Certifying-coverage gaps over the horizon plus licences expiring within 90 days.",
  { days: z.number().int().min(1).max(28).optional().describe("Horizon in days, default 7") },
  async ({ days }) => {
    const [roster, engineers, aircraft] = await Promise.all([
      rows<RosterEntry>("roster_entries"),
      rows<Engineer>("engineers"),
      rows<Aircraft>("aircraft"),
    ]);
    return text({
      coverage_gaps: coverageGaps(roster, engineers, aircraft, days ?? 7),
      expiring_licences: expiringLicences(engineers).map((x) => ({
        engineer: x.engineer.full_name,
        licence: x.engineer.part66_licence_no,
        days: x.days,
      })),
    });
  },
);

server.tool(
  "stores_and_tooling_alerts",
  "Shelf-life, quarantine and calibration issues across parts and tooling (145.A.40/42).",
  {},
  async () => {
    const [parts, tools] = await Promise.all([rows<any>("parts"), rows<any>("tools")]);
    return text({
      parts: parts
        .map((p) => ({ pn: p.part_number, desc: p.description, condition: p.condition, shelf: shelfLife(p.shelf_expiry)?.label ?? null, form1: p.form1_ref }))
        .filter((p) => p.condition !== "serviceable" || (p.shelf && !p.shelf.startsWith("Shelf-life OK")) || !p.form1),
      tools: tools
        .map((t) => ({ tool: t.tool_no, desc: t.description, check: toolCheck(t) }))
        .filter((t) => t.check.tone !== "ok"),
    });
  },
);

// --- Writes (audit-logged; MCP client permission prompt = human confirm) ----

server.tool(
  "raise_defect",
  "Raise a new defect against an aircraft.",
  {
    aircraft_reg: z.string(),
    description: z.string(),
    severity: z.enum(["minor", "major", "critical"]),
    ata_chapter: z.string().optional(),
    raised_by: z.string().describe("Who reported it"),
  },
  async (i) => {
    const ac = await findAircraft(i.aircraft_reg);
    const { error } = await db.from("defects").insert({
      aircraft_id: ac.id,
      raised_by: i.raised_by,
      description: i.description,
      ata_chapter: i.ata_chapter ?? null,
      severity: i.severity,
      status: "open",
      ai_triaged: false,
    });
    if (error) throw new Error(error.message);
    await audit("defects", "Defect raised", `${ac.registration}: ${i.description}`);
    return text(`Defect raised on ${ac.registration}.`);
  },
);

server.tool(
  "open_work_order",
  "Open a new work order on an aircraft (number allocated automatically).",
  {
    aircraft_reg: z.string(),
    title: z.string(),
    wo_type: z.enum(["scheduled", "unscheduled", "ad_sb", "mod"]),
  },
  async (i) => {
    const ac = await findAircraft(i.aircraft_reg);
    // wo_number allocated by the DB default (next_wo_number() sequence).
    const { data, error } = await db
      .from("work_orders")
      .insert({ aircraft_id: ac.id, title: i.title, wo_type: i.wo_type, status: "open" })
      .select("wo_number")
      .single();
    if (error) throw new Error(error.message);
    await audit("work_orders", "Work order opened", `${data.wo_number} on ${ac.registration}: ${i.title}`);
    return text(`${data.wo_number} opened on ${ac.registration}.`);
  },
);

server.tool(
  "add_task_card",
  "Append a task card to an existing work order.",
  {
    wo_number: z.string(),
    description: z.string(),
    ata_chapter: z.string().optional(),
    est_hours: z.number().positive().optional(),
    requires_inspection: z.boolean().optional().describe("true if flight-safety critical (145.A.48)"),
  },
  async (i) => {
    const wos = await rows<WorkOrder>("work_orders", (q) => q.eq("wo_number", i.wo_number));
    if (!wos[0]) throw new Error(`Unknown work order ${i.wo_number}`);
    const { data: maxSeq, error: eSeq } = await db
      .from("task_cards")
      .select("sequence")
      .eq("work_order_id", wos[0].id)
      .order("sequence", { ascending: false })
      .limit(1);
    if (eSeq) throw new Error(eSeq.message);
    const seq = (maxSeq?.[0]?.sequence ?? 0) + 1;
    const { error } = await db.from("task_cards").insert({
      work_order_id: wos[0].id,
      sequence: seq,
      description: i.description,
      ata_chapter: i.ata_chapter ?? null,
      status: "open",
      est_hours: i.est_hours ?? 1,
      requires_inspection: i.requires_inspection === true,
    });
    if (error) throw new Error(error.message);
    await audit("task_cards", "Task card added", `${i.wo_number} card ${seq}: ${i.description}`);
    return text(`Card ${seq} added to ${i.wo_number}.`);
  },
);

server.tool(
  "record_sector",
  "Record a closed tech-log sector; hours/cycles roll onto the airframe.",
  {
    aircraft_reg: z.string(),
    flight_no: z.string(),
    flight_date: z.string().describe("YYYY-MM-DD"),
    dep: z.string(),
    arr: z.string(),
    block_hours: z.number().positive(),
    captain: z.string(),
    remarks: z.string().optional(),
  },
  async (i) => {
    const ac = await findAircraft(i.aircraft_reg);
    const { error } = await db.from("flights").insert({
      aircraft_id: ac.id,
      flight_no: i.flight_no,
      flight_date: i.flight_date,
      dep: i.dep.toUpperCase(),
      arr: i.arr.toUpperCase(),
      block_hours: i.block_hours,
      cycles: 1,
      captain: i.captain,
      status: "closed",
      remarks: i.remarks ?? null,
    });
    if (error) throw new Error(error.message);
    // The DB trigger rolls FH/FC onto the airframe; read back the totals.
    const fresh = await findAircraft(i.aircraft_reg);
    await audit("flights", "Tech log sector recorded", `${i.flight_no} ${i.dep}-${i.arr} on ${ac.registration}, ${i.block_hours} FH`);
    return text(`Sector recorded — ${ac.registration} now ${Number(fresh.total_hours).toFixed(1)} FH / ${fresh.total_cycles} FC.`);
  },
);

server.tool(
  "set_roster",
  "Set or change an engineer's duty on the roster for one date (management act).",
  {
    engineer_staff_no: z.string().describe("e.g. ENG-1042"),
    date: z.string().describe("YYYY-MM-DD"),
    shift: z.enum(["early", "late", "night", "off", "leave", "training"]),
    base: z.string().describe("e.g. LGW"),
  },
  async (i) => {
    const engs = await rows<Engineer>("engineers", (q) => q.ilike("staff_no", i.engineer_staff_no));
    if (!engs[0]) throw new Error(`Unknown engineer staff no ${i.engineer_staff_no}`);
    const { error } = await db.from("roster_entries").upsert(
      { engineer_id: engs[0].id, duty_date: i.date, shift: i.shift, base: i.base.toUpperCase() },
      { onConflict: "engineer_id,duty_date" },
    );
    if (error) throw new Error(error.message);
    await audit("roster_entries", "Roster amended", `${engs[0].full_name} (${engs[0].staff_no}) → ${i.shift} at ${i.base.toUpperCase()} on ${i.date}`);
    return text(`Roster updated — ${engs[0].full_name} is ${i.shift} at ${i.base.toUpperCase()} on ${i.date}.`);
  },
);

server.tool(
  "reset_demo",
  "DESTRUCTIVE: restore the entire demo dataset to its date-shifted seed state.",
  {},
  async () => {
    const { error } = await db.rpc("reset_demo_data");
    if (error) throw new Error(error.message);
    return text("Demo data restored to seed state.");
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("AeroMRO MCP server ready — 12 tools (licence-holder acts deliberately not exposed).");
