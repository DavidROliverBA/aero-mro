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
        Deployed to Cloudflare Pages (private URL)
```

## Data model (20 tables)

Fleet & ops: `aircraft`, `flights` (tech log), `defects`, `engineers`,
`damage_records` (dent & buckle, schematic coordinates), `aircraft_photos`.
Maintenance: `work_orders`, `task_cards` (with sign-off + inspection columns),
`crs_releases`, `mp_tasks` + `mp_compliance` (programme), `llp_components`.
Resources: `parts`, `tools`. People: `roster_entries` (workforce),
`allowed_users` (sign-in registry + engineer links). Compliance:
`airworthiness_directives` + `ad_compliance`, `audits` + `audit_findings`,
`audit_log` (append-only — no update/delete policies).

`supabase/migrations/` is the source of truth; the seed is engineered around
`current_date` so the demo always shows live compliance states (an overdue
check, an imminent A-Check, a 97%-consumed LLP, an out-of-calibration tool, an
overdue audit finding, a chronic-defect pattern, weekend coverage gaps, a
beyond-limits lightning strike). `reset_demo_data()` restores it all on
demand: 5 curated hero aircraft + 95 deterministically generated ones
(`setseed`, identical fleet every reset), 197 damage records, while
preserving user-added engineers and the sign-in registry.

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
  Postgres backs it up with a check constraint, a unique card sequence, a
  WO-number sequence, and the FH/FC roll-up as a trigger — one write-path
  contract shared by the app and the MCP server.
- **Deep-linking without a router:** `go(tab, focusId)` carries a record id;
  views select/highlight it. Entity links, palette results and dashboard
  tiles all ride the same mechanism.
- **Responsive shell, not a separate app.** Same components; CSS swaps the
  sidebar for a bottom tab bar + "More" sheet under 768 px, with safe-area
  insets and 44 pt targets. No local state is lost switching form factors.
- **RLS everywhere, keyed on identity.** Every table has a single policy scoped to
  `authenticated` and gated on `is_allowed()`, which matches `auth.uid()` against
  `allowed_users.user_id`. It deliberately does *not* read the JWT's
  `user_metadata` — that claim is client-writable, and when `is_allowed()` trusted
  it, any signed-in user could self-grant full access. Admin acts (user management,
  demo reset) additionally require `is_admin()`. Anonymous reads return nothing, and
  no `security definer` function is callable by `anon`.

## Known demo shortcuts

- The Claude key lives in browser memory unless `workers/ai-proxy` is deployed
  and `VITE_AI_PROXY_URL` set (the Worker exists in-repo, undeployed).
- No offline mode (top of Tier 2 in the roadmap — hangar dead zones are a
  documented pain point).
- Single organisation; one access level (allow-listed), no per-role RLS yet.
- Damage positions are schematic fractions, not SRM frame/stringer
  coordinates; photos are hot-linked URLs, not stored objects.
- Whole-store loading is still fine at 100 aircraft / ~900 rows, helped by
  the id→record lookup maps; real scale means per-view queries + realtime.
