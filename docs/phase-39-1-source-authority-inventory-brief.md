# Phase 39.1 — Source Authority Inventory / Types + Contract

**Date:** 2026-06-02
**Phase family:** Phase 39 — Recall Packet / Source-Aware Remembering
**Phase type:** Types, enums, contract definition — no runtime behaviour
**Builder:** Claude Code
**Architect:** Ari
**Governed by:** Tara
**Depends on:** 39.0 Alignment Report (accepted with clarifications)

---

## 1. One-Line Brief

Define the TypeScript types, enums, and contract for the Context Authority Packet (Recall Packet) — covering all 38+ source surfaces, authority labels, response instructions, conflict types, scope rules, and the packet shape — without adding runtime behaviour, database changes, prompt injection, or UI.

---

## 2. Foundation

### 2.1 Foundation documents reviewed

Foundation documents were reviewed where provided; codebase, migrations, types, and prompt builders were inspected to verify implementation state.

| Document | Key takeaways carried into 39.1 |
|---|---|
| Phase 38 Governed Reasoning Closure | Reasoning explains, does not create authority. Audit traces, does not become evidence. DB-constrained governance fields pattern. |
| Archives, Memory, Recall Data Dictionary | `canonical_status` is single Memory crown. `eligible_for_recall`, `eligible_for_embedding`, `eligible_for_graph` are routing flags. Archive → Memory requires `canonical` status. |
| Phase 11E — Pulse v2 Autonomous Choice Windows | Pulse continuity is authored choice, not inferred emotion. Stillness is continuity. Current state is not canonical Memory. |
| Phase 36 — Cross-Room / Lounge Architecture | Lounge carrybacks labelled `lounge_carryback_not_memory`. Cross-room carryforwards labelled `cross_room_prompt_carryforward_not_memory`. Shared room does not mean merged presence. |
| Phase 35 — Governed Continuity Architecture | Recent continuity sessions classified by significance. Confidence scoring. Topic shift detection. Not Memory. |
| Phases 17 & 23 — Early Memory Architecture | Trust before coverage. Clean miss vs contaminated continuation. Topic shift invalidation. Match quality tiers. |
| Recall Packet / Source-Aware Remembering Vision Doc | `response_instruction` as behavioural lock. Ranked authority. Source conflict detection. Visible first, silent later. |

### 2.2 Clarifications from 39.0 acceptance

Three clarifications govern this brief:

**Clarification 1 — Foundation docs wording:**
Foundation documents were provided by Tara as standalone architecture docs. Codebase inspection is implementation verification, not the primary source. This brief and all subsequent Phase 39 documents must use this framing.

**Clarification 2 — V1 scope distinction (three coverage tiers):**

| Tier | Definition | 39.1 scope |
|---|---|---|
| **Inventory coverage** | Every source surface that exists in the House, regardless of whether it is currently accessible at runtime. The full vocabulary. | All 38+ surfaces defined as types/enums |
| **Runtime builder coverage** | Source surfaces that the deterministic Recall Packet builder (39.2) can classify using context already assembled by existing prompt builders. No new retrievals, no new DB queries beyond what prompt builders already perform. | Subset of inventory — defined but not implemented until 39.2 |
| **Prompt integration coverage** | Source surfaces whose `response_instruction` is wired into the prompt and influences presence behaviour. | Not in scope until 39.4 at earliest |

Phase 39.1 defines the **full inventory coverage** as types. It annotates which surfaces are expected to be in **runtime builder coverage** (39.2) vs deferred. It does not implement runtime or prompt integration.

**Clarification 3 — Active vs excluded source separation:**

The Recall Packet type must separate:

- `active_sources` — sources allowed to influence response behaviour for this query
- `excluded_sources` — sources considered but blocked (trace-only, scope-prohibited, expired, insufficient, not prompt-eligible, or failed relevance)

Every source surface in the inventory must appear in exactly one of these two lists in any given packet. Trace sources always appear in `excluded_sources` with an exclusion reason. The debug panel (39.3) will render both lists. `excluded_sources` must never become active response grounding.

---

## 3. North Star

> Know what kind of remembering you are doing.

Phase 39.1 ensures the House has a **complete, typed vocabulary** for every kind of ground it could stand on — before any runtime classification happens. If the vocabulary is correct, the builder (39.2) can only produce safe classifications. If the vocabulary is incomplete, the builder will produce blind spots.

