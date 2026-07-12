// Regression guard for AeroMRO's headline design claim (see docs/ai-design.md
// and CLAUDE.md "AI red lines"): task sign-off, independent inspection, the
// certificate of release to service (CRS), MEL deferral, part/tool
// quarantine, and audit-finding closure are REGULATORY ACTS reserved for a
// licensed human under EASA NPA 2025-07 (aviation AI capped at Level 1
// assistance / Level 2 human-AI teaming, with mandatory human oversight) and
// Part-145.A.45(e)/145.A.48/145.A.50 (a named licence holder certifies).
// AI may draft, triage, explain and propose — it must NEVER sign.
//
// Today that line is held only by convention and code review: nothing stops
// a future PR from adding a `sign_task_card` tool to the assistant or the
// MCP server. These tests exist so that PR fails loudly instead of shipping.
//
// This file lives in src/lib/ (not a top-level tests/ dir) because
// bunfig.toml scopes `bun test` to `root = "src"`.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT_TOOLS, AUTO_TOOLS } from "./ai";

// Forward-looking guard: catches a red-lined tool added under ANY plausible
// name, not just the specific names we know about today. If this regex ever
// needs narrowing to admit a legitimate new tool, that's a deliberate,
// reviewed decision — not something to do reflexively to make a test pass.
const RED_LINE = /sign|inspect|certif|crs|defer|quarantin|finding|release/i;

const WHY_THE_RED_LINE_EXISTS =
  "AeroMRO's headline design claim (docs/ai-design.md, CLAUDE.md \"AI red lines\") is that " +
  "regulatory acts — task sign-off, independent inspection, CRS issue, MEL deferral, " +
  "quarantine, finding closure — are NEVER available to AI as a tool, anywhere: not in the " +
  "assistant, not in the MCP server, not in anything new. This isn't caution for its own " +
  "sake — EASA NPA 2025-07 caps aviation AI at Level 1 (assistance) / Level 2 (human-AI " +
  "teaming) with mandatory human oversight, and Part-145.A.45(e)/A.48/A.50 require a named " +
  "licence holder to certify. AI proposes via confirm-cards; humans sign. If you're reading " +
  "this because the test failed: rename the offending tool, or if it genuinely does not " +
  "perform a regulated act, that's a decision for deliberate review (update docs/ai-design.md " +
  "too) — not a reason to quietly widen this allow-list or delete the assertion.";

describe("AGENT_TOOLS — in-app assistant tool surface (src/lib/ai.ts)", () => {
  const names = [...AGENT_TOOLS.map((t) => t.name)].sort();

  test("exposes exactly the known, reviewed set of tools — no silent additions", () => {
    const expected = [
      "add_task_card",
      "create_defect",
      "create_work_order",
      "navigate",
      "record_flight",
      "set_roster",
      "update_aircraft_status",
    ].sort();
    expect(
      names,
      "AGENT_TOOLS changed. Every tool offered to the assistant is a reviewed decision " +
        "(docs/ai-design.md's decision table walks each one). Update this hardcoded list ONLY " +
        "as part of a deliberate review confirming the new/removed tool does not cross the AI " +
        "red line — do not just paste the new tool list to make this test pass.",
    ).toEqual(expected);
  });

  test(`no AGENT_TOOLS name matches the regulatory red-line pattern (${RED_LINE})`, () => {
    const offenders = names.filter((n) => RED_LINE.test(n));
    expect(
      offenders,
      offenders.length
        ? `Red-lined tool name(s) offered to the assistant: ${offenders.join(", ")}. ${WHY_THE_RED_LINE_EXISTS}`
        : "",
    ).toEqual([]);
  });
});

