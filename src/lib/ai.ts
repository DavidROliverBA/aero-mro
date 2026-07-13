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

// The proxy authenticates callers with the signed-in user's Supabase token —
// without it, it would be an open relay for the Anthropic key. App.tsx keeps this
// in step with the session. (Set here rather than importing the supabase client,
// which would construct a live client on import and break the unit tests.)
let authToken: string | null = null;
export function setAuthToken(t: string | null) {
  authToken = t;
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

// Both transports (direct browser call and the workers/ai-proxy) take the same
// JSON body; only the auth headers differ. Keep this in one place so the
// blocking and streaming paths can never drift apart.
function requestHeaders(): Record<string, string> {
  if (!PROXY_URL && !runtimeKey)
    throw new Error("No Claude API key set — add one in Settings.");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (PROXY_URL) {
    if (authToken) headers["authorization"] = `Bearer ${authToken}`;
  } else {
    headers["x-api-key"] = runtimeKey!;
    headers["anthropic-version"] = "2023-06-01";
    // Required for browser-origin requests to the Anthropic API:
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return headers;
}

/**
 * Options accepted by every call that can stream.
 *
 * `signal` is passed straight to fetch. Aborting it makes the in-flight call
 * reject with a DOMException named "AbortError" — that propagates to the
 * caller untouched (it is NOT wrapped in a "Claude API …" error and NOT
 * swallowed), so the UI can tell "the user cancelled" apart from "the model
 * failed". Callers should check `e instanceof DOMException && e.name ===
 * "AbortError"` (or `e?.name === "AbortError"`) and stay quiet in that case.
 */
export interface StreamOptions {
  /** Called with each incremental text delta as it arrives. */
  onText?: (delta: string) => void;
  /** Abort the in-flight request; surfaces as a DOMException named "AbortError". */
  signal?: AbortSignal;
}

async function callClaude(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<AnthropicResponse> {
  const res = await fetch(PROXY_URL ?? API_URL, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }
  return (await res.json()) as AnthropicResponse;
}

// ---------------------------------------------------------------------------
// Streaming transport (SSE). Same request, same two paths (direct key or
// proxy), same AnthropicResponse shape out — so callClaudeStream is a drop-in
// for callClaude, but text arrives incrementally and the turn can be aborted.
//
// Reassembly: the Messages API streams one content block at a time, keyed by
// `index`. content_block_start gives the block's skeleton (for tool_use: its
// id and name, with an empty input); content_block_delta then carries either
// `text_delta` (append to .text, and fan out to onText) or `input_json_delta`
// (append `partial_json` to a per-index string buffer — tool arguments arrive
// as a JSON *string* in fragments, never as objects). At content_block_stop we
// JSON.parse the accumulated buffer into the block's `input`. message_delta
// carries the final stop_reason; message_stop ends the stream. The assembled
// blocks are returned in index order, identical to the non-streaming body.
// ---------------------------------------------------------------------------

interface StreamAcc {
  block: ContentBlock;
  json: string; // accumulated partial_json for tool_use blocks
}

// The subset of the Anthropic SSE event shape this app consumes.
interface SseEvent {
  type: string;
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  error?: { type?: string; message?: string };
}

export async function callClaudeStream(
  body: Record<string, unknown>,
  opts: StreamOptions = {},
): Promise<AnthropicResponse> {
  const res = await fetch(PROXY_URL ?? API_URL, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ ...body, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }
  if (!res.body) throw new Error("Claude API returned no response body to stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const acc = new Map<number, StreamAcc>();
  let stopReason = "end_turn";
  let buffer = "";
  let done = false;

  const handle = (ev: SseEvent) => {
    switch (ev.type) {
      case "error":
        throw new Error(
          `Claude API stream error: ${ev.error?.type ?? "unknown"} — ${
            ev.error?.message ?? "no detail"
          }`,
        );
      case "content_block_start": {
        const cb = ev.content_block ?? { type: "text" };
        acc.set(ev.index ?? 0, {
          block: { ...cb, ...(cb.type === "text" ? { text: cb.text ?? "" } : {}) },
          json: "",
        });
        break;
      }
      case "content_block_delta": {
        const entry = acc.get(ev.index ?? 0);
        if (!entry) break;
        const d = ev.delta ?? {};
        if (d.type === "text_delta" && typeof d.text === "string") {
          entry.block.text = (entry.block.text ?? "") + d.text;
          opts.onText?.(d.text);
        } else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
          entry.json += d.partial_json;
        }
        // thinking_delta / signature_delta etc. are not surfaced by this app.
        break;
      }
      case "content_block_stop": {
        const entry = acc.get(ev.index ?? 0);
        if (!entry) break;
        if (entry.block.type === "tool_use") {
          const raw = entry.json.trim();
          try {
            entry.block.input = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            throw new Error(
              `Claude streamed malformed tool input for "${entry.block.name ?? "?"}": ${raw.slice(0, 200)}`,
            );
          }
        }
        break;
      }
      case "message_delta":
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason as string;
        break;
      case "message_stop":
        done = true;
        break;
      // message_start / ping: nothing to do.
    }
  };

  while (!done) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; each frame has an
    // `event:` line (redundant — the JSON carries `type`) and `data:` line(s).
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + (buffer[sep] === "\r" ? 4 : 2));
      const data = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      handle(JSON.parse(data) as SseEvent);
    }
  }

  const content = [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => e.block);
  return { content, stop_reason: stopReason };
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
export async function dailyBrief(
  snapshot: string,
  opts: StreamOptions = {},
): Promise<string> {
  const body = {
    model: MODEL,
    max_tokens: 700,
    system:
      "You are the duty manager's morning briefing writer for a UK Part-145/CAMO organisation. " +
      "From the data snapshot, write a briefing of at most 8 short bullet lines, most urgent first: " +
      "AOG aircraft and what unblocks them, MEL clocks near breach, overdue/imminent checks and ADs, " +
      "certifying-coverage gaps, stores/tooling issues, then one line of good news if any. " +
      "British English. Plain text bullets (• ), no markdown headings. Never invent data.",
    messages: [{ role: "user", content: `Data snapshot (JSON):\n${snapshot}\n\nWrite today's briefing.` }],
  };
  const r = opts.onText
    ? await callClaudeStream(body, opts)
    : await callClaude(body, opts.signal);
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
  opts: StreamOptions = {},
): Promise<AgentTurn> {
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: AGENT_SYSTEM + "\n\nLive data snapshot (JSON):\n" + snapshot,
    tools: AGENT_TOOLS,
    messages: history,
  };
  // Streaming when the caller wants live text (a multi-tool turn can take
  // 20–30s); otherwise the original blocking call, unchanged. Either way the
  // returned shape — text, tool_use blocks, stop_reason — is identical.
  const r = opts.onText
    ? await callClaudeStream(body, opts)
    : await callClaude(body, opts.signal);
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

// ---------------------------------------------------------------------------
// 4. Vision — damage assessment from a photo.
//
// Fields mirror the damage_records table (see
// supabase/migrations/20260712075142_dent_buckle_and_photos.sql): damage_type
// uses that table's CHECK-constrained values verbatim (note "lightning strike"
// is two words — there is no 'crack' or 'puncture' value), `station` is the
// free-text frame/stringer/zone reference, and the three dimensions are in
// millimetres. pos_x/pos_y (schematic coordinates) are deliberately absent —
// the human places the pin on the chart; a photo cannot tell you where on the
// airframe it was taken.
// ---------------------------------------------------------------------------

export type DamageType =
  | "dent"
  | "scratch"
  | "corrosion"
  | "lightning strike"
  | "buckle"
  | "delamination";

export interface DamageAssessment {
  damage_type: DamageType;
  /** Frame / stringer / zone reference, e.g. "FR34, stringer S-12L". null if not determinable from the photo. */
  station: string | null;
  /** Millimetres. null when the photo carries no scale reference — the model must NOT guess. */
  length_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  /**
   * SUGGESTION ONLY — the model's opinion on whether the damage *looks* like it
   * could fall inside SRM allowable limits. It is NOT an airworthiness
   * determination: under EASA NPA 2025-07 / Part-145 that call belongs to the
   * certifying engineer, who must check the actual SRM. null = cannot say.
   * Never write this straight to damage_records.within_limits without a human
   * explicitly confirming it.
   */
  within_limits_suggestion: boolean | null;
  /** "low" means the photo is insufficient — angle, lighting, scale or focus. */
  confidence: "high" | "medium" | "low";
  reasoning: string;
  /** Next step for the engineer, e.g. "measure with a depth gauge and check SRM 53-10-01". */
  recommended_action: string;
}

const DAMAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    damage_type: {
      type: "string",
      enum: ["dent", "scratch", "corrosion", "lightning strike", "buckle", "delamination"],
    },
    station: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Frame/stringer/zone reference if visible or given in context, else null",
    },
    length_mm: {
      anyOf: [{ type: "number" }, { type: "null" }],
      description: "Millimetres; null if not measurable from the photo",
    },
    width_mm: { anyOf: [{ type: "number" }, { type: "null" }] },
    depth_mm: { anyOf: [{ type: "number" }, { type: "null" }] },
    within_limits_suggestion: {
      anyOf: [{ type: "boolean" }, { type: "null" }],
      description:
        "SUGGESTION only — whether the damage appears as though it could be within SRM allowable limits. null if you cannot say. This is not a determination.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reasoning: { type: "string" },
    recommended_action: { type: "string" },
  },
  required: [
    "damage_type",
    "station",
    "length_mm",
    "width_mm",
    "depth_mm",
    "within_limits_suggestion",
    "confidence",
    "reasoning",
    "recommended_action",
  ],
};