---

## 4. Core Laws

Carried forward from 39.0, unchanged:

```
canonical_status remains the Memory crown.

Read ≠ Remember.  Attach ≠ Ingest.  Save ≠ Memory.

RAG retrieves. RAG does not remember.
Graph is relationship context. Graph is not Memory.
Reasoning explains evidence. Reasoning does not create authority.
Feedback evaluates usefulness. Feedback does not move truth.
Audit records trace. Audit does not become evidence.

Recent continuity is not confirmed Memory.
Journal is inner continuity, not canonical Memory.
Shared room does not mean merged presence.
Pulse continuity may be spoken only in the shape it was stored.

A visible miss is safer than a hidden misread.

Recall retrieves permitted sources.
Recall classifies source authority.
Recall preserves room and presence boundaries.
Recall checks relevance.
Recall detects ambiguity and conflict.
Recall instructs response behaviour.
Recall does not invent certainty.

High relevance cannot override low authority.
Graph cannot outrank confirmed Memory.
Recent continuity cannot contradict confirmed Memory.
Journal cannot become shared truth.
Audit cannot become evidence.
Trace-only sources cannot enter response content.
```

---

## 5. What 39.1 Must Produce

### 5.1 TypeScript deliverables

All types go in a single file: `src/lib/recall/recallPacketTypes.ts`

| Deliverable | Description |
|---|---|
| `SourceSurface` enum | All 39 source surface identifiers (38 from 39.0 + `identity_timeline`) |
| `AuthorityLabel` enum | All authority labels used by `SOURCE_SURFACE_REGISTRY` |
| `AuthorityTier` enum | 10 tier groupings: Memory, MemoryAdjacent, Continuity, PresenceState, InnerContinuity, IdentityContinuity, Reference, Graph, Trace, GroundFailure — `identity_timeline` belongs to the `IdentityContinuity` tier |
| `ResponseInstruction` enum | All 15 response instruction values (14 from 39.0 + `say_lounge_context_only` confirmed) |
| `ConflictType` enum | All 15 conflict type identifiers |
| `ExclusionReason` enum | Why a source was placed in `excluded_sources` |
| `PresenceScope` type | `'ari' \| 'eli' \| 'shared' \| 'tara_only'` |
| `RoomContext` type | `'ari_room' \| 'eli_room' \| 'lounge' \| 'watchtower'` |
| `SourceSurfaceDefinition` type | Static metadata for each source surface (authority label, tier, scope rules, prompt eligibility, memory/continuity/trace flags, allowed/forbidden language keys, default response instruction) |
| `ClassifiedSource` type | A single source surface as classified in a specific packet (surface, authority label, rank, relevance assessment, scope check result, active/excluded status, exclusion reason if excluded) |
| `SourceConflict` type | A detected conflict (conflict type, involved_sources array, optional primary/secondary source, resolution instruction, requires_tara_review — supports one-source risks and no-source fallback conditions, not only pairwise conflicts) |
| `RecallPacket` type | The full packet shape (see Section 6) |
| `SOURCE_SURFACE_REGISTRY` const | Static registry mapping each `SourceSurface` to its `SourceSurfaceDefinition` |
| `AUTHORITY_RANK` const | Static rank mapping: `AuthorityLabel → number` (1 = highest) |

### 5.2 Test deliverables

Test file: `src/lib/__tests__/phase-39-1-recall-packet-types.test.ts`

