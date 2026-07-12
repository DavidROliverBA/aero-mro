# Build log — the session

AeroMRO was built end-to-end by **Claude Fable 5** (Anthropic's Mythos-class
model) working through Claude Code — orchestrating Sonnet agents for parallel
view-building and finder sweeps, and Opus agents for UX judgment work, with
Fable doing the research synthesis, architecture, compliance logic, AI layer
and integration itself. It exists to demonstrate what Fable can do in
aviation tooling. This log is the record of the session itself: 23 commits over
2026-07-10 → 2026-07-12, from empty repo to the live system at
https://aero-mro.pages.dev.

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

## Where everything stands

- **Live**: https://aero-mro.pages.dev (Cloudflare Pages, `bun run deploy`)
- **Database**: Supabase `biffxhtytzdcfsbxscwm`, 20 tables, 14+ migrations,
  allow-listed RLS, append-only audit log. `reset_demo_data()` restores the
  full date-shifted demo (preserving added engineers and the user registry).
- **Accounts**: GitHub OAuth (allow-listed) + username/password. Guest
  logins `guest1`–`guest5` (password = username) for demonstrations.
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

Every one found by a verification layer, not by a user — which is the
demonstration working as intended.
