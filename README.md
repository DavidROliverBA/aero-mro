# AeroMRO

A prototype **Maintenance, Repair & Overhaul (MRO) system** for the Engineering
group of a major airline, modelled on **UK CAA / EASA Part-145** (Approved
Maintenance Organisation), **Part-CAMO** (Continuing Airworthiness Management)
and **Part-66** (certifying-staff licensing). Claude is woven in to make the
system faster and more intelligent to use.

> **Demo only.** Fictional airline *Albion Atlantic Airways*. No real airline
> operational data. AI outputs are decision-support only — a licensed engineer
> always makes the airworthiness determination.

## What it does

| Area | Regulatory basis | In the app |
|------|------------------|-----------|
| **Fleet** | Part-CAMO continuing airworthiness | Aircraft register, hours/cycles, next check, AOG status |
| **Defects** | MEL / MMEL deferrals | Tech-log entries + deferred defect register with live **MEL rectification clocks** (Cat A/B/C/D) |
| **Work orders & task cards** | Part-145 maintenance data | Work packages, task cards, independent-inspection flags |
| **CRS release** | Part-145.A.50 | Issue a Certificate of Release to Service — **gated on a live Part-66 licence + type-rating check** |
| **Parts & stores** | EASA Form 1 traceability | Serialised rotables, condition, Form 1 refs, shelf life |
| **AD / SB** | EASA / UK CAA directives | Per-aircraft compliance with deadline and repetitive-interval tracking |
| **Certifying staff** | Part-66 | Licence categories, type ratings, expiry, company authorisation |

### AI features (Claude)

1. **Defect triage** — paste a raw defect report; Claude returns a structured
   classification (ATA chapter, severity, AOG risk, suggested MEL category,
   recommended actions) via JSON-schema-constrained output. Saving applies the
   MEL category and sets the rectification deadline automatically.
2. **CRS statement drafting** — generates a Part-145.A.50-compliant release
   statement from the completed task cards.
3. **Fleet assistant** — ask questions in plain English ("which licences are
   expiring?", "what's AOG and why?"); Claude reasons over a live snapshot of
   your data and flags compliance risks. It never invents records.

## Stack

- **Frontend:** Vite + React + TypeScript (run with `bun`)
- **Backend:** Supabase (Postgres + REST + row-level security)
- **AI:** Claude (`claude-opus-4-8`) via direct browser `fetch`

## Setup

### 1. Database (one-time)

In the [Supabase SQL Editor](https://biffxhtytzdcfsbxscwm.supabase.co) for this
project, run — in order:

1. `supabase/schema.sql` — creates tables, enums, indexes, RLS policies
2. `supabase/seed.sql` — loads the fictional fleet

(The publishable key can't create tables, so this step is done in the SQL editor,
not by the app.)

### 2. Run the app

```bash
cd ~/github/aero-mro
bun install
bun run dev        # http://localhost:5173
```

`.env.local` is already populated with this project's Supabase URL and
publishable key. To point at a different project, edit it (see `.env.example`).

### 3. Enable AI

Click **Set Claude API key** in the sidebar and paste a key (`sk-ant-…`). It is
held in memory only — never written to disk. Without a key the app is fully
usable; only the ✨ AI actions are disabled.

## Security notes

- The **publishable** Supabase key is client-safe. RLS is enabled; the demo
  policies grant the anon role full access so the single-page app works with
  only that key. In production, scope policies to authenticated roles
  (certifying staff / planning / quality).
- Calling the Anthropic API **directly from the browser** exposes the API key to
  the client. Fine for a local single-user demo; for a real deployment, proxy
  those calls through a backend so the key stays server-side.

## Project layout

```
supabase/
  schema.sql        Part-145/CAMO data model + RLS
  seed.sql          fictional fleet
src/
  lib/
    supabase.ts     client
    types.ts        row types
    compliance.ts   MEL clocks, Part-66 privilege checks, AD alerts (pure fns)
    ai.ts           Claude integration (triage / CRS draft / assistant)
  views/            Dashboard, Fleet, Defects, WorkOrders, Parts, Directives, Engineers, Assistant
  components/ui.tsx  shared pills / cards
```
