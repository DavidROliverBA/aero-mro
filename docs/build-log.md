# Build log — the session

AeroMRO was built end-to-end by **Claude Fable 5** (Anthropic's Mythos-class
model) working through Claude Code — orchestrating Sonnet agents for parallel
view-building and finder sweeps, and Opus agents for UX judgment work, with
Fable doing the research synthesis, architecture, compliance logic, AI layer
and integration itself. It exists to demonstrate what Fable can do in
aviation tooling. This log is the record of the session itself: 23 commits over
2026-07-10 → 2026-07-12, from empty repo to a live, privately-deployed
system.

## Day 1 — 10 July

- **Bootstrap** (`7ee30b4`…`e682995`): Part-145/CAMO schema + seed on
  Supabase, Vite/React frontend, Claude defect triage + CRS drafting,
  GitHub OAuth sign-in, RLS locked to authenticated, first Cloudflare
  Pages deploy.

## Day 2 — 11 July (the big day)

- **Research** — a 9-agent fan-out swept the MRO software market (AMOS, TRAX,
  Ramco, IFS et al.), user pain points, e-tech-log adoption, Part-145/CAMO
  regulatory workflows, and contrarian evidence. Synthesised into
  [ROADMAP.md](../ROADMAP.md) with the design thesis: *AI for language, UI
  for liability.*
- **Comprehensive build** (`f1fa5fe`): tech log, task-card sign-off with
  enforced independent inspection, AMP due list, LLPs, tooling calibration,
  stores shelf-life/quarantine, reliability analytics with chronic-defect
  detection, quality/CAPA, the agentic assistant with confirm-cards, and the
  mobile-adaptive shell. Foundations by Fable; six views by parallel Sonnet
  agents; a 6-angle multi-agent code review found and fixed real bugs
  (assistant tool-protocol races, stale-store writes, a zero-interval
  due-list edge).
- **Workforce planning** (`be4a8e8`): roster, 145.A.30 man-hour plan,
  certifying-coverage gap detection — plus a BST timezone off-by-one found by
  unit-checking the pure functions.
- **UX pass** (`2a6b960`): My Work workbench, ⌘K command palette, AI daily
  briefing, [path-to-v1](path-to-v1.md).
- **Settings** (`960b9a8`): theme, key management, demo reset (`reset_demo_data()`).
- **MCP server** (`ae7ce31`): the system as 12 compliance-aware stdio tools
  sharing `src/lib/compliance.ts` with the UI.
- **Navigation layer** (`f0fbd23`): entity cross-links with deep-link focus,
  breadcrumbs, `g`+key shortcuts. Two Opus agents drove the app through
  Playwright (desktop + iPhone) — 14 tests, first run 14/14 scenarios
  designed, and they caught dead mobile touch-target CSS (source-order
  defeat of the 44px rules).
- **Hardening** (`5df92f0`): allow-list RLS, append-only audit log, DB
  invariants (FH/FC roll-up trigger, WO sequence, card constraints),
  Cloudflare Worker AI proxy, 42 unit tests, GitHub Actions CI.
- **Username/password accounts** (`1d7fb43`): on Supabase Auth (GoTrue does
  the credentials), admin user management in Settings, engineer-linked
  identity binding for sign-offs.

## Day 3 — 12 July

- **100-aircraft fleet + drill-downs** (`a920926`): deterministic generator
  inside the reset; dashboard stat tiles deep-link. The scale-up exposed a
  genuine lockout bug — a new FK put `allowed_users` inside the reset's
  `TRUNCATE … CASCADE` blast radius — caught by the Playwright suites going
  red, fixed structurally.
- **Add engineer form** (`92433dc`), reset preserving added engineers
  (`3c0a696`).
- **Dent & buckle charts** (`5cc820f`, `c42a85c`): rendered SVG schematics
  with click-to-place damage records, SRM limits, photo library from
  Wikimedia Commons; then 197 records generated across all 100 aircraft
  (a modular-arithmetic quirk that suppressed 'buckle' records was found in
  the distribution check and fixed).
- **Docs catch-up** (`f3b19bc`) and this log.

## Day 4 — 12 July (the audit)

A five-agent review swept the repo (architecture, security, product, testing,
UX). It found the two worst bugs of the whole build — both in the security
model, both live:

- **Authorisation was self-grantable.** `is_allowed()` keyed on
  `user_metadata.user_name`, which Supabase lets any user rewrite via
  `auth.updateUser()`. With GitHub OAuth open to any account, one console
  command bought full read/write plus user management.
- **The database could be wiped by a stranger.** `reset_demo_core()` and its
  two siblings were `security definer` and — via Supabase's default privileges —
  granted `EXECUTE` to `anon`. That makes them callable as unauthenticated
  PostgREST RPCs using the publishable key that ships in the JS bundle. The
  earlier `revoke all ... from public` was a no-op, because `public` ≠ `anon`.
  This one was found by an adversarial reviewer *attacking the fix* for the
  first bug — the fix would have gated the front door and left the back door open.

