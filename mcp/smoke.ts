import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "bun",
  args: ["mcp/server.ts"],
  env: { ...process.env, VITE_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_KEY: "dummy-key-for-protocol-test" },
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);
const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));
console.log("COUNT:", tools.tools.length);
await client.close();