const DAMAGE_SYSTEM =
  "You are assisting a licensed Part-145 certifying engineer at 'Albion Atlantic Airways' who is " +
  "recording a structural damage finding. You are given a photograph of damage on an aircraft. " +
  "Your job is to PROPOSE a draft damage record for the engineer to check, correct and save — you " +
  "are not recording anything and you are not certifying anything.\n" +
  "Rules:\n" +
  "1. Classify the damage using only these types: dent, scratch, corrosion, lightning strike, " +
  "buckle, delamination. Pick the closest; explain the choice in your reasoning.\n" +
  "2. NEVER guess dimensions. Only give length_mm / width_mm / depth_mm when the photo contains a " +
  "genuine scale reference (a rule, a coin, a known-size fastener, a caption). Otherwise return " +
  "null for that dimension and say so. A confident wrong measurement is worse than no measurement.\n" +
  "3. Only give a station/zone if it is visible (stencilled frame or stringer marking) or supplied " +
  "in the context note. Otherwise null.\n" +
  "4. within_limits_suggestion is a SUGGESTION about appearance, never a determination. You have no " +
  "access to the Structural Repair Manual and you cannot see depth reliably in a photograph. Use " +
  "null whenever you are not sure, and state plainly in the reasoning that the SRM limit check and " +
  "the airworthiness disposition are the certifying engineer's to make, not yours.\n" +
  "5. Never assert that the aircraft is airworthy, serviceable, or safe to fly, and never say the " +
  "damage 'is' within limits — you may only say what it looks like and what should be verified.\n" +
  "6. If the photo is too blurred, too distant, badly lit, or the damage is not identifiable, set " +
  "confidence to 'low', say exactly what is insufficient about the photo, and recommend a better " +
  "photo or a physical inspection.\n" +
  "7. British English. Be concise and factual.";

