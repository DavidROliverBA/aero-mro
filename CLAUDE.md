# CLAUDE.md — AeroMRO

AI-native Part-145/CAMO maintenance system demo (fictional "Albion Atlantic
Airways") built end-to-end by Claude Fable 5. Deployed privately to Cloudflare
Pages (URL not published; see `bun run deploy` output) · Supabase project
`biffxhtytzdcfsbxscwm` · Repo: DavidROliverBA/aero-mro.

**Read next when working here:** `docs/architecture.md` (how it fits),
`docs/ai-design.md` (what may be AI vs must be UI — hold this line),
`docs/build-log.md` (session history), `ROADMAP.md` (research + tiers),
`docs/references.md` (provenance rules — all data fictional, all sources public).

## Commands

```bash
bun run dev                 # http://localhost:5173
bun run build               # tsc -b && vite build
bun test                    # 42 unit tests (scoped to src/ via bunfig.toml)
bunx playwright test        # 14 UX tests, desktop + iPhone; auto-starts dev server
bun tests/save-auth-state.ts   # refresh the authenticated test session first
LIVE=1 bun mcp/smoke.ts     # verify the MCP server against the live DB
bun run deploy              # Cloudflare Pages (--force baked in) — get David's
                            # explicit go-ahead for every production deploy
```

## Hard rules (each one earned by a real bug)

- **Migrations**: apply via Supabase MCP `apply_migration`, then mirror the SQL
  into `supabase/migrations/<remote-version>_<name>.sql` (version from
  `list_migrations`). Never edit applied migrations.
- **Never add an FK that references a table in `reset_demo_data()`'s TRUNCATE
  list** without checking the CASCADE blast radius — one such FK on
  `allowed_users` wiped the sign-in registry and locked everyone out.
- **Never update `aircraft.total_hours/total_cycles` in app code** — the
  `trg_roll_flight` trigger owns the FH/FC roll-up. Same for `wo_number`
  (DB sequence default) and card sequences (unique constraint).
- **Authorisation keys on `auth.uid()`, never on JWT metadata.** `user_metadata`
  is client-writable (`auth.updateUser()`), so `is_allowed()` once let any signed-in
  user self-grant full access. `allowed_users.user_id` is the identity; the username
  is a display name. Same rule in the client — match on `user_id`, not `username`.
- **`revoke ... from public` does NOT remove Supabase's grants.** Default privileges
  grant EXECUTE to `anon`/`authenticated` *explicitly*, so `anon` must be named in
  the revoke. Three `security definer` reset helpers were callable unauthenticated
  via PostgREST RPC with the publishable key — an anonymous TRUNCATE of the DB.
  Any new `security definer` function: `revoke all ... from public, anon;` and grant
  back only what needs it. Admin-only acts gate on `is_admin()` (which passes for
  `service_role`, so the MCP server keeps working).
- **Local dates**: use `localIso`/`localIsoOffset` from `src/lib/compliance.ts`,
  never `toISOString().slice(0,10)` after local-date arithmetic (BST off-by-one).
- **Mobile CSS**: the touch-target media block at the END of `styles.css` must
  stay last — earlier equal-specificity base rules defeat it otherwise.
- **AI red lines**: task sign-off, independent inspection, CRS, MEL deferral,
  quarantine and finding closure get no AI tools — in the assistant, the MCP
  server, and anything new. AI proposes via confirm-cards; humans sign.
- **Compliance logic lives in `src/lib/compliance.ts` as pure functions** —
  UI, assistant snapshot, and `mcp/server.ts` all import the same functions.
  Never duplicate a threshold or rule elsewhere.
- **Every state-changing write** goes through `logAudit()` (or the MCP
  server's `audit()`); the audit_log is append-only by policy.

## Architecture in one breath

React/Vite SPA (no router — `go(tab, focusId)` deep-links); one `Store`
loaded whole (fine at demo scale, `aircraftById`/`engineersById` maps for
lookups); Supabase Postgres with allow-listed RLS (`allowed_users.username`
vs JWT `user_name`); auth = GitHub OAuth or username/password (usernames map
to `<u>@aeromro.demo`; accounts managed in Settings via SECURITY DEFINER
functions); AI = browser Claude calls (`claude-opus-4-8`, runtime key, or
deploy `workers/ai-proxy`); `mcp/server.ts` = 12-tool stdio MCP server
(needs `SUPABASE_SERVICE_KEY` in `.env.local`, present on David's machine).

## Demo operations

- `reset_demo_data()` (Settings button or `select reset_demo_data()`):
  restores 5 curated hero aircraft + 95 generated (deterministic), 197 damage
  records, photos — preserving user-added engineers and the user registry.
- Demo guest logins exist (credentials held privately by David — not in this
  repo). Test user `uxtest@aeromro.demo` (creds in `.env.local`) drives the
  Playwright suites. Guests are **non-admin**: no user management, no demo reset.
  `DavidROliverBA` is the only admin (`allowed_users.is_admin`); grant another via
  SQL/service key — there is deliberately no in-app path to self-promote.
- Adding people: Certifying Staff → Add engineer; Settings → User management
  → create account (optionally engineer-linked → identity-bound sign-offs).
- `.env.local` is gitignored and holds Supabase URL/key, service key, and
  test creds — never commit or print it.
