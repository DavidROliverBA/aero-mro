# References & data provenance

Everything in AeroMRO — the features, the regulatory logic, the market
analysis and the demo data — derives from **publicly available sources** or
is **fictional**. This page records where it all came from.

## The three provenance statements

1. **All demo data is fictional.** "Albion Atlantic Airways" does not exist.
   Every registration (G-ALBA…G-ALBE, G-AMAA…), MSN, engineer, licence
   number, defect, work order, flight, damage record, audit and roster entry
   was invented for this demonstration or generated deterministically by the
   seed functions in `supabase/migrations/`. No real airline's operational,
   maintenance or personnel data was used, referenced or derived from —
   including any employer system of any contributor.
2. **The MRO feature set is public domain.** Tech logs, task cards, CRS
   release, MEL deferral clocks, AD/SB tracking, maintenance-programme due
   lists, life-limited parts, tooling calibration, stores control, dent &
   buckle charts, reliability programmes, quality audits and man-hour
   planning are industry-standard practices whose requirements are defined in
   **published regulation** (below) and described across decades of public
   industry literature. No proprietary vendor documentation, source code, or
   confidential material informed any feature.
3. **Photos are freely licensed.** Aircraft images are hot-linked from
   Wikimedia Commons under their respective free licences, credited in-app,
   and captioned as *representative type photos* (the fictional airline has
   no real aircraft to photograph).

## Regulatory sources (the basis of the compliance logic)

All public law and guidance:

- **Regulation (EU) 1321/2014** (as retained in UK law) — Part-145, Part-M,
  Part-CAMO, Part-66. EASA consolidated texts and FAQs:
  https://www.easa.europa.eu/en/the-agency/faqs/part-145
- **UK CAA regulatory library** (AMC/GM incl. M.A.305 records):
  https://regulatorylibrary.caa.co.uk/
- **EASA "Guidelines on the use of electronic documents, records and
  e-signatures"** (Issue 1, 2023): https://www.easa.europa.eu/en/downloads/137906/en
- **EASA NPA 2025-07** (first AI rulemaking proposal — assistance/teaming
  levels, human oversight): https://www.easa.europa.eu/en/document-library/notices-of-proposed-amendment/npa-2025-07
- **FAA AC 120-78B** (electronic signatures/records):
  https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-78B_FAA_Web.pdf
- **US–EU Maintenance Annex Guidance (MAG)** (dual release, 8130-3/Form 1):
  https://www.easa.europa.eu/en/the-agency/faqs/bilateral-agreement-basa-related-continuing-airworthiness
- **IATA** — ELB/e-tech-log implementation roadmap (2024) and "Adopting
  Aircraft Electronic Records" position paper: https://www.iata.org/
- MEL rectification-interval categories (A/B/C/D) follow published
  MMEL/MEL policy (CS-MMEL / CAA CAP 549 lineage); ATA chapter numbering
  follows the public ATA 100 / iSpec 2200 convention.

## Market & product research (the basis of ROADMAP.md)

Compiled 2026-07-11 by a multi-agent research sweep; every cited URL was
verified resolving at research time. Key public sources:

**Analysts & industry press** — Oliver Wyman Global Fleet & MRO Market
Forecast (2025-2035, 2026-2036) and MRO survey; Aviation Week MRO coverage
(digital MRO, paperless hangars, Southwest's Maintenix migration, predictive
maintenance scepticism incl. Emirates' on-record comments); Aviation
Maintenance Magazine (electronic tech logs survey, electronic task cards,
SMS); AircraftIT journal (data migration case studies, AirAsia
implementation case, BA's decade of e-logbook operations); AeroTime,
AviTrader, MRO Business Today.

**Vendor public materials** (feature landscape only — no proprietary
access): Swiss-AS/AMOS (swiss-as.com), TRAX/AAR (trax.aero, aarcorp.com
press releases), Ramco Aviation (ramco.com), IFS/Maintenix + EmpowerMX
(ifs.com, empowermx.com), OASES (oases.aero), Ultramain (ultramain.com),
Veryon/Rusada (veryon.com), Conduce eTechLog8 (conduce.net), TrustFlight
(trustflight.com), Airbus Skywise (airbus.com), Lufthansa Technik
AVIATAR/flydocs (lufthansa-technik.com, flydocs.aero), CAMP, ILS, PartsBase.

**Practitioner & community voices** — PPRuNe engineers' forum (AMOS thread),
review-platform summaries (Capterra/G2/SoftwareAdvice snippets), EXSYN and
QOCO consultancy blogs (data migration, integration complexity), Copernicus
Technology (no-fault-found economics), ARSA/Oliver Wyman AMT workforce
analysis.

**Dent & buckle context** — dentandbuckle.com, AviTrader structural-records
guide, Mainblades case study, DLR ICAS 2024 paper on mixed-reality damage
mapping.

Full inline citations with confidence tags live in [ROADMAP.md](../ROADMAP.md).

## Photo credits

Seeded images are Wikimedia Commons thumbnails, credited in-app per image:
BA A320 at Gibraltar (G-EUUM), easyJet A320s at Schiphol (G-EZPA, G-EZTV),
EVA Air 787-9 (B-17885), Etihad 787-9 (A6-BLP). Each file's licence is on
its Commons page (follow the URL stem in `aircraft_photos.url`).

## Software licences

Built on open-source: React, Vite, TypeScript, supabase-js,
@modelcontextprotocol/sdk, zod, Playwright, Bun — under their respective
licences (`package.json`). Backend services: Supabase, Cloudflare Pages,
Anthropic API (commercial terms).