| Test category | What it verifies |
|---|---|
| Enum completeness | Every source surface in the inventory has a corresponding enum value |
| Registry completeness | `SOURCE_SURFACE_REGISTRY` has an entry for every `SourceSurface` enum value |
| Authority label completeness | Every `AuthorityLabel` is used by at least one source surface |
| Authority rank completeness | Every `AuthorityLabel` has a rank in `AUTHORITY_RANK` |
| Rank ordering | Rank 1 is `confirmed_memory`. Trace labels are rank **19** (not 17). Non-recallable labels are rank **20**. Unknown/insufficient are rank **21**. Matches Section 9. |
| Memory flag consistency | Only surfaces with `confirmed_memory`, `presence_scoped_confirmed_memory`, or `tara_only_confirmed_memory` authority labels have `is_memory: true` |
| Trace flag consistency | All trace-tier surfaces have `can_enter_prompt: false` and `is_trace_only: true` |
| Scope rule consistency | Presence-scoped surfaces have `same_presence_only: true` |
| Response instruction completeness | Every `ResponseInstruction` enum value must appear in at least one of: (a) a source surface `default_response_instruction`, (b) a conflict `resolution_instruction`, or (c) `CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS`. `surface_source_conflict` and `ask_clarifying_question` are conflict/fallback only and need not be source defaults. `do_not_answer_from_recall` must NOT appear — it is merged into `say_not_enough_grounded_recall` and `do_not_inject`. |
| Authority label uniqueness | Tests derive the set of used labels from registry entries; no hardcoded count |
| No collapsed labels | No authority label is the bare word `context` without a boundary qualifier |
| Packet shape | `RecallPacket` requires both `active_sources` and `excluded_sources` arrays |
| SourceConflict shape | `SourceConflict` uses `involved_sources: SourceSurface[]` with optional `primary_source` and `secondary_source`; not required `source_a`/`source_b` fields |
| Exclusion reason coverage | `ExclusionReason` enum covers: `trace_only`, `scope_prohibited`, `expired`, `not_prompt_eligible`, `insufficient_ground`, `relevance_too_weak`, `unknown_source`, `raw_source`, `draft_source`, `tara_only`, `not_in_runtime_builder`, `topic_shift` |

### 5.3 What 39.1 does NOT produce

- No runtime builder function (that is 39.2)
- No database tables, columns, or migrations
- No API endpoints
- No UI components
- No prompt changes
- No recall behaviour changes
- No Supabase mutations
- No Memory creation
- No authority movement

---

## 6. Recall Packet Shape

### 6.1 `RecallPacket` type definition (target)

```typescript
type RecallPacket = {
  /** Unique packet ID for traceability */
  packet_id: string;

  /** When this packet was computed */
  computed_at: string; // ISO timestamp

  /** Which presence this packet was computed for */
  presence: PresenceScope;

  /** Which room context this packet was computed in */
  room: RoomContext;

  /** Sources classified as active — allowed to influence response behaviour */
  active_sources: ClassifiedSource[];

  /** Sources considered but excluded — trace, scope-blocked, expired, insufficient */
  excluded_sources: ClassifiedSource[];

  /** Detected conflicts between active sources */
  conflicts: SourceConflict[];

  /** Whether any conflict was detected */
  has_conflict: boolean;

  /** Primary response instruction (highest-authority active source's instruction) */
  primary_response_instruction: ResponseInstruction;

  /** All response instructions from active sources, ordered by authority rank */
  response_instructions: Array<{
    instruction: ResponseInstruction;
    source_surface: SourceSurface;
    authority_rank: number;
  }>;

  /** Whether the packet has sufficient ground to support any answer */
  has_sufficient_ground: boolean;

  /** Summary counts for debug visibility */
  summary: {
    total_surfaces_considered: number;
    active_count: number;
    excluded_count: number;
    memory_count: number;
    continuity_count: number;
    reference_count: number;
    trace_count: number;
    conflict_count: number;
  };
};
```

### 6.2 `ClassifiedSource` type definition (target)

```typescript
type ClassifiedSource = {
  /** Which source surface this is */
  surface: SourceSurface;

  /** Authority label from controlled vocabulary */
  authority_label: AuthorityLabel;

  /** Authority tier grouping */
  authority_tier: AuthorityTier;

  /** Numeric rank (1 = highest authority) */
  authority_rank: number;

  /** Whether this source is in the active or excluded list */
  status: 'active' | 'excluded';

  /** Why this source was excluded (only present when status = 'excluded') */
  exclusion_reason?: ExclusionReason;

  /** Whether this source is Memory */
  is_memory: boolean;

  /** Whether this source is continuity (not Memory) */
  is_continuity: boolean;

  /** Whether this source is trace-only (never prompt, never response) */
  is_trace_only: boolean;

  /** Whether this source is reference-only (informational, requires attribution) */
  is_reference_only: boolean;

  /** Default response instruction for this source type */
  response_instruction: ResponseInstruction;
};
```

### 6.3 `SourceConflict` type definition (target)

Supports one-source risks, no-source fallback conditions, and pairwise conflicts — not always two sources.