/**
 * ASSIST ONLY — this proposes a draft damage record from a photo. A human
 * certifying engineer reads it, corrects it, and decides. Do not wire this to
 * an auto-save: `within_limits_suggestion` is an opinion about a picture, and
 * the airworthiness disposition (SRM limit check, repair vs monitor vs
 * quarantine) is a licence-holder act under Part-145 / EASA NPA 2025-07.
 *
 * @param imageBase64 raw base64 of the image (no `data:` URI prefix)
 * @param mediaType   e.g. "image/jpeg", "image/png", "image/webp"
 */
export async function assessDamagePhoto(
  imageBase64: string,
  mediaType: string,
  context: { registration: string; type: string; note?: string },
  opts: StreamOptions = {},
): Promise<DamageAssessment> {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: DAMAGE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: DAMAGE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text:
              `Aircraft: ${context.registration} (${context.type}).\n` +
              (context.note ? `Engineer's note: ${context.note}\n` : "") +
              "Assess the damage in this photograph and propose a draft record for the engineer to check.",
          },
        ],
      },
    ],
  };
  const r = opts.onText
    ? await callClaudeStream(body, opts)
    : await callClaude(body, opts.signal);
  return parseJsonObject<DamageAssessment>(textOf(r), "damage assessment");
}

// Robust JSON extraction. output_config forces a JSON object, but a model can
// still wrap it in a fence or a sentence — a bare JSON.parse would then throw
// an opaque "Unexpected token" with no clue what came back. Try the whole
// string, then a fenced block, then the outermost {...} span; if none of that
// yields an object, fail with the model's actual words in the message.
function parseJsonObject<T>(raw: string, what: string): T {
  const text = raw.trim();
  const candidates: string[] = [text];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    if (!c.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    `Claude returned no usable JSON ${what} — it replied with prose instead. Response was: ` +
      (text ? `"${text.slice(0, 300)}${text.length > 300 ? "…" : ""}"` : "(empty)"),
  );
}
