// Claude API integration — direct browser fetch with a user-supplied API key.
//
// NOTE: calling the Anthropic API directly from a browser exposes the API key
// to the client. This is acceptable for a local single-user demo (the key is
// pasted at runtime, held only in memory, never persisted). For a real
// deployment, proxy these calls through a backend so the key stays server-side.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

// Optional server-side proxy (workers/ai-proxy). When VITE_AI_PROXY_URL is
// set, requests go there with no key in the browser at all.
const PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL as string) || null;

let runtimeKey: string | null =
  (import.meta.env.VITE_ANTHROPIC_API_KEY as string) || null;

export function setApiKey(k: string) {
  runtimeKey = k.trim() || null;
}
export function hasApiKey(): boolean {
  return !!PROXY_URL || !!runtimeKey;
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

async function callClaude(body: Record<string, unknown>): Promise<AnthropicResponse> {
  if (!PROXY_URL && !runtimeKey)
    throw new Error("No Claude API key set — add one in Settings.");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!PROXY_URL) {
    headers["x-api-key"] = runtimeKey!;
    headers["anthropic-version"] = "2023-06-01";
    // Required for browser-origin requests to the Anthropic API:
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const res = await fetch(PROXY_URL ?? API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }
  return (await res.json()) as AnthropicResponse;
}

function textOf(r: AnthropicResponse): string {
  return r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// 1. Defect triage — structured JSON output constrained by a schema.
// ---------------------------------------------------------------------------
export interface TriageResult {
  ata_chapter: string;
  ata_system: string;
  severity: "minor" | "major" | "critical";
  suggested_mel_cat: "A" | "B" | "C" | "D" | "none";
  aog_risk: boolean;
  rationale: string;
  recommended_actions: string[];
}

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ata_chapter: { type: "string", description: "2-digit ATA chapter, e.g. 32" },
    ata_system: { type: "string", description: "Name of the ATA system" },
    severity: { type: "string", enum: ["minor", "major", "critical"] },
    suggested_mel_cat: { type: "string", enum: ["A", "B", "C", "D", "none"] },
    aog_risk: { type: "boolean" },
    rationale: { type: "string" },
    recommended_actions: { type: "array", items: { type: "string" } },
  },
  required: [
    "ata_chapter",
    "ata_system",
    "severity",
    "suggested_mel_cat",
    "aog_risk",
    "rationale",
    "recommended_actions",
  ],
};