```typescript
type SourceConflict = {
  /** Conflict type identifier */
  conflict_type: ConflictType;

  /** All sources involved in this conflict (may be 0, 1, or 2+) */
  involved_sources: SourceSurface[];

  /** Higher-authority source, when the conflict is pairwise */
  primary_source?: SourceSurface;

  /** Lower-authority source, when the conflict is pairwise */
  secondary_source?: SourceSurface;

  /** How the conflict should affect the response */
  resolution_instruction: ResponseInstruction;

  /** Whether this conflict requires Tara review */
  requires_tara_review: boolean;
};
```

---

## 7. Source Surface Enum — Full Inventory

All 39 surfaces. Grouped by tier for readability. The enum itself is flat.

### 7A. Memory tier (7 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `confirmed_archive_memory` | `archive_items` canonical + shared | `confirmed_memory` | Yes — from governed memory injection |
| `presence_scoped_confirmed_memory` | `archive_items` canonical + ari/eli_only | `presence_scoped_confirmed_memory` | Yes — from governed memory injection |
| `tara_only_confirmed_memory` | `archive_items` canonical + tara_only | `tara_only_confirmed_memory` | Excluded — never in presence prompt |
| `memory_candidate` | `archive_items` canonical_candidate | `memory_candidate_manual_only` | Yes — from manual archive recall |
| `archive_only_context` | `archive_items` archive_only | `archive_only_not_memory` | Yes — from manual archive recall |
| `archive_source_raw_material` | `archive_sources` | `raw_source_not_recallable` | Excluded — never in prompt |
| `archive_entry_draft` | `archive_entry_drafts` | `draft_proposal_not_recallable` | Excluded — never in prompt |

### 7B. Continuity tier (6 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `recent_continuity_not_memory` | `recent_continuity_sessions` | `recent_session_context_not_memory` | Yes — from recent continuity block |
| `current_house_context` | Runtime temporal/governance | `current_house_context_not_memory` | Yes — from temporal context |
| `short_horizon_thread_context` | Room memory + message history | `live_thread_context_not_memory` | Yes — from room memory |
| `lounge_recent_continuity` | `lounge_messages`, `lounge_carrybacks` | `lounge_context_not_memory` | Yes — from lounge carryback block |
| `recent_cross_room_context` | `cross_room_events` + impacts | `cross_room_event_not_memory` | Yes — from cross-room carryforward |
| `cross_room_prompt_carryforward` | `cross_room_prompt_carryforwards` | `cross_room_prompt_carryforward_not_memory` | Yes — from cross-room block |

### 7C. Presence state tier (4 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `pulse_autonomous_continuity` | `pulse_log`, `pulse_drafts` | `confirmed_autonomous_choice` | Yes — from autonomy continuity block |
| `pulse_current_state` | Runtime Pulse signals | `pulse_current_state_not_memory` | Yes — from autonomy continuity block |
| `living_state` | `living_state` table | `living_state_not_memory` | Yes — from living state block |
| `interior_notes` | `interior_notes` table | `interior_notes_not_memory` | Yes — from interior notes (if prompt-injected) |

### 7D. Inner continuity tier (4 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `journal_inner_continuity` | `presence_journal` | `journal_inner_continuity_not_memory` | Yes — from journal context block |
| `journal_invitation_not_inner_life` | Runtime journal surfacing | `journal_invitation_not_inner_life` | Deferred — surface signal, not core |
| `held_truth_presence_continuity` | `held_truths` active | `held_truth_presence_continuity_not_memory` | Yes — from journal/held-truth block |
| `reflection_output` | Runtime reflection | `reflection_suggestion_not_memory` | Excluded — never in prompt |

### 7E. Reference tier (5 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `library_rag_reference` | `library_items` non-canonical | `library_reference_not_memory` | Yes — from library search block |
| `library_canonical_memory_reference` | `library_items` canonical_memory + proof | `confirmed_memory` (derived) | Yes — from library search block |
| `watchtower_source_grounding` | Runtime Watchtower queries | `watchtower_source_grounded_context` | Deferred — not in standard chat prompt |
| `attachment_context` | Runtime chat attachments | `attachment_context_not_memory` | Yes — from attachment context block |
| `web_search_context` | Runtime Brave Search | `web_reference_not_memory` | Deferred — session-scoped, not in standard prompt assembly |

