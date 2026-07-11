# AeroMRO — path to v1 and beyond

**What this document is.** AeroMRO was built as a demonstration of what
Claude (Fable) can do in aviation tooling: market research → cited roadmap →
a working 16-module Part-145/CAMO system with an agentic AI layer, built,
reviewed and deployed in roughly a day. This document is the honest
engineering plan for taking it from demonstration to a product a real
maintenance organisation could run on — phases, integrations, and effort.

**Effort units.** Estimates are in *engineer-months* (em) for a competent
full-stack team working AI-assisted (which this project demonstrates cuts
build time dramatically — treat the estimates as conservative). Elapsed time
is often dominated by the regulator, not the code.

---

## Where the demo stands (v0)

Working today: fleet, e-tech-log, defects with MEL clocks + AI triage, work
orders with per-card sign-off and enforced independent inspection, CRS gated
on live Part-66 privilege checks, AMP due list, LLP tracking, stores with
shelf-life/quarantine, tooling calibration, AD/SB, reliability analytics with
chronic-defect detection, quality/CAPA, workforce planning with
certifying-coverage gap detection, and an agentic assistant that can operate
every management function behind confirm-cards. Deployed on Cloudflare Pages
over Supabase with authenticated-only RLS.

Deliberate demo shortcuts: single shared role, sign-offs not bound to the
logged-in identity, app-enforced (not DB-enforced) invariants, whole-store
data loading, browser-held AI key, no offline mode, no printable outputs.

---

## Phase 1 — v1: credible pilot (target: one 5–50-tail CAMO/AMO)

The version you could put in front of a real (friendly) organisation for a
supervised pilot alongside their existing system.

| Workstream | What it means | Effort |
|-----------|----------------|--------|
| **Identity & authority** | Engineer = user account; sign-offs bound to the authenticated identity (you can only sign as yourself); roles (certifying/planner/stores/quality/CAMO) with per-role RLS; MFA; restricted sign-up | 2.5 em |
| **Database-enforced invariants** | FH/FC roll-up as trigger; WO numbers from sequences; `unique(wo, sequence)`; inspector ≠ signer constraint; status-transition checks; truly append-only audit log | 1 em |
| **Printable/regulatory outputs** | PDF work packs, CRS certificate, deferral log, audit evidence pack; Form 1 / 8130-3 rendering incl. dual-release wording | 1.5 em |
| **Scale & robustness** | Per-view queries + pagination + realtime subscriptions (drop the load-everything store); error monitoring; backups/DR; staging environment; CI with tests over the pure compliance functions | 2 em |
| **AI hardening** | Claude proxy via Cloudflare Worker (key server-side), usage audit, rate limits; prompt-injection review of snapshot contents | 1 em |
| **Exposition pack** | MOE/CAME amendment text describing the system, e-signature process, training and fallback procedures — written alongside the pilot customer | 0.5 em + customer time |
| **Total Phase 1** | | **~8–9 em ≈ 3 engineers × 3 months** |

**Exit criteria:** a named pilot organisation running dual-paper operations,
sign-offs legally attributable, authority informed.

## Phase 2 — v1.x: operational (paper withdrawal)