export async function triageDefect(
  description: string,
  aircraftType: string,
): Promise<TriageResult> {
  const r = await callClaude({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You are a Part-145 maintenance triage assistant for a UK CAA/EASA approved organisation. " +
      "Given a raw defect report, classify it. Assign the correct ATA chapter, judge severity, and " +
      "suggest an MMEL rectification category (A/B/C/D, or 'none' if it must be fixed before flight). " +
      "Be conservative: safety-of-flight items are 'critical' with aog_risk true and MEL 'none'. " +
      "This is decision support only; a licensed engineer makes the airworthiness determination.",
    output_config: { format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Aircraft type: ${aircraftType}\nDefect report: ${description}`,
      },
    ],
  });
  return JSON.parse(textOf(r)) as TriageResult;
}

// ---------------------------------------------------------------------------
// 2. CRS statement drafting — free-text.
// ---------------------------------------------------------------------------
export async function draftCrsStatement(
  woTitle: string,
  tasks: string[],
  aircraftReg: string,
): Promise<string> {
  const r = await callClaude({
    model: MODEL,
    max_tokens: 512,
    system:
      "You draft Certificate of Release to Service (CRS) statements compliant with EASA/UK Part-145.A.50. " +
      "Produce a single formal paragraph referencing the work performed. Do not invent licence numbers or dates. " +
      "Keep it factual and standard-form.",
    messages: [
      {
        role: "user",
        content:
          `Aircraft: ${aircraftReg}\nWork order: ${woTitle}\nTasks completed:\n- ` +
          tasks.join("\n- "),
      },
    ],
  });
  return textOf(r).trim();
}

// ---------------------------------------------------------------------------
// 2b. Manager daily briefing — one-shot narrative over the live snapshot.
// ---------------------------------------------------------------------------
export async function dailyBrief(snapshot: string): Promise<string> {
  const r = await callClaude({
    model: MODEL,
    max_tokens: 700,
    system:
      "You are the duty manager's morning briefing writer for a UK Part-145/CAMO organisation. " +
      "From the data snapshot, write a briefing of at most 8 short bullet lines, most urgent first: " +
      "AOG aircraft and what unblocks them, MEL clocks near breach, overdue/imminent checks and ADs, " +
      "certifying-coverage gaps, stores/tooling issues, then one line of good news if any. " +
      "British English. Plain text bullets (• ), no markdown headings. Never invent data.",
    messages: [{ role: "user", content: `Data snapshot (JSON):\n${snapshot}\n\nWrite today's briefing.` }],
  });
  return textOf(r).trim();
}

// ---------------------------------------------------------------------------
// 3. Agentic assistant — natural-language command over the whole system.
//
// Design (see docs/ai-design.md): the model sees a snapshot of live data and a
// set of ACTION TOOLS. Read-and-answer needs no tools. Any write it wants to
// make surfaces in the UI as a pending action card that a human must confirm
// before it executes — the model never mutates data itself, and regulatory
// acts (sign-off, CRS, quarantine, deferral commitment) have no tool at all.
// ---------------------------------------------------------------------------

export interface AgentToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const obj = (
  props: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties: props,
  required,
});

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "navigate",
    description:
      "Open a view in the app for the user. Safe, executes immediately without confirmation.",
    input_schema: obj(
      {
        tab: {
          type: "string",
          enum: [
            "dashboard", "mywork", "fleet", "techlog", "defects", "workorders", "planning",
            "parts", "tooling", "directives", "reliability", "quality", "engineers",
            "workforce", "settings", "assistant",
          ],
        },
      },
      ["tab"],
    ),
  },
  {
    name: "create_defect",
    description:
      "Raise a new defect against an aircraft. Requires human confirmation before it is written.",
    input_schema: obj(
      {
        aircraft_reg: { type: "string", description: "e.g. G-ALBA" },
        description: { type: "string" },
        ata_chapter: { type: "string", description: "2-digit ATA chapter" },
        severity: { type: "string", enum: ["minor", "major", "critical"] },
        raised_by: { type: "string", description: "Who reported it" },
      },
      ["aircraft_reg", "description", "severity", "raised_by"],
    ),
  },
  {
    name: "create_work_order",
    description:
      "Open a new work order on an aircraft, optionally linked to an existing defect (by its ref shown in the snapshot). Requires human confirmation.",
    input_schema: obj(
      {
        aircraft_reg: { type: "string" },
        title: { type: "string" },
        wo_type: { type: "string", enum: ["scheduled", "unscheduled", "ad_sb", "mod"] },
        source_defect_ref: { type: "string", description: "8-char defect ref from the snapshot, if raised from a defect" },
      },
      ["aircraft_reg", "title", "wo_type"],
    ),
  },
  {
    name: "add_task_card",
    description: "Append a task card to an existing work order (by WO number). Requires human confirmation.",
    input_schema: obj(
      {
        wo_number: { type: "string", description: "e.g. WO-2026-0002" },
        description: { type: "string" },
        ata_chapter: { type: "string" },
        est_hours: { type: "number" },
        requires_inspection: { type: "boolean", description: "true if the task is flight-safety critical and needs independent inspection" },
      },
      ["wo_number", "description"],
    ),
  },
  {
    name: "record_flight",
    description:
      "Record a tech-log flight sector. Closing a sector rolls its hours/cycles onto the airframe totals. Requires human confirmation.",
    input_schema: obj(
      {
        aircraft_reg: { type: "string" },
        flight_no: { type: "string" },
        flight_date: { type: "string", description: "YYYY-MM-DD" },
        dep: { type: "string" },
        arr: { type: "string" },
        block_hours: { type: "number" },
        captain: { type: "string" },
        remarks: { type: "string" },
      },
      ["aircraft_reg", "flight_no", "flight_date", "dep", "arr", "block_hours", "captain"],
    ),
  },
  {
    name: "set_roster",
    description:
      "Set or change an engineer's duty on the roster for one date (a management act, not a certification act). Requires human confirmation.",
    input_schema: obj(
      {
        engineer_staff_no: { type: "string", description: "e.g. ENG-1042" },
        date: { type: "string", description: "YYYY-MM-DD" },
        shift: { type: "string", enum: ["early", "late", "night", "off", "leave", "training"] },
        base: { type: "string", description: "Duty station, e.g. LGW or LHR" },
      },
      ["engineer_staff_no", "date", "shift", "base"],
    ),
  },
  {
    name: "update_aircraft_status",
    description: "Change an aircraft's operational status. Requires human confirmation.",
    input_schema: obj(
      {
        aircraft_reg: { type: "string" },
        status: { type: "string", enum: ["in_service", "scheduled_maintenance", "aog", "stored"] },
        reason: { type: "string" },
      },
      ["aircraft_reg", "status", "reason"],
    ),
  },
];

// Tools that are pure UI and execute without a confirmation card.
export const AUTO_TOOLS = new Set(["navigate"]);

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}
export interface AgentMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ProposedAction {
  id: string; // tool_use id — echoed back in the tool_result
  tool: string;
  input: Record<string, unknown>;
}

export interface AgentTurn {
  text: string;
  assistantBlocks: ContentBlock[]; // append verbatim to history before results
  actions: ProposedAction[];
  stopReason: string;
}

const AGENT_SYSTEM =
  "You are the AeroMRO assistant for 'Albion Atlantic Airways', a UK CAA/EASA Part-145 + Part-CAMO " +
  "maintenance organisation. You can answer anything from the live data snapshot, and you can PROPOSE " +
  "actions using the tools provided — every write is shown to the user as a pending action card they " +
  "must confirm, so state clearly what you propose and why. Rules: (1) never invent data — if it is " +
  "not in the snapshot, say so; (2) regulatory acts (task sign-off, independent inspection, CRS issue, " +
  "MEL deferral commitment, quarantine) are deliberately NOT available as tools — direct the user to " +
  "the relevant view instead and use navigate to take them there; (3) flag any compliance risk you " +
  "notice (expired licences, MEL clocks, overdue ADs/checks, calibration, shelf-life, LLP limits); " +
  "(4) British English, concise; (5) refs in the snapshot like 'ref' fields are 8-char ids — use them " +
  "in tool inputs where a ref is required; (6) also watch the roster for certifying-coverage gaps " +
  "(a base/day where no rostered engineer can legally certify a based type) and man-hour shortfalls.";

export async function agentTurn(
  history: AgentMessage[],
  snapshot: string,
): Promise<AgentTurn> {
  const r = await callClaude({
    model: MODEL,
    max_tokens: 2000,
    system: AGENT_SYSTEM + "\n\nLive data snapshot (JSON):\n" + snapshot,
    tools: AGENT_TOOLS,
    messages: history,
  });
  const blocks = r.content as ContentBlock[];
  const actions: ProposedAction[] = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id!, tool: b.name!, input: (b.input ?? {}) as Record<string, unknown> }));
  return {
    text: textOf(r).trim(),
    assistantBlocks: blocks,
    actions,
    stopReason: r.stop_reason,
  };
}
