// Smoke test for the AeroMRO MCP server.
//   bun mcp/smoke.ts          — protocol-only (dummy creds): boots, lists tools
//   LIVE=1 bun mcp/smoke.ts   — full test against the live DB via .env.local
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
console.log(`TOOLS (${tools.tools.length}):`, tools.tools.map((t) => t.name).join(", "));

if (live) {
  for (const name of ["fleet_status", "coverage_and_staff"] as const) {
    const res = await client.callTool({ name, arguments: {} });
    const first = (res.content as { type: string; text?: string }[])[0];
    console.log(`\n== ${name} ==\n${(first.text ?? "").slice(0, 600)}`);
  }
}
await client.close();
