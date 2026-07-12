// Smoke test for the AeroMRO MCP server.
//   bun mcp/smoke.ts          — protocol-only (dummy creds): boots, lists tools
//   LIVE=1 bun mcp/smoke.ts   — full test against the live DB via .env.local
//
// Also a regression guard for the project's AI red line (see CLAUDE.md "AI
// red lines" and docs/ai-design.md): task sign-off, independent inspection,
// CRS, MEL deferral, quarantine and finding closure must NEVER be exposed as
// MCP tools — EASA NPA 2025-07 caps aviation AI at Level 1/2 human oversight
// and Part-145.A.45(e)/A.48/A.50 require a named licence holder to certify.
// This script exits non-zero on any mismatch so it is CI-able.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let failed = false;
function check(condition: boolean, okMsg: string, failMsg: string) {
  if (condition) {
    console.log(`  OK — ${okMsg}`);
  } else {
    failed = true;
    console.error(`  FAIL — ${failMsg}`);
  }
}

const live = process.env.LIVE === "1";
const transport = new StdioClientTransport({
  command: "bun",
  args: ["mcp/server.ts"],
  env: live
    ? { ...process.env }
    : {
        ...process.env,
        VITE_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_KEY: "dummy-key-for-protocol-test",
      },
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
console.log(`TOOLS (${tools.tools.length}):`, names.join(", "));

// (a) Exactly the expected 12 tools — hardcoded from mcp/server.ts. This is a
// reviewed allow-list, not a count check: it fails if a tool is added,
// renamed, or removed without this file being updated as part of that review.
const EXPECTED_TOOLS = [
  "add_task_card",
  "coverage_and_staff",
  "due_list",
  "fleet_status",
  "open_defects",
  "open_work_order",
  "raise_defect",
  "record_sector",
  "reset_demo",
  "set_roster",
  "stores_and_tooling_alerts",
  "work_order_status",
].sort();
check(
  JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
  `server exposes exactly the expected ${EXPECTED_TOOLS.length} tools`,
  `tool set changed.\n    expected: ${EXPECTED_TOOLS.join(", ")}\n    actual:   ${names.join(", ")}\n` +
    "    Every MCP tool is a reviewed decision (docs/ai-design.md's decision table). Update " +
    "EXPECTED_TOOLS here ONLY as part of a deliberate review confirming the change does not " +
    "cross the AI red line (task sign-off, independent inspection, CRS, MEL deferral, " +
    "quarantine, finding closure — see CLAUDE.md 'AI red lines').",
);

// (b) No tool name matches the same forward-looking red-line pattern used in
// src/lib/ai.test.ts — catches a red-lined tool added under any plausible name.
const RED_LINE = /sign|inspect|certif|crs|defer|quarantin|finding|release/i;
const offenders = names.filter((n) => RED_LINE.test(n));
check(
  offenders.length === 0,
  `no tool name matches the regulatory red-line pattern (${RED_LINE})`,
  `red-lined tool name(s) exposed over MCP: ${offenders.join(", ")}. AeroMRO's headline design ` +
    "claim is that regulatory acts (task sign-off, independent inspection, CRS issue, MEL " +
    "deferral, quarantine, finding closure) are NEVER available to AI as a tool, anywhere — not " +
    "in the assistant, not here. EASA NPA 2025-07 caps aviation AI at Level 1/2 human oversight; " +
    "Part-145.A.45(e)/A.48/A.50 require a named licence holder to certify. The MCP client's " +
    "permission prompt is only a stand-in for human confirmation on management/query acts — it " +
    "is not sufficient oversight for a regulatory act, which is why none may exist as a tool.",
);

if (live) {
  for (const name of ["fleet_status", "coverage_and_staff"] as const) {
    const res = await client.callTool({ name, arguments: {} });
    const first = (res.content as { type: string; text?: string }[])[0];
    console.log(`\n== ${name} ==\n${(first.text ?? "").slice(0, 600)}`);
  }
}
await client.close();

if (failed) {
  console.error("\nSMOKE TEST FAILED — see FAIL lines above.");
  process.exit(1);
} else {
  console.log("\nSMOKE TEST PASSED.");
}