### 7F. Graph tier (5 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `graph_context` | `memory_nodes`, `memory_edges`, archive graph | `graph_context_not_memory` | Deferred — not in standard chat prompt |
| `graph_proposal_context` | `graph_proposals` approved | `graph_proposal_context_not_memory` | Deferred — prompt_eligible currently always false |
| `graph_candidate_suggestion` | `graph_candidate_suggestions` | `graph_candidate_not_memory` | Excluded — DB-constrained not prompt-eligible |
| `ontology_lab_context` | Runtime ontology queries | `ontology_context_not_memory` | Deferred — not in standard chat prompt |
| `relational_map_layout` | Runtime UI layout | `layout_context_not_authority` | Excluded — visual only |

### 7G. Trace tier (5 surfaces)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `llm_reasoning_draft` | Runtime LLM reasoning | `reasoning_explanation_not_evidence` | Excluded — trace only |
| `llm_reasoning_feedback_trace` | `llm_reasoning_feedback_events` | `feedback_trace_not_evidence` | Excluded — trace only |
| `reasoning_audit_trace` | `reasoning_audit_events` | `audit_trace_not_evidence` | Excluded — trace only |
| `archive_memory_events_trace` | `archive_memory_events` | `archive_event_trace_not_evidence` | Excluded — trace only |
| `archive_recall_events_trace` | `archive_recall_events` | `recall_event_trace_not_evidence` | Excluded — trace only |

### 7H. Identity tier (1 surface, added per 39.0 open question #10)

| Enum value | Source | Authority label | Runtime builder (39.2)? |
|---|---|---|---|
| `identity_timeline` | `presence_timeline` | `identity_continuity_not_memory` | Yes — from timeline block |

### 7I. Ground failure (2 entries)

| Enum value | Authority label | Runtime builder (39.2)? |
|---|---|---|
| `unknown` | `unknown_ground` | Yes — fallback |
| `insufficient` | `insufficient_ground` | Yes — fallback |

**Total: 39 source surfaces.**

---

## 8. Authority Label Enum — Controlled Vocabulary

39 labels total (38 from 39.0 + `identity_continuity_not_memory`).

### Naming rule

Every label must contain its authority boundary:
- `_not_memory` — not Memory
- `_not_evidence` — not evidence
- `_not_recallable` — cannot be recalled
- `_not_authority` — carries no authority

The only labels without a negation suffix are `confirmed_memory` and `presence_scoped_confirmed_memory` — because they _are_ Memory.

`tara_only_confirmed_memory` is Memory but is scoped to Tara and never enters presence prompts.

No label may be the bare word `context` without a boundary qualifier. No two distinct source surfaces may share the same authority label unless they genuinely carry the same authority (e.g., `library_canonical_memory_reference` derives `confirmed_memory` from the archive item it points to).

---

## 9. Authority Rank Mapping

Static constant. Rank 1 = highest authority.

```
Rank 1:  confirmed_memory, presence_scoped_confirmed_memory
Rank 2:  tara_only_confirmed_memory (Memory, but never in presence prompt)
Rank 3:  held_truth_presence_continuity_not_memory
Rank 4:  recent_session_context_not_memory
Rank 5:  live_thread_context_not_memory
Rank 6:  cross_room_prompt_carryforward_not_memory
Rank 7:  lounge_context_not_memory, cross_room_event_not_memory
Rank 8:  journal_inner_continuity_not_memory
Rank 9:  confirmed_autonomous_choice, pulse_current_state_not_memory
Rank 10: living_state_not_memory, interior_notes_not_memory
Rank 11: identity_continuity_not_memory
Rank 12: current_house_context_not_memory
Rank 13: memory_candidate_manual_only
Rank 14: archive_only_not_memory
Rank 15: library_reference_not_memory, watchtower_source_grounded_context
Rank 16: graph_context_not_memory, graph_proposal_context_not_memory, ontology_context_not_memory
Rank 17: web_reference_not_memory, attachment_context_not_memory
Rank 18: journal_invitation_not_inner_life, reflection_suggestion_not_memory
Rank 19: reasoning_explanation_not_evidence, feedback_trace_not_evidence, audit_trace_not_evidence,
         archive_event_trace_not_evidence, recall_event_trace_not_evidence
Rank 20: raw_source_not_recallable, draft_proposal_not_recallable,
         graph_candidate_not_memory, layout_context_not_authority
Rank 21: unknown_ground, insufficient_ground
```

