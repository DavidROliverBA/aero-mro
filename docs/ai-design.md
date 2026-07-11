# AI design — what's a button, what's a conversation

The question we ask of every function: **is it a regulatory act or a cognitive
task?** Regulatory acts carry legal accountability under Part-145/Part-66 and
stay deterministic UI, attributed to a named licence holder. Cognitive tasks —
reading, classifying, drafting, cross-referencing, explaining — are where the
model earns its keep.

This mirrors EASA's regulatory position (NPA 2025-07): aviation AI is limited
to Level 1 (assistance) and Level 2 (human-AI teaming), with mandatory human
oversight and explainability. AeroMRO doesn't treat that as a constraint to
work around; it's the design.

## The three AI surfaces

### 1. Agentic assistant (`src/views/Assistant.tsx`)

A tool-use conversation loop (`agentTurn` in `src/lib/ai.ts`):

- The model receives a **compact JSON snapshot** of live data (built by
  `buildSnapshot` in `src/lib/actions.ts`) in its system prompt — questions are
  answered with zero round-trips and it cannot invent records it can't see.
- It may call **action tools**: `create_defect`, `create_work_order`,
  `add_task_card`, `record_flight`, `update_aircraft_status`, `navigate`.
- `navigate` is the only auto-executing tool (pure UI, harmless). Every other
  tool call renders as a **pending action card**: the human reads a plain-
  English description and clicks *Confirm & execute* or *Decline*. Only then
  does `executeAction` write to Supabase, and the audit log records
  `AI assistant (confirmed by <user>)`.
- The tool result (success, error, or "Declined by user") is fed back to the
  model, which continues the conversation — so it reacts honestly to declines
  and failures.

**Deliberately missing tools:** task sign-off, independent inspection, CRS
issue, MEL deferral commitment, part/tool quarantine, finding closure. The
system prompt tells the model these are licence-holder acts and to `navigate`
the user to the right view instead. An AI that signs nothing is the point.

### 2. Defect triage (`triageDefect`)

Free text in → JSON-schema-constrained classification out (ATA chapter,
severity, AOG risk, suggested MEL category, rationale, recommended actions).
Addresses the documented root blocker for aviation AI: unstructured,
inconsistent write-ups. The engineer reviews before anything is saved; the
schema makes the output machine-usable, the rationale keeps it explainable.

### 3. CRS statement drafting (`draftCrsStatement`)

Drafts the 145.A.50 release statement from the completed task cards. The
certifying engineer edits and signs; the licence/type-rating/authorisation
gate (`checkCertifyingPrivilege`) and the sign-off completeness gate
(`crsBlockers`) are deterministic code that no AI output can bypass.

## The decision table

| Function | Surface | Why |
|----------|---------|-----|
| Fleet/compliance Q&A | AI | Cross-record synthesis is what LLMs are for |
| Navigation ("show me the due list") | AI, auto-executed | Zero risk, saves taps on mobile |
| Raise defect / open WO / record sector | AI **proposes** → human confirms | Data entry from natural language, with accountability preserved |
| Classify a defect (ATA, severity, MEL) | AI proposes → engineer accepts | Suggestion, not determination |
| Draft CRS wording | AI drafts → engineer signs | Language is cognitive; the signature is legal |
| Task sign-off / independent inspection | UI only | 145.A.45(e)/145.A.48 — a named person certifies |
| Issue CRS | UI only, twice-gated | 145.A.50 + Part-66 privilege |
| Defer a defect under MEL | UI only | Airworthiness determination |
| Quarantine parts/tools, close findings | UI only | Regulated stores/quality acts |
| Compliance clocks & due-list numbers | Deterministic code | Numbers users must trust are never generated |

## Failure-mode thinking

- **Hallucination** → snapshot-grounded prompting + "if it is not in the
  snapshot, say so" + structured outputs.
- **Over-reliance** (the human-factors risk EASA highlights) → AI never
  auto-executes writes; every card restates what will happen in plain English.
- **Attribution** → the audit log distinguishes human acts, AI-proposed acts,
  and who confirmed them.
- **Key handling** → the Claude key is pasted at runtime, held in memory,
  never persisted; production would proxy server-side.
