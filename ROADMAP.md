# AeroMRO — market research & product roadmap

Written 2026-07-11 from a multi-agent research sweep (six parallel research
agents + adversarial verification) across the aviation MRO software market.
Confidence tags: **[HIGH]** = multi-source verified, **[MED]** = credible
single source or synthesis, **[LOW]** = directional only.

## 1. The market in five sentences

The aviation MRO *software* market is ~$7B growing ~5%/yr inside a ~$119B MRO
spend market [MED], dominated by quote-only enterprise suites: **AMOS**
(Swiss-AS/Lufthansa Technik, 230+ customers, the European standard), **TRAX**
(AAR, ~200 customers, mobility-first, won Delta TechOps 2025), **Ramco**
(APAC/heli/engine-MRO niches, most aggressive AI/voice UX), **IFS Maintenix**
(majors + defence), with **OASES**, **ULTRAMAIN**, **Veryon/Rusada**,
**EmpowerMX** in the mid-market and niches [HIGH]. 2023–25 saw heavy
consolidation (IFS+EmpowerMX, Veryon+Rusada, AAR+Trax+Aerostrat, LHT's
AMOS+AVIATAR+flydocs "Digital Tech Ops Ecosystem") [HIGH]. Every vendor
shipped a named AI assistant in 2024–25 (Amy, ASK OASES, Veryon AIRE) — all
still marketing-stage [MED]. **No well-funded AI-native challenger is
attacking the M&E system-of-record itself**; startup activity clusters in
procurement (SkySelect, ePlaneAI), records (Bluetail, flydocs), and planning
add-ons (Aerostrat) [HIGH]. The market is held together by switching costs
(~$400–600K, 6–12-month migrations, dirty-data risk), not satisfaction [MED].

## 2. What users hate about incumbents (verified pain points)

| # | Pain point | Evidence |
|---|-----------|----------|
| 1 | **Training burden & hostile UI** — the #1 complaint across *every* incumbent: AMOS "too much clicking", Ramco "steep learning curve", a Maintenix daily user: "makes me dread coming to work every day" | [HIGH] reviews + forums, all vendors |
| 2 | **The mechanic at the aircraft is the weakest link** — desktop-era UIs pushed onto tablets, weak mobile apps, hangar connectivity gaps; engineers spend ~50% of their time on paperwork | [HIGH] |
| 3 | **Reporting = export to Excel** — a monthly reliability report takes days of manual joining; smaller CAMOs still run AD/SB tracking in hand-updated spreadsheets | [MED] |
| 4 | **Spreadsheet shadow systems are endemic** — staff revert to Excel when the system can't answer what it should | [HIGH] |
| 5 | **Data migration is the moat and the horror story** — AirAsia's first implementation "a complete failure after three months"; ~300% budget overruns documented | [MED] |
| 6 | **Audit prep takes weeks** — compiling evidence across disparate systems; one vendor claims integrated audit trails cut it from two weeks to two days | [MED] |

## 3. Reality checks (contrarian findings that shape scope)

- **Predictive maintenance ROI is weaker than marketed.** Emirates on record:
  Boeing AHM and Airbus Skywise are "more reactive than predictive"; 56% of
  operators don't use predictive maintenance at all [HIGH]. → We demo
  *reliability analytics* (chronic-defect detection), not fake prognostics.
- **Regulators cap AI at assistance level.** EASA NPA 2025-07 limits aviation
  AI to Level 1 (assistance) / Level 2 (human-AI teaming) — mandatory human
  oversight and explainability; human sign-off is baked into law [HIGH].
  → AI proposes, a licensed human disposes. Always.
- **e-tech-log penetration is only ~5–10% of operators** — huge whitespace,
  and regulator acceptance (UK CAA Letter of No Objection) is the gate [MED].
- **AI-in-MRO "alert fatigue" statistics circulating online trace only to
  vendor SEO content** — treat quantified AI-benefit claims skeptically [MED].

## 4. Design principles (derived, not aspirational)

1. **Zero-training UI.** If a feature needs a course, it's mis-designed. Every
   incumbent fails here; it is the cheapest possible differentiation.
2. **Phone-first for the mechanic.** The single weakest link in every
   incumbent. Bottom-tab navigation, 44pt touch targets, works one-handed at
   the aircraft.
