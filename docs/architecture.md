# Architecture

```
┌──────────────────────── Browser (React SPA) ─────────────────────────┐
│  views/*        one file per module (Dashboard … Assistant)          │
│  lib/compliance pure regulatory logic (clocks, gates, due lists)     │
│  lib/ai         Claude calls: triage / CRS draft / agent tool-loop   │
│  lib/actions    snapshot builder + confirmed-action executor         │
│  lib/supabase   supabase-js client (publishable key)                 │
└──────┬───────────────────────────────┬──────────────────────────────┘
       │ REST + RLS (authenticated)    │ fetch (runtime-pasted key)
┌──────▼──────────────┐         ┌──────▼──────────────┐
│ Supabase (Postgres) │         │ Anthropic API       │
│ GitHub OAuth · RLS  │         │ claude-opus-4-8     │
└─────────────────────┘         └─────────────────────┘
        Deployed to Cloudflare Pages (aero-mro.pages.dev)
```

## Data model (15 tables)

Fleet & ops: `aircraft`, `flights` (tech log), `defects`, `engineers`.
Maintenance: `work_orders`, `task_cards` (with sign-off + inspection columns),
`crs_releases`, `mp_tasks` + `mp_compliance` (programme), `llp_components`.
Resources: `parts`, `tools`. Compliance: `airworthiness_directives` +
`ad_compliance`, `audits` + `audit_findings`, `audit_log` (append-only trail).

`supabase/migrations/` is the source of truth; the seed is engineered around
`current_date` so the demo always shows live compliance states (an overdue
check, an imminent A-Check, a 97%-consumed LLP, an out-of-calibration tool, an
overdue audit finding, a chronic-defect pattern).

## Design decisions

- **All regulatory logic is pure functions** (`lib/compliance.ts`) — no
  I/O, unit-testable, and the same functions drive badges, tables and gates so
  the UI can't disagree with itself.
- **One store, one reload.** App.tsx fetches all 15 tables in parallel into a
  single `Store` passed down as props. At demo scale (~100 rows) this keeps
  every view instantly consistent after any write. A real system would move to
  per-view queries + realtime subscriptions.
- **Writes are explicit.** Views write via supabase-js and append an
  `audit_log` row; the assistant's writes go through `executeAction` only
  after human confirmation.
- **Sign-off integrity in data, not convention:** `task_cards` carries
  `completed_by/at` and `inspected_by/at`; `cardGate` enforces
  inspector ≠ signer; `crsBlockers` aggregates unmet gates and disables CRS.
- **Responsive shell, not a separate app.** Same components; CSS swaps the
  sidebar for a bottom tab bar + "More" sheet under 768 px, with safe-area
  insets and 44 pt targets. No local state is lost switching form factors.
- **RLS everywhere.** Every table has a single `auth_all` policy scoped to
  `authenticated`; anonymous REST reads return nothing.

## Known demo shortcuts

- Aircraft FH/FC roll-forward happens in app code when a sector closes — a
  real system would do it in a Postgres trigger.
- The Claude key lives in browser memory; production proxies via a Worker.
- No offline mode (top of Tier 2 in the roadmap — hangar dead zones are a
  documented pain point).
- Single organisation, single role; no per-role RLS yet.