Fixed in `20260712192458_auth_identity_and_admin_tier`: authorisation now keys
on `auth.uid()`; an admin tier gates user management and the demo reset
(`service_role` passes it, so the MCP server still works); `audit_log.actor_user`
is set server-side by trigger, so a forged `actor` no longer hides who was
signed in. Verified by 20 adversarial probes against the live database —
including signing in as a rogue account, rewriting its metadata to impersonate
the admin, and confirming it reads zero rows.

Also fixed: `daysUntil` computed "today" in UTC (the BST rule violated in the one
function every compliance clock depends on); a deferred defect with no
rectification deadline rendered *green*; a maintenance task that had **never been
performed** rendered *green*; the MEL threshold table was duplicated in the
Defects view; the manual defect insert was the only write in the app that skipped
`logAudit()`; and the assistant destroyed its own conversation whenever it used
its own `navigate` tool (the view unmounted mid-turn). A new guard test asserts
the AI red lines can never be crossed by a future tool addition.

## Day 5 — 13 July (the copilot)

- **The assistant became a dock** — a side panel (⌘J) that stays open over any
  view, so it narrates while the app changes beneath it, instead of being a tab
  you leave the app to visit. It keeps ONE position in the component tree across
  hidden/inline/docked modes: moving it would remount it and destroy the
  transcript, which is the bug day 4 had just fixed. A flex item's min-content
  floor silently defeated the panel's padding and let the view slide underneath
  it — caught by asserting the geometry in a Playwright test rather than trusting
  a screenshot, and fixed with `min-width: 0`.
- **Vision: damage assessment from a photo** — photograph a dent, get a proposed
  damage record (type, station, dimensions, reasoning, confidence). The red line
  is drawn where it matters: the model may *advise* on SRM limits, but the
  within/beyond determination is the licence holder's and nothing auto-saves.
- **Streaming + cancel** — replies render as they arrive and can be stopped.
  Aborting discards the partial turn rather than committing it, because a
  `tool_use` block left without its `tool_result` corrupts the next message.
- **The AI proxy was an open relay** — it forwarded any POST to Anthropic with
  the API key and no authentication (CORS governs what a *browser* may read; it
  stops nothing else). It now verifies the caller's Supabase token, and it is
  **deployed**: as a same-origin Pages Function (`functions/api/ai.ts`) rather
  than a standalone Worker, because the account has no `workers.dev` subdomain —
  which turned out better, since same-origin removes CORS from the picture
  entirely. The key now lives in Cloudflare, and a demo no longer opens with
  someone pasting an API key into Settings.

## Where everything stands

- **Live**: private Cloudflare Pages deployment (`bun run deploy`; URL not
  published)
- **Database**: Supabase `biffxhtytzdcfsbxscwm`, 20 tables, 14+ migrations,
  allow-listed RLS, append-only audit log. `reset_demo_data()` restores the
  full date-shifted demo (preserving added engineers and the user registry).
- **Accounts**: GitHub OAuth (allow-listed) + username/password. Demo guest
  logins exist; credentials are held privately, not in this repo.
- **AI**: in-app assistant/triage/CRS-drafting/briefing (runtime key, or
  deploy `workers/ai-proxy`); MCP server `mcp/server.ts` for Claude Code
  (`LIVE=1 bun mcp/smoke.ts` to verify).
- **Tests**: `bun test` (42), `bunx playwright test` (14, authenticated via
  `tests/save-auth-state.ts`), CI on push.

## Bugs the harness caught (the honest tally)

1. Assistant tool_use/tool_result protocol races (multi-agent code review).
2. Stale-store absolute writes losing flight hours (code review).
3. BST timezone off-by-one in horizon maths (unit checking).
4. Dead mobile touch-target CSS via source-order defeat (Playwright/iPhone).
5. `TRUNCATE CASCADE` wiping the sign-in allow-list via a new FK (Playwright).
6. Damage-type distribution hole from shared modular factors (data check).
7. Authorisation keyed on a user-writable JWT claim — self-grantable admin
   access (security review, day 4).
8. `security definer` reset helpers granted to `anon` — an *unauthenticated*
   database wipe, and strictly worse than #7. Found by an adversarial agent
   sent to break the fix for #7, not by the review that found #7 (day 4).
9. A deferred defect with no rectification deadline, and a maintenance task
   never once performed, both rendered **green** (day 4).

Every one found by a verification layer, not by a user — which is the
demonstration working as intended. Note the shape of #8 in particular: the
review found a hole, the fix closed it, and only *attacking the fix* revealed
the bigger hole beside it. One adversarial pass is not enough.
