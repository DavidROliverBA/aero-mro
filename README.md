# AeroMRO ✈

> **Built by [Claude Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)** —
> this entire system was researched, designed, coded, tested, hardened and
> deployed by Anthropic's Fable model working through Claude Code over three
> days: a 9-agent market research sweep, 20-table regulatory data model,
> 18 modules, an agentic AI layer, an MCP server, 56 automated tests, and
> ~25 production deployments. The session story, including the six real bugs
> its own verification layers caught, is in
> [`docs/build-log.md`](docs/build-log.md).

**An AI-native Maintenance, Repair & Overhaul system** for an airline
Engineering group, modelled on **UK CAA / EASA Part-145** (Approved
Maintenance Organisation), **Part-CAMO** (Continuing Airworthiness
Management) and **Part-66** (certifying-staff licensing).

Built as a working answer to what our [market research](ROADMAP.md) found:
every incumbent MRO system is criticised for hostile UIs, desktop-era
mobile experiences, and reporting that ends in Excel — while regulators cap
AI at *assistance* level. So AeroMRO's thesis is simple:

> **AI for language, UI for liability.** Claude drafts, triages, searches and
> explains. A named licence holder signs. Every AI-proposed change needs an
> explicit human confirmation, and the regulatory acts — sign-off, independent
> inspection, CRS, deferral, quarantine — have no AI pathway at all.

**Live demo:** a private deployment exists (access on request from the
maintainer) — or stand up your own instance in ~15 minutes with the guide
below. Sign-in is allow-listed: a GitHub account or a username/password
created in Settings → User management.

> **Demo only.** Fictional airline *Albion Atlantic Airways*. No real
> operational data. AI outputs are decision-support only. All features derive
> from published regulation and public industry sources, and all demo data is
> fictional — see [`docs/references.md`](docs/references.md) for full
> provenance.

## What it does

| Module | Regulatory basis | In the app |
|--------|------------------|-----------|
| **Dashboard** | — | Fleet posture with **drill-down stat tiles**, a "needs attention" list aggregating every compliance clock, and a one-tap **AI daily briefing** for the duty manager |
| **My Work** | Part-66 | The engineer's workbench: your cards, inspections waiting on you, your week's roster, licence countdown — sign off without leaving the page. **Identity-bound** when your login is linked to an engineer |
| **Fleet** | Part-CAMO | 100-aircraft register (5 curated + 95 deterministically generated), hours/cycles, status, next programme due — click a tail for its detail panel |
| **Dent & buckle** | SRM / M.A.305 | Per-aircraft **rendered SVG schematic** with numbered damage markers (dents, lightning strikes, corrosion…), SRM references, within/beyond-limits state, click-to-place recording — 197 records fleet-wide |
| **Photo library** | records | Real reference photos per tail (seeded from Wikimedia Commons) with an add-photo form |
| **Tech Log** | 145.A.45 / e-tech-log | Per-sector flight records; closing a sector rolls FH/FC onto the airframe |
| **Defects** | MEL / MMEL | Defect register with live **MEL rectification clocks** (Cat A/B/C/D) + AI triage |
| **Work Orders** | 145.A.45(e) / 145.A.48 | Task cards with **per-card sign-off** and **enforced independent inspection** (inspector ≠ signer) |
| **CRS release** | 145.A.50 | Release gated on live Part-66 licence/type-rating/authorisation checks **and** every card being signed & inspected |
| **Planning** | CAMO.A.315 / M.A.305 | Maintenance-programme due list (FH/FC/calendar, whichever first) + **life-limited part** consumption tracking |
| **Parts & Stores** | 145.A.42 | Form 1 traceability, shelf-life alerts, quarantine segregation, locations |
| **Tooling** | 145.A.40 | Calibration register with recall; overdue tools cannot return to service |
| **AD / SB** | Part-CAMO | Per-aircraft compliance, deadlines, repetitive intervals |
| **Reliability** | reliability programme | Defect trends by ATA, rates per aircraft, **chronic-defect detection** (repeat offenders / NFF risk) |
| **Quality & Audit** | 145.A.65 | Audits, findings, CAPA tracking; findings can't close without a corrective action |
| **Certifying Staff** | Part-66 | Licence categories, type ratings, expiry, company authorisation |
| **Workforce Planning** | 145.A.30 | Duty roster, man-hour plan (capacity vs open backlog per base), **certifying-coverage gap detection**, licence-renewal horizon |
| **Settings** | — | Dark/light/system theme, Claude key management, **user management** (create/remove logins, engineer linking), one-click **demo data reset** (date-shifted seed, preserves added engineers) |

### The AI layer (Claude)

1. **Agentic assistant, docked beside the app** (**⌘J**) — ask anything, or ask
   it to *do* anything: raise defects, open work orders, add task cards, record
   sectors, change aircraft status. It's a side panel, not a tab, so it
   **navigates the app while you watch** and keeps the conversation as the view
   changes beneath it. Replies stream in and can be stopped mid-flight. Every
   proposed write appears as a **pending action card** you confirm or decline;
   confirmed actions are audit-logged as `AI assistant (confirmed by <you>)`.
   Regulatory acts are deliberately not available as tools — it takes you to the
   right view instead.
