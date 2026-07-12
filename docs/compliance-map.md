# Compliance map — feature → regulation traceability

How each feature traces to UK CAA / EASA requirements. (Demo-grade: the point
is to show the shape of compliance-aware software, not to claim approval.)

| Regulation | Requirement (paraphrased) | Where in AeroMRO |
|------------|---------------------------|------------------|
| **145.A.45(e)** | Common work card/worksheet system transcribing maintenance data | Work orders → task cards; AI-added cards go through the same table and gates |
| **145.A.48** | Independent inspection of critical tasks after completion | `requires_inspection` flag; `cardGate` enforces a second signature from a *different* engineer before the card counts as done |
| **145.A.50** | CRS issued only by appropriately authorised certifying staff when all work is complete or deferred | `checkCertifyingPrivilege` (licence category, type rating, expiry, company auth) + `crsBlockers` (every card signed & inspected) — both must pass to enable the Issue CRS button |
| **Part-66 / 145.A.35** | Certifying-staff authorisation records and currency | Engineers view: categories, type ratings, expiry, company authorisation; expired licences visibly block release |
| **145.A.40** | Tool/test equipment control and calibration to a recognised standard | Tooling register: calibration due dates, recall states; out-of-calibration tools cannot be returned to service |
| **145.A.42** | Acceptance/segregation of components: certification docs, shelf-life, quarantine, SUP | Parts view: Form 1 refs (missing ones flagged), shelf-life clocks, quarantine segregation with visual isolation |
| **145.A.65** | Independent quality audit system with corrective-action follow-up | Quality view: audits → findings (Level 1/2/observation) → CAPA; findings cannot close without a recorded corrective action; overdue findings flagged |
| **145.A.30(d)** | Maintenance man-hour plan showing sufficient staff for planned work | Workforce view: rostered productive hours vs open task-card backlog per base; certifying-coverage gaps (base/day/type with no valid certifier on duty) flagged 7 days ahead |
| **MMEL/MEL (CAT.IDE / MEL policy)** | Rectification intervals Cat A/B/C/D | `melClock` — live per-defect countdown, breach highlighted fleet-wide |
| **CAMO.A.315 / M.A.302** | Maintenance programme compliance and forecasting | `mp_tasks` + `mp_compliance` + `mpDue`: FH/FC/calendar limits, whichever-first due list |
| **M.A.305** | Continuing-airworthiness records: AD status, LLP status, deferred defects, repairs | AD/SB view per-tail compliance; LLP consumption tracking with retirement alerts; deferred-defect register; **dent & buckle charts** — structural damage plotted on a rendered schematic with SRM references and within/beyond-allowable state |
| **Part-CAMO AD management** | AD applicability, compliance and repetitive intervals | Directives view: one-off deadlines + repetitive `next_due` tracking with overdue badges |
| **145.A.55 / audit trail** | Maintenance records retention and traceability | Append-only `audit_log` capturing every state-changing act with actor attribution — including `AI assistant (confirmed by <user>)` |
| **EASA e-records guidelines (2023)** | Electronic records need traceability, integrity, authenticity; e-signature levels | Sign-offs recorded with engineer identity + timestamp; logins can be **identity-bound to an engineer** so sign-offs attribute to the authenticated person; access allow-listed and the audit log append-only (demo-grade "basic" signature level; AES/QES is a Tier 3 roadmap item) |
| **EASA NPA 2025-07 (AI)** | AI limited to assistance/teaming; human oversight; explainability | No AI pathway to any certification act; confirm-before-write action cards; triage returns its rationale; see `docs/ai-design.md` |
| **145.A.60 / SMS (from Dec 2024)** | Occurrence reporting, safety management | Not yet built — Tier 2 roadmap item (occurrence reporting + risk register) |