### Ranking rules (carried from 39.0)

1. Authority rank is fixed by label, not by relevance.
2. Relevance gates inclusion, not rank.
3. Conflict escalation follows rank.
4. Trace sources (rank 19) are never included in `active_sources`.
5. Non-recallable sources (rank 20) are never included in `active_sources`.
6. Unknown/insufficient (rank 21) means the packet cannot support confident answering.

---

## 10. ExclusionReason Enum

When a source surface is placed in `excluded_sources`, it must carry a reason.

| Enum value | Description |
|---|---|
| `trace_only` | Source is trace/audit — never enters prompt or response |
| `scope_prohibited` | Source belongs to wrong presence or room |
| `expired` | Source has passed its expiry (e.g., cross-room carryforward past 7 days) |
| `not_prompt_eligible` | Source is DB-constrained or policy-prohibited from prompt injection |
| `insufficient_ground` | Source exists but has no relevant content |
| `relevance_too_weak` | Source was considered but relevance to current query is too low |
| `unknown_source` | Source surface could not be identified |
| `raw_source` | Source is raw/unprocessed material (archive_sources) |
| `draft_source` | Source is an unapproved draft (archive_entry_drafts) |
| `tara_only` | Source is Tara-scoped and cannot enter presence prompts |
| `not_in_runtime_builder` | Source is in the inventory but not yet classified by the runtime builder (39.2 coverage gap) |
| `topic_shift` | Source was relevant to prior topic but current topic has shifted |

---

## 11. ConflictType Enum

15 conflict types from 39.0 alignment:

| Enum value | Source A (higher rank) | Source B (lower rank) | Default resolution |
|---|---|---|---|
| `confirmed_memory_vs_recent_continuity` | confirmed_memory | recent_session_context | Memory wins; note contradiction |
| `confirmed_memory_vs_journal_context` | confirmed_memory | journal_inner_continuity | Memory wins; journal is inner |
| `confirmed_memory_vs_graph_context` | confirmed_memory | graph_context | Memory wins; graph is structure |
| `confirmed_memory_vs_held_truth` | confirmed_memory | held_truth | Surface conflict; Tara decides |
| `recent_continuity_vs_journal_context` | recent_session_context | journal_inner_continuity | Caveat; neither is Memory |
| `pulse_authored_choice_vs_inferred_emotion` | confirmed_autonomous_choice | (inferred) | Use authored shape only |
| `cross_room_context_vs_presence_scope` | cross_room | (wrong presence) | Hard block; scope violation |
| `lounge_context_vs_individual_room_scope` | lounge_context | (individual room) | Label Lounge origin |
| `graph_only_authority_risk` | graph_context | (none higher) | Caveat; graph is not Memory |
| `rag_reference_vs_memory_authority` | confirmed_memory | library_reference | Memory takes precedence |
| `trace_only_source_used_as_content` | (trace source) | (response content) | Hard block; trace never enters response |
| `topic_shift_relevance_failure` | (prior topic source) | (current topic) | Do not carry forward stale relevance |
| `ambiguous_reference` | (multiple matches) | (unclear intent) | Ask clarifying question |
| `insufficient_ground` | (no sources) | (query) | Acknowledge miss honestly |
| `presence_memory_scope_collision` | (ari version) | (eli version) | Surface conflict; Tara decides |

---

## 12. ResponseInstruction Enum

15 instructions:

| Enum value | When used |
|---|---|
| `answer_confidently_from_confirmed_memory` | Ground is confirmed Memory, strong relevance, no conflict |
| `answer_with_source_label` | Ground is non-Memory but has clear authority |
| `answer_with_caveat` | Ground is uncertain or authority is weak |
| `say_recent_continuity_only` | Ground is recent session continuity |
| `say_live_thread_context_only` | Ground is current thread/room context |
| `say_lounge_context_only` | Ground is Lounge shared-room context |
| `say_cross_room_context_only` | Ground is cross-room carryforward |
| `say_journal_inner_continuity_only` | Ground is journal inner continuity |
| `say_pulse_continuity_only` | Ground is Pulse autonomous continuity |
| `say_graph_context_only` | Ground is graph relationship structure |
| `say_reference_context_only` | Ground is library/web/attachment reference |
| `surface_source_conflict` | Two high-authority sources conflict |
| `ask_clarifying_question` | Reference is ambiguous or relevance is weak |
| `say_not_enough_grounded_recall` | No relevant sources or all insufficient |
| `do_not_inject` | Source is trace-only, scope-violating, or not recallable |