2. **Damage assessment from a photo** — photograph a dent at the aircraft (the
   file input opens the phone camera) and Claude proposes the damage type,
   station, dimensions and recommended action, with its reasoning and confidence,
   pre-filling the damage record for the engineer to correct and save. It may
   *advise* on SRM limits; **the within/beyond-limits determination stays with the
   licence holder**, and nothing auto-saves.
3. **Defect triage** — paste a raw write-up; structured classification (ATA
   chapter, severity, AOG risk, suggested MEL category) via
   JSON-schema-constrained output.
4. **CRS statement drafting** — a Part-145.A.50 release statement from the
   completed task cards, ready for the certifying engineer to review and sign.
5. **Daily briefing** — one tap on the Dashboard streams the duty manager's
   morning brief from live data, most urgent first.

(The MCP server below is the sixth AI surface.) See
[`docs/ai-design.md`](docs/ai-design.md) for the UI-vs-AI decision framework
and [`ROADMAP.md`](ROADMAP.md) for the research behind it.

### Fast to drive

**⌘K / Ctrl+K or `/`** opens a command palette that searches everything —
aircraft, defects, work orders, parts, tools, staff, ADs, audits — with
results deep-linking to the exact record, and any query can be handed straight
to the AI assistant. **`g` + a letter** jumps to any view (`g x` defects,
`g w` work orders — press `?` for the full map). Every entity reference in
every table is a **cross-link** (defect → aircraft → tech log → work order →
source defect…), and breadcrumbs keep you oriented. See
[`docs/path-to-v1.md`](docs/path-to-v1.md) for the plan (phases, integrations,
effort) to take this from demonstration to production.

### Tested

`bun test` runs 42 unit tests over the pure compliance functions;
`bunx playwright test` runs 14 UX tests (desktop Chrome + iPhone 14 WebKit)
against a real authenticated session — they've caught genuine bugs, including
a BST date off-by-one, dead mobile touch-target CSS, and a TRUNCATE CASCADE
that wiped the sign-in allow-list. GitHub Actions CI runs tests + build on
every push.

### MCP server — drive it from Claude Code

`mcp/server.ts` is a stdio MCP server exposing the system as 12 typed,
compliance-aware tools (`fleet_status`, `due_list`, `open_defects`,
`work_order_status`, `coverage_and_staff`, `stores_and_tooling_alerts`, plus
writes: `raise_defect`, `open_work_order`, `add_task_card`, `record_sector`,
`set_roster`, `reset_demo`). It imports the exact same pure functions from
`src/lib/compliance.ts` that drive the UI — one source of regulatory truth.
The same red lines apply: sign-off, inspection, CRS, deferral and quarantine
have no tools; writes are audit-logged as `MCP (Claude Code)`, and the MCP
client's permission prompt is the human-confirmation step.

Setup: add `SUPABASE_SERVICE_KEY=<service_role key>` to `.env.local`
(dashboard → Settings → API — server-side only, never `VITE_`-prefixed). The
server is registered in `.mcp.json` and starts automatically in Claude Code.
Verify with `bun mcp/smoke.ts`.

### Designed for the hangar floor

The research is unambiguous: the mechanic at the aircraft is every incumbent's
weakest link. On an iPhone/iPad the app switches to bottom-tab navigation with
44 pt touch targets, safe-area insets, and 16 px inputs (no iOS zoom-on-focus).
Semantic HTML, ARIA labelling, keyboard navigation and visible focus states
throughout.

## Stack

- **Frontend:** Vite + React + TypeScript — run with `bun`, deploy to
  Cloudflare Pages with Wrangler
- **Backend:** Supabase — Postgres (migrations as single source of truth,
  allow-listed RLS, invariants in triggers/constraints) + Auth (GitHub OAuth
  and username/password; engineer-linked logins bind sign-offs to identity —
  see [`AUTH.md`](AUTH.md))
- **AI:** Claude (`claude-opus-4-8`) — runtime key in Settings (memory-only,
  never persisted; everything except the ✨ features works without one) or
  server-side via `workers/ai-proxy`
- **Testing:** bun test + Playwright + GitHub Actions CI

## Quick start (existing instance)

```bash
bun install
bun run dev        # http://localhost:5173 — .env.local already points at the demo DB
bun run deploy     # Cloudflare Pages (maintainer only)
```

## Stand up your own instance

Everything you need is in this repo — you supply free-tier **Supabase** and
**Cloudflare** accounts. ~15 minutes.

**1. Clone and install**

```bash
git clone https://github.com/DavidROliverBA/aero-mro && cd aero-mro
bun install
```