| Workstream | What it means | Effort |
|-----------|----------------|--------|
| **Approved maintenance data** | S1000D/iSpec 2200 ingestion; task cards generated from and hyperlinked to AMM/IPC; revision control flags affected open cards. The LLM does the heavy lifting here — this is a Fable showcase in its own right | 3–4 em |
| **Offline-first mobile** | PWA with local queue + sync and conflict handling (hangar dead zones are the #1 documented mobile complaint in incumbents) | 2 em |
| **Advanced e-signatures** | eIDAS AES/QES via a provider (e.g. a QTSP API) for CRS/Form 1/ARC; basic-level signatures documented for internal sign-offs | 1.5 em |
| **Occurrence reporting & SMS** | Hazard log, risk register, MOR submission (ECCAIRS 2 interface) — mandatory for Part-145 since Dec 2024 | 1.5 em |
| **CAMO completeness** | ARC workflow, AMP revision control with authority submission trail, reliability programme with statistical alert levels feeding interval escalation | 2 em |
| **Materials commerce** | Purchasing/RFQ, reorder points, warranty, tool loans; marketplace connectivity (see integrations) | 2 em |
| **Notifications** | Email/push when MEL clocks, AD deadlines, calibration, coverage gaps approach breach | 0.5 em |
| **Regulator engagement** | UK CAA Letter of No Objection for the e-tech-log; authority acceptance for e-records before paper withdrawal | ~0.5 em, **but 6–12 months elapsed** — start in Phase 1 |
| **Total Phase 2** | | **~13–14 em ≈ 4 engineers × 4–5 months** (regulator timeline dominates) |

## Phase 3 — v2: the wedge (what makes it a business)

The research finding that matters most: **this market is held together by
switching costs, not satisfaction** (~$400–600K, 6–12-month migrations,
dirty records). Features don't dislodge incumbents; solving migration does.

- **LLM-assisted data migration** — ingest an operator's real records
  (scanned logbooks, spreadsheets, legacy exports) into this schema with
  human-verification workflows and completeness scoring. This is the
  moat-breaker and the single strongest Fable use-case in the domain. (~4 em
  to a credible pilot capability, then continuous.)
- Full aircraft configuration trees (as-flying effectivity) beyond flat LLPs.
- Hangar/bay slot planning for heavy checks.
- Multi-tenant SaaS, per-tail pricing aimed at the underserved 5–50-tail
  segment; UK/EU data residency; SOC 2.

## Integration map

| System | Why | Direction | Effort | When |
|--------|-----|-----------|--------|------|
| **Identity provider** (Entra ID / Okta) | SSO, joiners/leavers, MFA | in | 0.5 em | v1 |
| **Flight ops / eTechLog feed** (ACARS, ELB APIs) | Automatic hours/cycles/sectors — kills manual entry drift | in | 1–2 em | v1.x |
| **OEM technical data** (S1000D/iSpec 2200 packages; Boeing/Airbus portals) | Approved maintenance data for task cards | in | with Phase 2 workstream | v1.x |
| **CAA/EASA AD feeds** | Auto-ingest new ADs, applicability triage (AI-assisted) | in | 1 em | v1.x |
| **eIDAS QTSP** (qualified signatures) | Legal CRS/Form 1/ARC signatures | out | with Phase 2 workstream | v1.x |
| **ECCAIRS 2** | Mandatory occurrence reporting | out | 0.5 em | v1.x |
| **Parts marketplaces** (ILS, PartsBase) + **Spec2000/AeroXchange** | Sourcing, POs, quotes from inside the system | both | 2 em | v2 |
| **Finance ERP** (SAP et al.) | WO cost roll-up, procurement sync — the #1 documented integration drift pain | both | 2 em+ | v2 |
| **Lessor/records platforms** (flydocs-class) | Redelivery evidence packs | out | 1 em | v2 |

## Risks, honestly

1. **Regulator acceptance is the critical path** — start the MOE/CAME and
   LNO conversations during Phase 1; everything else can parallelise.
2. **Data migration quality** decides pilot success (the AirAsia failure
   pattern). Never bulk-load unverified records; the verification workflow is
   a feature, not overhead.
3. **Change management beats technology** — incumbents fail on training
   burden. The zero-training UI and the AI assistant are the mitigation;
   keep them sacred in every scope decision.
4. **AI scope discipline** — EASA caps AI at assistance/teaming. The
   confirm-card architecture already encodes this; hold that line as
   features grow.

## What this demonstrates about Fable

One session produced: a 9-agent verified market research sweep; a cited
roadmap; a schema + seed engineered to show live compliance states; 16
working modules; an agentic AI layer that respects regulatory boundaries by
design; an adversarial multi-agent code review that found and fixed real
bugs (including a BST timezone off-by-one in the coverage-gap maths); docs;
and five production deployments. The plan above is 20–25 engineer-months of
conventional effort — the demonstrated multiplier suggests a small
Fable-assisted team would do it in a fraction of that.
