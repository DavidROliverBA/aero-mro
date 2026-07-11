// Signs in as the UX test user and writes a Playwright storageState file so
// browser tests start authenticated (the app's only interactive login is
// GitHub OAuth, which automation can't drive). Run: bun tests/save-auth-state.ts

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_KEY;
const email = env.UX_TEST_EMAIL;
const password = env.UX_TEST_PASSWORD;
if (!url || !anon || !email || !password) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_KEY / UX_TEST_EMAIL / UX_TEST_PASSWORD in .env.local");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const supabase = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) {
  console.error("Sign-in failed:", error?.message);
  process.exit(1);
}

const state = {
  cookies: [],
  origins: [
    {
      origin: "http://localhost:5173",
      localStorage: [
        { name: `sb-${ref}-auth-token`, value: JSON.stringify(data.session) },
      ],
    },
  ],
};
writeFileSync(new URL("./.auth-state.json", import.meta.url), JSON.stringify(state, null, 2));
console.log(`Auth state saved for ${email} → tests/.auth-state.json (expires ${new Date((data.session.expires_at ?? 0) * 1000).toLocaleTimeString("en-GB")})`);