**2. Supabase (database + auth)** — create a project at
[supabase.com](https://supabase.com) (free tier is fine), then:

```bash
brew install supabase/tap/supabase   # or see supabase.com/docs for your OS
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                     # applies every migration, in order
```

That replays the full history — schema, RLS, functions — and leaves the
database seeded with the 100-aircraft demo (a final consolidation migration
guarantees the definitive function bodies).

**3. Create your first login** — accounts are normally made in Settings, but the
very first one needs bootstrapping (creating accounts requires an existing
**admin**). In the Supabase dashboard **SQL Editor**, run — changing the username
and password. Note `user_id`: access is granted to the authenticated *identity*,
so an allow-list row that isn't bound to a real auth user grants nothing.

```sql
do $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
    updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'admin@aeromro.demo', extensions.crypt('CHANGE-THIS-PASSWORD', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    '{"user_name":"admin"}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', 'admin@aeromro.demo', 'email_verified', true),
    'email', now(), now(), now());
  insert into allowed_users (username, auth_kind, user_id, is_admin)
  values ('admin', 'password', uid, true);

  -- Drop the demo allow-list entries seeded by the migrations. Leave them and
  -- those GitHub/username holders could sign in to YOUR instance.
  delete from allowed_users where username in ('DavidROliverBA', 'ux-test');
end $$;
```

(Prefer GitHub sign-in? Follow [`AUTH.md`](AUTH.md) and instead insert your
GitHub login with no `user_id`: `insert into allowed_users (username, auth_kind,
is_admin) values ('<your-github-username>', 'github', true);` — a trigger binds
the row to your identity on first sign-in, which is how a GitHub user can be
pre-authorised before they have an account.)

**4. Configure and run** — copy `.env.example` to `.env.local`, fill in your
project URL and publishable key (dashboard → Settings → API), then:

```bash
bun run dev        # http://localhost:5173 — sign in as admin
```

Create further accounts in **Settings → User management**. If you use the
Supabase MCP or the AeroMRO MCP server, update the `project_ref` in
`.mcp.json` and add `SUPABASE_SERVICE_KEY` to `.env.local`.

**5. Cloudflare (hosting)** — free account at
[cloudflare.com](https://cloudflare.com), then:

```bash
bunx wrangler login
bun run deploy     # creates the Pages project, prints your *.pages.dev URL
```

(Optionally change `--project-name` in `package.json` first. If using GitHub
OAuth, add your new URL to the redirect lists per `AUTH.md`.)

**6. AI features** — paste an Anthropic API key in Settings at runtime, or
keep the key server-side: `cd workers/ai-proxy && bunx wrangler secret put
ANTHROPIC_API_KEY && bunx wrangler deploy`, then set `VITE_AI_PROXY_URL` in
`.env.local` and redeploy.

## Security notes

- **Allow-listed access**: RLS on every table requires membership in
  `allowed_users`, matched on the **authenticated user id** (`auth.uid()`) — never
  on JWT metadata, which is client-writable and would let any signed-in user
  self-grant access. Admin acts (user management, demo reset) need
  `allowed_users.is_admin`; there is no in-app path to self-promote.
- The **audit log is append-only** — no update/delete policies exist. `actor`
  carries the engineer attribution, but a trigger stamps `actor_user` with the
  authenticated identity server-side, so a forged actor can't hide who was signed in.
- **Any new `security definer` function must `revoke ... from public, anon`** —
  Supabase's default privileges grant EXECUTE to `anon` explicitly, so revoking
  from `public` alone leaves it callable, unauthenticated, over PostgREST.
- **Invariants live in Postgres**: FH/FC roll-up trigger, WO-number sequence,
  unique card sequence, inspector ≠ signer constraint — enforced identically
  for the app, the MCP server, and any future client.
- The Claude key is entered at runtime and held in memory; for zero
  browser exposure, deploy `workers/ai-proxy` and set `VITE_AI_PROXY_URL`.
- The publishable Supabase key is client-safe by design.

## Project layout

```
ROADMAP.md            market research synthesis + feature roadmap
docs/
  architecture.md     how the pieces fit
  ai-design.md        the UI-vs-AI decision framework
  compliance-map.md   feature → regulation traceability
  references.md       data provenance + public sources for every idea
  build-log.md        the session record
supabase/migrations/  the database, in order (schema → RLS → modules → hardening)
workers/ai-proxy/     Cloudflare Worker keeping the Claude key server-side
mcp/                  stdio MCP server + smoke test
tests/                Playwright UX suites (desktop + iPhone) + auth helper
src/
  lib/
    supabase.ts       client
    types.ts          row types
    compliance.ts     MEL clocks, Part-66 gates, due lists, LLPs, chronic defects (pure fns)
    ai.ts             Claude: triage, CRS drafting, agentic tool-use assistant
    actions.ts        snapshot builder + confirmed-action executor (audit-logged)
  views/              one file per module
  components/         ui.tsx (pills, stat cards, life bars, entity links),
                      CommandPalette.tsx, DamageSchematic.tsx (SVG dent & buckle)
```
