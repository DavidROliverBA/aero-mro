# Plan — AeroMRO everywhere: MCP, CLI, chat

**Status: proposed, not started.** Written 2026-07-13. The goal: any allow-listed
user can operate AeroMRO through whichever interface suits them — the app, an AI
client like Claude Code or claude.ai, a terminal, or a chat message from the
hangar floor — *without* weakening the design that makes it credible in a
regulated setting.

## Why this isn't just "add more surfaces"

Three facts about today's code decide the whole shape of this plan.

**1. The MCP server is a single-user developer tool wearing a god-mode key.** It
speaks stdio (so it only runs on one laptop), connects with the `service_role`
key — which **bypasses RLS entirely** — and audit-logs every write as the literal
string `MCP (Claude Code)`, with `actor_user` stamped `service_role`. There is no
user behind it. It also exposes `reset_demo`, which under a service key sails past
the `is_admin()` gate.

**2. Two tool surfaces are already drifting apart.** The in-app assistant has 7
tools; the MCP server has 12, with *different names for the same acts*
(`create_defect`/`raise_defect`, `record_flight`/`record_sector`,
`create_work_order`/`open_work_order`). The write logic is duplicated across
`src/lib/actions.ts` and `mcp/server.ts`, and a code review has already caught
them diverging. Adding a CLI and a chatbot on top would make four copies of every
write path.

**3. The red-lines guard checks two hand-maintained lists.** A `sign_task_card`
tool added to a future CLI would be caught by nothing.

So: **fix the core, and the surfaces come nearly free.**

---

## Step 1 — One tool core (the keystone)

Extract `src/lib/tools.ts`: a single registry where each tool declares its name,
description, JSON schema, read/write class, and **one** executor taking a context
(`{ db, actor }`). Every surface generates its interface from that one list.

- One write path instead of four. One naming scheme. No drift possible.
- **The red-lines guard then protects every surface at once**, present and future,
  instead of two lists someone must remember to update.
- `src/lib/compliance.ts` stays the single source of regulatory truth, as now.

*~1–2 days. Ships no feature — and makes everything after it safe.*

## Step 2 — Identity-bound remote MCP (the unlock)

Move MCP from stdio to **Streamable HTTP**, hosted as a Pages Function at `/mcp`
alongside the AI proxy. The critical change is not the transport, it's the
identity:

> **The server acts as the calling user, not as a service account.** It takes the
> caller's Supabase token and builds a per-request client with *that* token.

Everything else falls out of work already done:

- RLS and the allow-list apply automatically — a valid token with no allow-list
  row sees nothing.
- The `actor_user` trigger stamps the **real username** on every audit row:
  "Priya raised this defect" instead of "MCP (Claude Code)".
- `reset_demo` starts correctly refusing non-admins, because `is_admin()` finally
  sees a real user.
- The `service_role` key stops being handed to a network-reachable process.

**Auth: bearer first, OAuth after.**
- *Bearer* — the caller sends their Supabase access token. Works immediately with
  Claude Code (custom headers) and the CLI. ~2–3 days.
- *OAuth 2.1* — the MCP spec's flow, with Supabase as the identity provider, so
  any allow-listed user can add AeroMRO as a connector from claude.ai in a
  browser. ~2 further days.

Keep the stdio server for local development; it becomes a thin wrapper over the
same registry.

## Step 3 — The CLI

A `bun` binary, `aeromro`, that signs in, caches the token, and exposes the same
registry:

```
aeromro fleet --aog
aeromro defect raise G-ALBE "cabin temp sensor u/s, zone 2"
aeromro due --days 30 --json
aeromro ask "what's stopping G-ALBB flying today?"   # same agent loop as the app
```

Writes confirm interactively by default; `--json` makes it scriptable for ops and
CI. It inherits RLS, audit attribution and the red lines for free, because it goes
through the same core and the same token auth.

*~1–2 days on top of steps 1–2.*

## Step 4 — Slack

An inbound webhook mapping Slack identities to `allowed_users`, so a message from
a known engineer **runs as that engineer**. Confirm-cards become **Block Kit
buttons** — the human-in-the-loop model survives the change of medium intact,
which is precisely why this design holds up in a regulated setting:

> "Raise a defect on G-ALBE, cabin temp sensor u/s" → a card with **Confirm /
> Decline** → audit-logged to their name.

Natural extension: the daily brief posts itself to the ops channel each morning.

*~3–5 days, most of it identity mapping and platform plumbing.*

---

## The line that does not move

Every surface, including any not yet imagined: **no AI tool for task sign-off,
independent inspection, CRS, MEL deferral, quarantine, or finding closure.** Chat
can tell an engineer a card is ready to sign. It cannot sign it. After Step 1, one
test enforces that everywhere.

## What gets riskier

A hosted key plus remote surfaces means **anyone who can sign in can spend the
Anthropic quota**, now from four directions. Per-user rate limits and a spend cap
belong in Step 2, not bolted on afterwards. And it sharpens a known issue: the
demo guest logins are still `guest<n>`/`guest<n>`, and that fact sits in the
pre-scrub history of a public repo. Worth rotating before any of this is exposed.

## Sequence and effort

| Step | What | Effort | Why here |
|------|------|--------|----------|
| 1 | Shared tool core + universal red-lines guard | 1–2 d | Prerequisite for everything; removes existing drift |
| 2 | Remote MCP, per-user identity, bearer auth | 2–3 d | The unlock: real users, real RLS, real attribution |
| 2b | OAuth 2.1 for claude.ai connectors | ~2 d | One-click "Add AeroMRO" for non-technical users |
| 3 | CLI (`aeromro`, incl. `ask`) | 1–2 d | Nearly free once 1–2 exist |
| 4 | Slack bot with Block Kit confirm-cards | 3–5 d | The demo moment; needs identity mapping from step 2 |

**Total ~8–12 days**, sequenced so nothing is thrown away.
