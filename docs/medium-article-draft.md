# DRAFT — Medium article

> **Status:** working draft for David to complete. Sections marked
> `[YOUR THOUGHTS: …]` are yours; everything else is a starting point to
> keep, cut or rewrite. Facts and numbers are accurate as of 2026-07-12 and
> traceable to `docs/build-log.md`.

---

## Title options

1. *I asked an AI to build an aircraft maintenance system. Three days later, it's live.*
2. *AI for language, UI for liability: what happened when Claude built a Part-145 maintenance system*
3. *Three days, 100 aircraft, six bugs it found in its own work: an experiment in AI-built enterprise software*

---

**Subtitle:** What building a regulated-industry system end-to-end with
Claude taught me about where AI-assisted engineering actually is — and where
it clearly isn't.

---

There's a live aircraft maintenance system at [the live demo]([YOUR CALL: link the private deployment, or point readers at the self-hosting guide]).
It tracks a fleet of 100 aircraft for a fictional airline: defects with live
MEL rectification clocks, task cards that refuse a release-to-service until
an independent inspector — a *different* licensed engineer — has signed,
airworthiness directives, life-limited parts, tooling calibration, duty
rosters that flag when nobody on shift can legally certify a 787, and dent &
buckle charts plotted on rendered aircraft schematics.

I didn't write it. Claude did — Anthropic's Fable model, working through
Claude Code — over roughly three days of sessions. My contribution was
direction, judgment calls, and the occasional "yes, deploy it."

[YOUR THOUGHTS: why you started this — what you wanted to find out, and what
your prior expectations were.]

## It started with research, not code

The first thing I asked for wasn't an app. It was market research: what do
the incumbent MRO systems (AMOS, TRAX, Ramco, IFS Maintenix and friends)
actually do, what do the engineers who use them complain about, and what do
the regulations actually require?

Claude fanned out nine research agents in parallel. They came back with
verified, cited findings that shaped everything afterwards: engineers spend
roughly half their time on paperwork; every incumbent system draws the same
complaint — powerful but hostile, weeks of training, "too much clicking";
the mechanic standing at the aircraft is universally the weakest link; and
reporting so poor that operators run their compliance off exported Excel.
Also this, which became the design's spine: EASA's first AI rulemaking
caps aviation AI at *assistance* level. Human oversight is mandatory. An AI
must never sign.

So the system's thesis wrote itself: **AI for language, UI for liability.**
The AI drafts, triages, searches, explains, proposes. A named licence holder
signs. The regulatory acts — task sign-off, independent inspection,
certificate of release to service, MEL deferral — have no AI pathway at all,
deliberately.

[YOUR THOUGHTS: does that principle generalise beyond aviation? Your view on
where the human-signature line should sit in your industry.]

## What three days actually produced

The tally, all traceable in the repo's build log:

- **18 modules** over a 20-table Postgres data model with the regulatory
  logic — MEL clocks, Part-66 privilege checks, whichever-comes-first
  maintenance forecasting — written as pure, unit-tested functions
- **An agentic assistant** that can operate every management function through
  natural language, with every proposed write rendered as a confirmation card
  a human must approve, and every confirmed action audit-logged
- **A username/password account system** (built on the auth provider's
  bcrypt — the AI refused to hand-roll password storage, correctly) with
  logins bindable to engineers so sign-offs attribute to the authenticated
  person
- **An MCP server** exposing the whole system as twelve compliance-aware
  tools, so a developer's AI agent can query fleet status or open work
  orders — under the same red lines
- **56 automated tests** including Playwright suites that drive the real app
  in desktop Chrome and iPhone WebKit profiles against authenticated sessions
- **~25 production deployments** to Cloudflare Pages along the way

The pace is the headline, but it isn't the interesting part.

## The interesting part: it caught its own mistakes

Six genuine bugs made it into the code during those three days. All six were
found by verification layers the AI itself had built — none by me:

1. A race in the assistant's tool-call protocol that could wedge
   conversations — found by an adversarial multi-agent code review.
2. Stale-state writes that could silently lose flight hours — same review.
3. A timezone off-by-one (BST, naturally) in the roster horizon maths —
   found the moment the pure functions were exercised with real dates.
4. Mobile touch-target CSS silently defeated by rule ordering — found by the
   iPhone Playwright agent measuring actual button heights.
5. My favourite: a new foreign key quietly placed the sign-in allow-list
   inside a `TRUNCATE CASCADE` blast radius, so resetting the demo data
   locked every user out. The UX test suite went red; the diagnosis traced
   through the JWT to the empty registry.
6. A modular-arithmetic quirk in generated test data that made one damage
   category mathematically unreachable — found by checking the distribution
   rather than assuming it.

[YOUR THOUGHTS: what this pattern means to you — the shift from "will the AI
write correct code?" to "will the system around the AI catch what isn't?"]

## What it's honestly not

This is a demonstration, and the repo says so loudly. The data is fictional.
The features derive entirely from published regulation and public industry
sources — every claim is cited in the repo. And the gap between this and a
system a real Part-145 organisation could run on is documented rather than
hidden: real e-signatures, approved maintenance data integration, offline
mobile, and above all the regulator — authority acceptance of electronic
records is a six-to-twelve-month conversation no amount of code compresses.

The build's own estimate for closing that gap is 20–25 conventional
engineer-months. Which raises the question the whole exercise was designed
to ask: what's that number with AI assistance, given the three days you've
just read about?

[YOUR THOUGHTS: your answer, and what you'd pilot first.]

## What I'd tell you to take away

[YOUR THOUGHTS: 3–5 takeaways in your voice. Candidates from the build if
useful: (1) start with research, not code — the cited roadmap changed every
subsequent decision; (2) make the AI build its own verification and spend
your own attention on judgment calls; (3) the human-approval line isn't a
limitation to engineer around, it's the design; (4) domain logic as pure,
testable functions is what let one set of rules drive the UI, the AI
assistant and the MCP interface without drift.]

---

*The system is at [the live demo]([YOUR CALL: link the private deployment, or point readers at the self-hosting guide]); the
repository, including the full build log, market research citations and a
guide to standing up your own instance, is at
[github.com/DavidROliverBA/aero-mro](https://github.com/DavidROliverBA/aero-mro).*

*Disclosure: AeroMRO was built end-to-end by Claude (Fable 5) via Claude
Code as a personal capability experiment. Fictional airline, demo data only;
all sources public and cited.* [YOUR THOUGHTS: add any personal/employer
disclaimer you feel appropriate.]