3. **AI for language, UI for liability.** Free-text in (defect write-ups,
   questions), structured records out. Anything that constitutes a regulatory
   act — sign-off, CRS, deferral, quarantine — is an explicit, gated UI action
   attributed to a named licence holder. AI drafts, triages, searches,
   explains; it never signs. (See `docs/ai-design.md`.)
4. **The report writes itself.** Reliability, due-list, and audit-pack views
   answer directly what incumbents make users export to Excel for.
5. **Compliance logic in code, visible.** MEL clocks, Part-66 privilege
   gating, independent-inspection enforcement — the rules run in the UI and
   explain themselves, addressing the "system should already know" complaint.

## 5. Feature roadmap

### Tier 1 — this build (the comprehensive demo)

| Feature | Pain point / regulation it answers |
|---------|-----------------------------------|
| **Electronic tech log** — per-sector flight records, defect raise from sector, hours/cycles auto-roll to airframe | ETL whitespace (~5–10% penetration); 145.A.45 data capture |
| **Task-card sign-off with independent inspection** — per-card completion by named engineer, second-signature gating for critical tasks, signer ≠ inspector enforced | 145.A.45(e)/145.A.48; UPS/Southwest error-catching horror stories |
| **Maintenance programme & due list** — AMP tasks with FH/FC/calendar limits, whichever-first next-due forecast across the fleet | CAMO.A; "CAMOs run this in Excel" |
| **Life-limited parts tracking** — cycle/hour life consumption per component, retirement alerts | M.A.305 LLP status records |
| **Tooling & calibration register** — due/overdue calibration, quarantine | 145.A.40 |
| **Stores upgrade** — shelf-life alerts, quarantine segregation, Form 1 refs, locations | 145.A.42 |
| **Reliability dashboard** — defect rates by ATA/aircraft, chronic-defect (repeat-offender) detection | "export to Excel" reporting gap; NFF costs ~$180K/aircraft/yr |
| **Quality/audit module** — audits, findings, CAPA tracking, one-click evidence pack | 145.A.65; "audit prep takes weeks" |
| **Agentic AI assistant** — natural-language command over every function with confirm-before-write action cards; plus existing defect triage + CRS drafting | Differentiator; EASA Level 1/2 compliant by design |
| **iPhone-adaptive, accessible UI** — bottom tabs, safe areas, ARIA, keyboard nav | Pain points #1 and #2 |

### Tier 2 — next (credible demo extensions)

- Hangar-visit / heavy-check planner (Aerostrat-style slot planning)
- AI audit-evidence narrative generation; AI reliability-report drafting
- Offline-first PWA mode for hangar dead zones
- Occurrence reporting + SMS risk register (SMS mandatory since Dec 2024)
- Dual FAA/EASA release statement rendering (8130-3 vs Form 1 dual release)

### Tier 3 — later (the real-product bets, per whitespace analysis)

- **AI data migration/records digitisation** — the moat-breaker: LLM-driven
  ingestion of scanned legacy records into structured airworthiness data
- **Target the 5–50-tail operator** — the segment incumbents can't reach
  profitably; per-tail SaaS pricing
- OEM manual (AMM/IPC) ingestion with task-step hyperlinking
- Claude API proxy via Cloudflare Worker; multi-org tenancy; real e-signature
  levels (eIDAS basic → AES/QES for certificates)

## 6. UI-vs-AI decision framework

The question for every function: *is it a regulatory act or a cognitive task?*

| Stays deterministic UI (gated, attributed) | Becomes AI (drafts, proposes, explains) |
|---|---|
| CRS issue; task sign-off; independent inspection | Drafting the CRS statement; explaining why release is blocked |
| MEL deferral commitment; category selection | Suggesting ATA chapter, severity, MEL category from a write-up |
| Part quarantine / goods-in acceptance | Flagging shelf-life/Form 1 anomalies in words |
| Calibration status; due-list computation | "What's driving the G-EZTB due list this month?" |
| All numbers on compliance clocks | Fleet Q&A, cross-record search, report narration |
| — | **Any CRUD action via chat — but executed only after an explicit human Confirm on a typed action card** |

Every AI proposal shows its reasoning and lands as a *pending* card the user
confirms or discards; confirmed actions are written to the audit log with
`via: assistant` attribution. That is EASA Level 1/2 human-AI teaming,
demonstrated in working code.
