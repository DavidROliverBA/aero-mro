# AeroMRO ✈

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

**Live demo:** https://aero-mro.pages.dev (GitHub sign-in required)

> **Demo only.** Fictional airline *Albion Atlantic Airways*. No real
> operational data. AI outputs are decision-support only.

## What it does

| Module | Regulatory basis | In the app |
|--------|------------------|-----------|
| **Dashboard** | — | Fleet posture, a "needs attention" list aggregating every compliance clock, and a one-tap **AI daily briefing** for the duty manager |
| **My Work** | Part-66 | The engineer's workbench: your cards, inspections waiting on you, your week's roster, licence countdown — sign off without leaving the page |
| **Fleet** | Part-CAMO | Register, hours/cycles, status, next programme due per tail |
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

### The AI layer (Claude)

1. **Agentic assistant** — ask anything, or ask it to *do* anything: raise
   defects, open work orders, add task cards, record sectors, change aircraft
   status. Every proposed write appears as a **pending action card** you
   confirm or decline; confirmed actions are audit-logged as
   `AI assistant (confirmed by <you>)`. It navigates the app for you and
   flags compliance risks unprompted. Regulatory acts are deliberately not
   available as tools — it takes you to the right view instead.
2. **Defect triage** — paste a raw write-up; structured classification (ATA
   chapter, severity, AOG risk, suggested MEL category) via
   JSON-schema-constrained output.
3. **CRS statement drafting** — a Part-145.A.50 release statement from the
   completed task cards, ready for the certifying engineer to review and sign.

See [`docs/ai-design.md`](docs/ai-design.md) for the UI-vs-AI decision
framework and [`ROADMAP.md`](ROADMAP.md) for the research behind it.

### Fast to drive

**⌘K / Ctrl+K** opens a command palette that searches everything — aircraft,
defects, work orders, parts, tools, staff, ADs, audits — and any query can be
handed straight to the AI assistant. See [`docs/path-to-v1.md`](docs/path-to-v1.md)
for the plan (phases, integrations, effort) to take this from demonstration
to production.

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

- **Frontend:** Vite + React + TypeScript — run with `bun`, deploy with Wrangler
- **Backend:** Supabase (Postgres + REST + row-level security + GitHub OAuth)
- **AI:** Claude (`claude-opus-4-8`) via direct browser `fetch` with a
  runtime-pasted key

## Setup

### 1. Database

`supabase/migrations/` is the single source of truth — apply in order via the
Supabase CLI or MCP. The final state includes RLS restricted to an
`allowed_users` GitHub allow-list, an append-only audit log, DB-enforced
invariants (FH/FC roll-up trigger, WO numbering sequence, unique card
sequence, independent-inspector constraint) and the `reset_demo_data()`
function.

### 2. Auth

Two ways in, both via Supabase Auth: **GitHub OAuth** (see [`AUTH.md`](AUTH.md))
or **username + password** accounts created in Settings → User management
(credentials bcrypt-hashed by GoTrue; usernames map to synthetic
`@aeromro.demo` emails). Both feed the same `allowed_users` registry that RLS
checks on every table. Linking an account to an engineer binds My Work and
task sign-offs to the login identity.

### 3. Run

```bash
bun install
bun run dev        # http://localhost:5173
bun run deploy     # Cloudflare Pages (see DEPLOY.md)
```

`.env.local` carries the Supabase URL + publishable key (client-safe).

### 4. Enable AI

Click **Set Claude API key** in the sidebar and paste a key (`sk-ant-…`). Held
in memory only — never persisted. The app is fully usable without it; only the
✨ features disable.

## Security notes

- The publishable Supabase key is client-safe; RLS policies restrict every
  table to the `authenticated` role (see `supabase/migrations/…lock_rls…`).
- Browser-direct Anthropic calls expose the pasted key to the client —
  acceptable for a single-user demo. Production would proxy via a Cloudflare
  Worker (Tier 3 in the roadmap).
- Any GitHub account can currently sign in; restricting to named users is a
  documented next step in `AUTH.md`.

## Project layout

```
ROADMAP.md            market research synthesis + feature roadmap
docs/
  architecture.md     how the pieces fit
  ai-design.md        the UI-vs-AI decision framework
  compliance-map.md   feature → regulation traceability
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
  components/ui.tsx   pills, stat cards, life bars
```