describe("AUTO_TOOLS — tools the assistant executes WITHOUT a human confirm-card", () => {
  test("is exactly {'navigate'} — nothing that writes auto-executes", () => {
    expect(
      [...AUTO_TOOLS].sort(),
      "AUTO_TOOLS must contain only 'navigate'. Every other tool call is required to render as " +
        "a pending action card that a human must explicitly click Confirm on before " +
        "executeAction() ever touches Supabase (src/lib/actions.ts) — that confirm step IS the " +
        "human-oversight mechanism the entire design rests on (EASA NPA 2025-07 Level 1/2 human " +
        "oversight; see docs/ai-design.md 'Over-reliance'). Auto-executing any write tool — " +
        "regulatory or not — silently deletes that safeguard for every call of that type.",
    ).toEqual(["navigate"]);
  });

  test("every AUTO_TOOLS entry is a real, declared AGENT_TOOLS name (no dangling references)", () => {
    const declared = new Set(AGENT_TOOLS.map((t) => t.name));
    for (const n of AUTO_TOOLS) {
      expect(
        declared.has(n),
        `AUTO_TOOLS references "${n}", which is not declared in AGENT_TOOLS. An auto-executing ` +
          "tool name must be traceable to a real, reviewed tool definition.",
      ).toBe(true);
    }
  });
});

describe("executeAction (src/lib/actions.ts) — no execution path for a red-lined act", () => {
  // actions.ts imports src/lib/supabase.ts, which constructs a live Supabase
  // client at module-load time and throws without VITE_SUPABASE_URL/KEY.
  // bunfig.toml scopes `bun test` to `root = "src"`, and (confirmed by
  // probing) `bun test` does not load the repo-root .env.local under that
  // config — so importing executeAction directly and invoking it is not
  // viable in this environment (it throws "supabaseUrl is required" at
  // import time, before any test body runs, for every test in the file).
  //
  // Per the task brief: when a live/imported assertion isn't feasible, fall
  // back to a static source guard rather than a test that passes vacuously.
  // This reads the actual `switch (a.tool)` inside executeAction and asserts
  // its case labels directly — it WILL fail if a case is added, renamed, or
  // removed, including a red-lined one added under a new name.
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const fnMatch = source.match(/export async function executeAction[\s\S]*?\n\}\n/);

  test("executeAction() is still present in the expected shape", () => {
    expect(
      fnMatch,
      "Could not locate `export async function executeAction` (ending at a column-0 `}`) in " +
        "src/lib/actions.ts by source pattern — the function was restructured. Update the " +
        "pattern in this test to match the new shape, but do NOT remove the underlying " +
        "assertion: there must still be a check that no red-lined act has an execution path.",
    ).toBeTruthy();
  });

  const body = fnMatch ? fnMatch[0] : "";
  const cases = [...body.matchAll(/case\s+"([a-z_]+)"\s*:/g)].map((m) => m[1]).sort();

  test("switch (a.tool) cases equal the known, reviewed set of executable actions", () => {
    const expected = [
      "add_task_card",
      "create_defect",
      "create_work_order",
      "record_flight",
      "set_roster",
      "update_aircraft_status",
    ].sort();
    expect(
      cases,
      "The set of tool names executeAction() knows how to write has changed. This must move in " +
        "lockstep with AGENT_TOOLS (every writeable tool needs a case; 'navigate' needs none, " +
        "since it never reaches executeAction). Update this list only as part of a deliberate, " +
        "reviewed change — see the AGENT_TOOLS test above for why.",
    ).toEqual(expected);
  });

  test(`no executeAction case matches the regulatory red-line pattern (${RED_LINE})`, () => {
    const offenders = cases.filter((n) => RED_LINE.test(n));
    expect(
      offenders,
      offenders.length
        ? `Red-lined executable action(s) found in executeAction()'s switch: ${offenders.join(", ")}. ` +
            `${WHY_THE_RED_LINE_EXISTS} Concretely here: this is the function that actually writes ` +
            "to Supabase after a human clicks Confirm — a red-lined case here means a licence-holder " +
            "act could be executed by the AI-assistant pipeline, not just proposed."
        : "",
    ).toEqual([]);
  });

  test("the switch has a default branch that rejects unknown tools (no silent no-op fallthrough)", () => {
    expect(
      /default:\s*throw new Error/.test(body),
      "executeAction()'s switch must end in a `default: throw` — an unrecognised tool name " +
        "(including a red-lined one someone forgot to add a case for) must fail loudly, not " +
        "silently fall through and do nothing while still reporting success to the user.",
    ).toBe(true);
  });
});
