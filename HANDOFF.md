# AeroMRO — session handoff

Continuation notes for picking this up in another Claude Code session (the one
running **in this repo** with the Supabase MCP + Cloudflare Skills plugin
available). Written 2026-07-10.

## What this project is

A prototype **MRO (Maintenance, Repair & Overhaul) system** for an airline
Engineering group, modelled on **UK CAA / EASA Part-145, Part-CAMO and
Part-66**. Fictional airline "Albion Atlantic Airways" — demo data only, nothing
BA-specific (Supabase is third-party).

- **Frontend:** Vite + React + TypeScript, run with `bun`
- **Backend:** Supabase (Postgres) — project ref `biffxhtytzdcfsbxscwm`
- **AI:** Claude (`claude-opus-4-8`) via direct browser fetch — defect triage
  (JSON-schema structured output), CRS statement drafting, fleet assistant
- **Auth:** Supabase Auth with GitHub OAuth (app-side built; provider config pending)

## Repo layout

```
supabase/schema.sql, seed.sql        source-of-truth SQL
supabase/migrations/                 what the CLI/MCP applies (schema + seed)
src/lib/     supabase.ts, types.ts, compliance.ts, ai.ts
src/views/   Dashboard, Fleet, Defects, WorkOrders, Parts, Directives,
             Engineers, Assistant, Login
src/components/ui.tsx
README.md    overview + setup
AUTH.md      GitHub sign-in + authenticated-RLS setup
DEPLOY.md    Cloudflare Pages deploy (Wrangler direct upload)
.mcp.json    Supabase hosted MCP (project scope)
.env.local   Supabase URL + publishable key (gitignored)
```

## What's DONE and verified

- ✅ Full Part-145/CAMO schema + seed applied to Supabase. Verified row counts:
  aircraft 5, defects 6, work_orders 3, engineers 5, ad_compliance 7.
- ✅ Frontend builds clean (`bun run build`) and runs (`bun run dev` →
  http://localhost:5173). REST reads confirmed working with the publishable key.
- ✅ Compliance logic: MEL rectification clocks (Cat A/B/C/D), Part-66
  certifying-privilege checks (blocks CRS if licence expired / no type rating /
  no company auth), AD deadline + repetitive-interval alerts.
- ✅ AI features wired (need a Claude API key pasted in the sidebar at runtime).
- ✅ GitHub OAuth sign-in gate built in the app (`src/views/Login.tsx` +
  session handling in `App.tsx`). Sign-out button in sidebar.
- ✅ Cloudflare Pages deploy configured: `bun run deploy` (Wrangler direct
  upload, project name `aero-mro`). `public/_redirects` SPA fallback in place.
- ✅ Supabase MCP added to this repo (`.mcp.json`), Cloudflare Skills plugin
  installed, both authenticated.

## Previously outstanding — ALL DONE 2026-07-10

### 1. ✅ GitHub OAuth configured and confirmed
GitHub OAuth App created (Client ID `Ov23lifcWunDWXoWBAXx`; credentials note in
`MyVault/Secrets/github-auth-key.md`). Provider enabled + Site URL/redirect
URLs set via the Supabase Management API (CLI keychain token, `PATCH
/v1/projects/{ref}/config/auth`) — not the dashboard. Redirect allow-list:
`http://localhost:5173` and `https://aero-mro.pages.dev` (each with `/**`).
User confirmed a real GitHub login works on the live site.

### 2. ✅ RLS locked to authenticated-only
Applied as migration `20260710214047_lock_rls_authenticated` (remote via MCP,
mirrored in `supabase/migrations/`). Verified: all ten tables have exactly one
policy `auth_all` scoped to `authenticated`; anonymous REST reads with the
publishable key now return `[]`.

### 3. ✅ Deployed to Cloudflare Pages
Live at **https://aero-mro.pages.dev** (account david.oliver@ba.com). Verified:
200 + SPA fallback working. Note: newer Wrangler delegates Pages deploys to
Workers and demands Vite ≥6, so the deploy script now carries `--force` to
target classic Pages directly.

## Open decisions / possible next work

- **Restrict who can sign in.** Currently any GitHub user who reaches the app can
  log in. Options: gate on `session.user.user_metadata.user_name` in the app, or
  add an `allowed_users` table and reference it in the RLS policies instead of
  the blanket `to authenticated`.
- **Harden the AI calls.** The browser calls Anthropic directly with a
  user-pasted key (fine for demo). For production, proxy via a Cloudflare Worker
  so the key stays server-side (the Cloudflare Skills plugin can scaffold this).
- **Feature ideas not yet built:** scheduled-maintenance forecasting, component
  life-limit tracking, capacity/hangar planning, digital tech-log per flight.

## Key facts / gotchas

- Publishable key is in `.env.local` (client-safe). It's baked into the built
  bundle on deploy — expected.
- The seed migration starts with `truncate … restart identity cascade` — safe on
  a fresh DB, but re-running it wipes and reloads demo data.
- Don't edit existing migrations; add new ones (`supabase migration new <name>`).
- Model id for AI calls is `claude-opus-4-8` (in `src/lib/ai.ts`).
