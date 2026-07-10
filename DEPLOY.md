# Deploying AeroMRO to Cloudflare Pages

The UI is a static Vite build; the backend stays on Supabase. This uses
**Wrangler direct upload** — no GitHub repo required.

## One-time: authenticate Wrangler

Interactive (opens a browser to authorise your Cloudflare account):

```bash
cd ~/github/aero-mro
bunx wrangler login
```

## Deploy

```bash
bun run deploy
```

This runs `bun run build` then `wrangler pages deploy dist --project-name aero-mro`.
The first deploy creates the `aero-mro` Pages project and prints a
`https://aero-mro.pages.dev` URL. Re-run it any time to publish an update.

### How env vars work here

Because Wrangler builds locally, the deploy reads `.env.local`, so
`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` are baked into the bundle at build
time. The **publishable** Supabase key is client-safe, so this is expected — it
is designed to be visible in browser code.

## ⚠️ Before sharing the URL publicly — tighten RLS

**If you've set up GitHub sign-in (see `AUTH.md`), use the authenticated-only
policy there — it supersedes the options below.** The options below are only for
an unauthenticated public demo.

The demo RLS policies grant the anonymous role **full read + write** on every
table. Locally that's fine; on a public URL it means anyone can read or modify
the fleet data with the publishable key.

Pick a posture and apply it (Supabase SQL Editor, or ask the aero-mro session to
run it via the Supabase MCP):

**A. Read-only public demo** (browsing works; the ✨ save actions are disabled
for visitors):

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'aircraft','engineers','defects','parts','work_orders','task_cards',
    'crs_releases','airworthiness_directives','ad_compliance','audit_log'
  ] loop
    execute format('drop policy if exists "demo_all" on %I;', t);
    execute format('create policy "public_read" on %I for select using (true);', t);
  end loop;
end $$;
```

**B. Read + insert, no update/delete** (visitors can add defects and issue a
CRS, but can't alter or wipe existing records — a reasonable interactive-demo
middle ground):

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'aircraft','engineers','defects','parts','work_orders','task_cards',
    'crs_releases','airworthiness_directives','ad_compliance','audit_log'
  ] loop
    execute format('drop policy if exists "demo_all" on %I;', t);
    execute format('create policy "public_read"   on %I for select using (true);', t);
    execute format('create policy "public_insert" on %I for insert with check (true);', t);
  end loop;
end $$;
```

For a real deployment, put writes behind Supabase Auth and scope policies to
authenticated roles (certifying staff / planning / quality).

## Custom domain (optional)

In the Cloudflare dashboard → Pages → aero-mro → Custom domains, add a domain
you control; Cloudflare handles the TLS certificate.
```
