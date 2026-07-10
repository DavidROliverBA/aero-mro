// Claude API integration — direct browser fetch with a user-supplied API key.
//
// NOTE: calling the Anthropic API directly from a browser exposes the API key
// to the client. This is acceptable for a local single-user demo (the key is
// pasted at runtime, held only in memory, never persisted). For a real
// deployment, proxy these calls through a backend so the key stays server-side.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

let runtimeKey: string | null =
  (import.meta.env.VITE_ANTHROPIC_API_KEY as string) || null;

export function setApiKey(k: string) {
  runtimeKey = k.trim() || null;
}
export function hasApiKey(): boolean {
  return !!runtimeKey;
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
  if (!runtimeKey) throw new Error("No Claude API key set — paste one in the AI panel.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": runtimeKey,
      "anthropic-version": "2023-06-01",
      // Required for browser-origin requests to the Anthropic API:
      "anthropic-dangerous-direct-browser-access": "true",
    },
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
// 3. Natural-language assistant over a snapshot of live fleet data.
// ---------------------------------------------------------------------------
export async function askAssistant(
  question: string,
  context: string,
): Promise<string> {
  const r = await callClaude({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system:
      "You are the AeroMRO assistant for a UK CAA/EASA Part-145 maintenance organisation. " +
      "Answer questions about the fleet using ONLY the data snapshot provided. If the answer is not " +
      "in the data, say so. Be concise and use British English. Flag any airworthiness or compliance " +
      "risk you notice (expired licences, breached MEL clocks, overdue ADs).",
    messages: [
      {
        role: "user",
        content: `Fleet data snapshot (JSON):\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });
  return textOf(r).trim();
}
