import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

if (!url || !key) {
  console.warn(
    "Supabase env vars missing. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL / VITE_SUPABASE_KEY.",
  );
}

export const supabase = createClient(url ?? "", key ?? "");