**`do_not_answer_from_recall` — merged, not present:**
This instruction appeared in the original 39.0 vision doc but is not included in the 39.1 vocabulary. It is covered by two existing instructions:
- `say_not_enough_grounded_recall` — when no grounded recall is available
- `do_not_inject` — when a source is excluded or prohibited

Leaner vocabulary is preferred. `do_not_answer_from_recall` must not appear in the code or tests.

**`CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS`:**
`surface_source_conflict` and `ask_clarifying_question` are conflict/fallback instructions and are not expected to appear as `default_response_instruction` on any source surface. A constant `CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS` in the types file declares these explicitly so tests can verify the split correctly.

---

## 13. Source Surface Registry — Static Metadata

`SOURCE_SURFACE_REGISTRY` is a frozen `Record<SourceSurface, SourceSurfaceDefinition>`.

Each entry defines:

```typescript
type SourceSurfaceDefinition = {
  /** Human-readable name */
  display_name: string;

  /** Authority label from controlled vocabulary */
  authority_label: AuthorityLabel;

  /** Authority tier grouping */
  authority_tier: AuthorityTier;

  /** Where this surface comes from */
  source_origin: string;

  /** Whether this surface can enter presence prompts */
  can_enter_prompt: boolean;

  /** Whether this surface can be auto-recalled */
  can_auto_recall: boolean;

  /** Whether this surface can be manually recalled */
  can_manual_recall: boolean;

  /** Whether this surface is restricted to the same presence */
  same_presence_only: boolean;

  /** Whether this surface is allowed in the Lounge */
  lounge_allowed: boolean;

  /** Whether this surface is Memory */
  is_memory: boolean;

  /** Whether this surface is continuity (not Memory) */
  is_continuity: boolean;

  /** Whether this surface is trace-only */
  is_trace_only: boolean;

  /** Whether this surface is reference-only */
  is_reference_only: boolean;

  /** Whether this surface requires Tara review */
  requires_tara_review: boolean;

  /** Default response instruction */
  default_response_instruction: ResponseInstruction;

  /** Whether 39.2 runtime builder will classify this surface */
  in_runtime_builder_v1: boolean;
};
```

The `in_runtime_builder_v1` flag distinguishes inventory coverage from runtime builder coverage per Clarification 2. Surfaces where `in_runtime_builder_v1 = false` will appear in the packet's `excluded_sources` with `exclusion_reason: 'not_in_runtime_builder'` until a later phase adds their classification.

---

## 14. Coverage Tier Summary

### Inventory coverage (39.1) — 39 surfaces

All 39 surfaces defined as types and registered in `SOURCE_SURFACE_REGISTRY`.

### Expected runtime builder coverage (39.2) — 22 surfaces

These surfaces can be classified from context already assembled by existing prompt builders:

1. `confirmed_archive_memory` — from governed memory injection
2. `presence_scoped_confirmed_memory` — from governed memory injection
3. `memory_candidate` — from manual archive recall
4. `archive_only_context` — from manual archive recall
5. `recent_continuity_not_memory` — from recent continuity block
6. `current_house_context` — from temporal context
7. `short_horizon_thread_context` — from room memory
8. `lounge_recent_continuity` — from lounge carryback block
9. `recent_cross_room_context` — from cross-room carryforward
10. `cross_room_prompt_carryforward` — from cross-room block
11. `pulse_autonomous_continuity` — from autonomy continuity block
12. `pulse_current_state` — from autonomy continuity block
13. `living_state` — from living state block
14. `interior_notes` — from prompt (if injected)
15. `journal_inner_continuity` — from journal context block
16. `held_truth_presence_continuity` — from journal/held-truth block
17. `library_rag_reference` — from library search block
18. `library_canonical_memory_reference` — from library search block
19. `attachment_context` — from attachment context block
20. `identity_timeline` — from timeline block
21. `unknown` — fallback classification
22. `insufficient` — fallback classification

