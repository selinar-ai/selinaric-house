# Phase 39.1 — Source Authority Inventory / Types + Contract — Closure Record

**Closed:** 2026-06-03
**Phase family:** Phase 39 — Recall Packet / Source-Aware Remembering
**Depends on:** 39.0 Alignment Report (accepted with clarifications)

---

## What Was Built

Two files. No runtime behaviour. No database changes. No prompt injection. No authority movement.

| File | Purpose |
|---|---|
| `src/lib/recall/recallPacketTypes.ts` | Types, enums, constants, and static registry |
| `src/lib/__tests__/phase-39-1-recall-packet-types.test.ts` | Structural completeness tests |

---

## Contract Cleanups Applied (from 39.1 brief review)

Six cleanups were applied before building, per Tara's review:

| # | Cleanup | Resolution |
|---|---|---|
| 1 | `AuthorityTier` count said 8, listed 9 | Fixed to 10 tiers, added `IdentityContinuity` as its own tier for `identity_timeline` |
| 2 | `AuthorityLabel` count hardcoded | Wording changed to "all authority labels used by `SOURCE_SURFACE_REGISTRY`"; tests derive from registry |
| 3 | Rank test expectations wrong | Fixed to match Section 9: trace = rank 19, non-recallable = rank 20, unknown/insufficient = rank 21 |
| 4 | `ResponseInstruction` completeness test too strict | Fixed: every instruction must appear as source default OR in `CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS` OR as conflict/fallback — `surface_source_conflict` and `ask_clarifying_question` are declared in the constant |
| 5 | `SourceConflict` only supported pairs | Fixed: uses `involved_sources: SourceSurface[]` with optional `primary_source?` and `secondary_source?` |
| 6 | `do_not_answer_from_recall` absent without explanation | Documented as merged: `say_not_enough_grounded_recall` for no grounded recall, `do_not_inject` for prohibited sources. Not present in code |

---

## Deliverables

### Enums (6)

| Enum | Values |
|---|---|
| `SourceSurface` | 39 surfaces (7 Memory + 6 Continuity + 4 PresenceState + 4 InnerContinuity + 5 Reference + 5 Graph + 5 Trace + 1 IdentityContinuity + 2 GroundFailure) |
| `AuthorityLabel` | 38 unique labels — all carry authority boundary in name; only confirmed Memory labels omit negation |
| `AuthorityTier` | 10 tiers: Memory, MemoryAdjacent, Continuity, PresenceState, InnerContinuity, IdentityContinuity, Reference, Graph, Trace, GroundFailure |
| `ResponseInstruction` | 15 instructions — `do_not_answer_from_recall` absent (merged) |
| `ConflictType` | 15 conflict types |
| `ExclusionReason` | 12 exclusion reasons |

### Types (4)

| Type | Description |
|---|---|
| `SourceSurfaceDefinition` | Static metadata per surface including `in_runtime_builder_v1` flag |
| `ClassifiedSource` | A surface as classified in a specific packet |
| `SourceConflict` | A conflict using `involved_sources[]` + optional `primary_source?` / `secondary_source?` |
| `RecallPacket` | Full packet shape — requires both `active_sources` and `excluded_sources` |

### Scope types (2)

`PresenceScope` · `RoomContext`

### Constants (3)

| Constant | Description |
|---|---|
| `SOURCE_SURFACE_REGISTRY` | Frozen `Record<SourceSurface, SourceSurfaceDefinition>` — all 39 surfaces |
| `AUTHORITY_RANK` | `Record<AuthorityLabel, number>` — ranks 1–21 |
| `CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS` | `surface_source_conflict` and `ask_clarifying_question` — conflict/fallback only, not source defaults |

---

## Coverage Tier Annotations

The `in_runtime_builder_v1` flag on each registry entry distinguishes the three tiers:

| Tier | Count | Meaning |
|---|---|---|
| Inventory coverage (this phase) | 39 | All surfaces defined as types |
| Runtime builder coverage (39.2) | 22 | `in_runtime_builder_v1: true` — classifiable from existing prompt builder output |
| Deferred | 17 | `in_runtime_builder_v1: false` — will appear as `excluded_sources` with `not_in_runtime_builder` until a later phase |

---

## Test Results

| Suite | Assertions | Result |
|---|---|---|
| Phase 39.1 structural | 307 | ✅ 307/307 passing |
| Phase 36H.1 regression | 67 | ✅ 67/67 passing |
| Phase 36H.2 regression | 83 | ✅ 83/83 passing |
| Phase 36I.1 regression | 23 | ✅ 23/23 passing |
| Phase 36J.1 regression | 28 | ✅ 28/28 passing |
| TypeScript (`--noEmit`) | — | ✅ Clean — zero errors |

**Total assertions verified this phase: 307**
**Total with regressions: 508/508 passing**

---

## Authority Boundaries — What This Phase Does Not Do

- Does not create Memory
- Does not create Held Truth
- Does not create Archive entries or drafts
- Does not add database tables, columns, or migrations
- Does not add API endpoints
- Does not add UI components
- Does not change prompt behaviour
- Does not add auto-recall or manual recall changes
- Does not change `canonical_status` on any item
- Does not change `prompt_eligible` on any item
- Does not inject into Ari/Eli prompts
- Does not run any Supabase queries
- Does not call the LLM
- Contains no async functions, no `fetch()`, no `process.env`

---

## Next Phase

**39.2 — Deterministic Recall Packet Builder**

Implement `buildRecallPacket()` as a pure function in `src/lib/recall/recallPacketBuilder.ts`.

- Imports types from 39.1
- Accepts the assembled prompt context (what the prompt builders already produce)
- Classifies 22 runtime-builder-v1 surfaces from that context
- Places the remaining 17 surfaces in `excluded_sources` with `ExclusionReason.not_in_runtime_builder`
- Applies scope gates as hard exclusions
- Applies trace gates as hard exclusions
- Detects conflicts from the active sources
- Produces `primary_response_instruction` and `response_instructions` array
- Returns a fully-typed `RecallPacket`
- No side effects. No DB writes. No prompt injection. Pure computation.

---

## Closure Verdict

**39.1 CLOSED** — Source authority vocabulary complete, registry complete, contract clean, all tests passing, build clean. Safe to proceed to 39.2.