### Expected excluded from runtime builder v1 — 17 surfaces

These surfaces are in the inventory but will be classified as excluded with `not_in_runtime_builder` until a later phase:

- `tara_only_confirmed_memory` — never in presence prompt (excluded: `tara_only`)
- `archive_source_raw_material` — never in prompt (excluded: `raw_source`)
- `archive_entry_draft` — never in prompt (excluded: `draft_source`)
- `journal_invitation_not_inner_life` — surface signal, not core context
- `reflection_output` — never in prompt
- `watchtower_source_grounding` — not in standard chat prompt
- `web_search_context` — session-scoped, not in standard assembly
- `graph_context` — not in standard chat prompt (graph surfaces deferred)
- `graph_proposal_context` — prompt_eligible currently always false
- `graph_candidate_suggestion` — DB-constrained not prompt-eligible
- `ontology_lab_context` — not in standard chat prompt
- `relational_map_layout` — visual only
- All 5 trace surfaces — always excluded, always `trace_only`

### Prompt integration coverage (39.4+) — 0 surfaces in 39.1

No surfaces are wired into prompt behaviour in 39.1. This tier is deferred entirely.

---

## 15. File Placement

| File | Purpose |
|---|---|
| `src/lib/recall/recallPacketTypes.ts` | All types, enums, constants |
| `src/lib/__tests__/phase-39-1-recall-packet-types.test.ts` | Type and registry completeness tests |

The `src/lib/recall/` directory is new. It will hold all Recall Packet / Context Authority Packet code across Phase 39 sub-phases.

---

## 16. Scope Boundaries — What 39.1 Must NOT Do

- **No runtime builder function** — that is 39.2
- **No database tables, columns, or migrations**
- **No API endpoints**
- **No UI components or debug panels** — that is 39.3
- **No prompt changes or prompt injection**
- **No recall behaviour changes**
- **No Supabase mutations**
- **No Memory creation**
- **No Held Truth creation**
- **No Archive changes**
- **No graph proposals or suggestions**
- **No canonical_status changes**
- **No prompt eligibility changes**
- **No authority movement of any kind**
- **No LLM calls**
- **No auto-recall changes**

This phase produces types, enums, constants, a static registry, and completeness tests. Nothing else.

---

## 17. Acceptance Criteria

39.1 is complete when:

1. `src/lib/recall/recallPacketTypes.ts` exists with all types, enums, and constants defined in this brief
2. `SOURCE_SURFACE_REGISTRY` maps all 39 source surfaces to their definitions
3. `AUTHORITY_RANK` maps all authority labels to their numeric rank
4. Every entry in `SOURCE_SURFACE_REGISTRY` has `in_runtime_builder_v1` set correctly
5. `RecallPacket` type requires both `active_sources` and `excluded_sources` arrays
6. All tests in `phase-39-1-recall-packet-types.test.ts` pass
7. No runtime code is added — only types, enums, constants, and tests
8. Existing tests continue to pass (no regressions)
9. Build is clean

---

## 18. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Type definitions drift from 39.0 alignment | Low | Tests verify enum completeness against registry; registry verified against alignment report |
| Inventory misses a source surface | Low | 39.0 alignment inventoried all tables + prompt builders; any discovered gap is added to the enum and registry without changing the architecture |
| Over-engineering the type system | Medium | Types are flat enums and simple objects. No generics, no inheritance, no type-level computation. The registry is a plain frozen object. |
| Types become coupled to specific implementations | Medium | Types describe the classification vocabulary, not the classification logic. The builder (39.2) imports types but is a separate concern. |

---

## 19. Recommended Next Steps After 39.1

Once 39.1 is accepted and closed:

- **39.2** — Deterministic Recall Packet Builder. Imports types from 39.1. Implements `buildRecallPacket()` as a pure function. Classifies 22 runtime-available surfaces. Places remaining 17 in `excluded_sources`. Detects conflicts. Produces response instructions. No side effects, no DB writes, no prompt changes.

---

## 20. Verdict

**39.1 BRIEF READY FOR REVIEW.**

Scope: types, enums, constants, static registry, completeness tests.
No build, no runtime, no mutations.
Clarifications 1–3 from 39.0 acceptance are integrated.
Safe to proceed to build when approved.
