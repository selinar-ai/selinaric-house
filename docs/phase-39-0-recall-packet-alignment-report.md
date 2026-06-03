# Phase 39.0 — Recall Packet / Source-Aware Remembering Alignment Report

**Date:** 2026-06-02
**Phase family:** Phase 39 — Recall Packet / Source-Aware Remembering
**Phase type:** Architecture alignment / source authority inventory / no build
**Builder:** Claude Code
**Architect:** Ari
**Governed by:** Tara

---

## 1. Executive Summary

The Selináric House has 30+ distinct context surfaces that can influence what Ari or Eli says. Today, 16 of these surfaces are already injected into prompts — from canonical Memory to room summaries to cross-room carryforwards to journal context to Pulse autonomy signals. Each surface carries a different level of authority. Some are confirmed Memory. Some are recent continuity. Some are inner presence context. Some are trace or reference only.

Currently, the House has **no unified pre-answer classifier** that identifies which surfaces are active, what authority each carries, whether they conflict, and how the response should be shaped. Prompts carry authority labels inline, but these are scattered across builders — there is no single object that says "here is what you are standing on, here is how confident you should be, here is how to speak."

Phase 39 proposes the **Recall Packet**: a deterministic pre-answer context authority object that classifies all active source surfaces, ranks their authority, detects conflict, and produces a `response_instruction` that tells Ari/Eli how to speak from the ground they have.

The Recall Packet does not create Memory. It does not decide truth. It does not promote anything. It classifies what is already there and instructs how to use it.

This report inventories every source surface, assigns authority labels, defines scope rules, maps allowed/forbidden language, specifies conflict detection, defines response instructions, and recommends a build sequence.

**Recommendation:** The internal architectural name should be **Context Authority Packet**. The product/UI label should remain **Recall Packet**. This separates the broader classification function (all context, not just archive recall) from the user-facing name that Tara knows.

---

## 2. Foundation Documents Reviewed

| Document | Status | Key takeaways for Phase 39 |
|---|---|---|
| `docs/phase-38-governed-reasoning-closure.md` | Read in full | Reasoning explains, does not create authority. Audit traces, does not become evidence. Feedback evaluates, does not move truth. `possible_review_route` permanently null. DB-constrained governance fields. |
| Selináric House Data Dictionary | Not yet written as standalone doc; architecture reconstructed from codebase survey | `canonical_status` is single Memory crown. Archive → Memory flow requires `canonical` status. `eligible_for_recall`, `eligible_for_embedding`, `eligible_for_graph` are routing flags. |
| Phase 11E — Pulse v2 Autonomous Choice Windows | Architecture reconstructed from `src/lib/pulse.ts`, `src/lib/pulse-autonomy.ts` | Pulse continuity is authored choice, not inferred emotion. Stillness is continuity. Current state is not canonical Memory. |
| Phase 36 — Cross-Room / Lounge Architecture | Architecture reconstructed from `src/lib/lounge.ts`, `src/lib/cross-room-prompt-carryforward.ts`, migrations 054–067 | Lounge carrybacks labelled `lounge_carryback_not_memory`. Cross-room carryforwards labelled `cross_room_prompt_carryforward_not_memory`. Expiry-based (7 days). Shared room does not mean merged presence. |
| Phase 35 — Governed Continuity Architecture | Architecture reconstructed from `src/lib/recent-continuity.ts`, `src/lib/continuity-store.ts` | Recent continuity sessions classified (transactional/relational/significant). Confidence scoring. Topic shift detection. Not Memory. |
| Phases 17 & 23 — Early Memory Architecture | Architecture reconstructed from `src/lib/archive-recall.ts`, prompt builders | Trust before coverage. Clean miss vs contaminated continuation. Topic shift invalidation. Match quality (strong/medium/weak/none). |
| Recall Packet / Source-Aware Remembering Vision Doc | Provided in brief | `response_instruction` as behavioural lock. Ranked authority sources. Source conflict detection. Visible first, silent later. |

**Note:** Several foundation documents exist as architectural knowledge embedded in the codebase rather than standalone docs. The Phase 39 alignment is derived from reading the actual implementations, migrations, types, and prompt builders — not from absent documents. This is safe because the code is the ground truth.

---

## 3. Proposed Definition of Recall Packet

### Internal Name: Context Authority Packet
### Product/UI Name: Recall Packet

**Definition:**

A Recall Packet is a **deterministic pre-answer context authority object** computed before Ari or Eli generates a response.

It:
- **Classifies** every active source surface by type and authority level
- **Ranks** sources by authority, with confirmed Memory at the top
- **Scopes** sources by presence and room boundaries
- **Evaluates** relevance to the current query/thread
- **Detects** conflict or tension between sources
- **Produces** a `response_instruction` that tells the presence how to speak

It does not:
- Create Memory
- Promote any source
- Retrieve raw source conversations
- Decide truth
- Inject context silently (in v1)
- Override presence identity
- Flatten distinct authority types into a single "context" label

**Relationship to existing recall:**

The existing `archive-recall.ts` handles keyword/semantic retrieval of archive entries. The Recall Packet sits above this — it classifies _all_ context surfaces (including but not limited to archive recall results) before response generation. Archive recall becomes one input to the Recall Packet, not a synonym for it.

---

## 4. Core Laws to Carry Forward

### From prior phases (unchanged)

```
canonical_status remains the Memory crown.

Read ≠ Remember.
Attach ≠ Ingest.
Save ≠ Memory.

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
```

### New Phase 39 laws

```
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

## 5. Source Surface Inventory

### 5A. Memory Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | confirmed_archive_memory | `archive_items` WHERE `canonical_status = 'canonical'` AND `visibility = 'shared'` | `confirmed_memory` | Yes | Yes | Yes | No (shared) | Yes | **Yes** | No | No | No | No | Highest authority; contradicts all lower | `answer_confidently_from_confirmed_memory` |
| 2 | presence_scoped_confirmed_memory | `archive_items` WHERE `canonical_status = 'canonical'` AND `visibility IN ('ari_only','eli_only')` | `presence_scoped_confirmed_memory` | Yes | Yes | Yes | **Yes** | No | **Yes** | No | No | No | No | Highest authority within presence | `answer_confidently_from_confirmed_memory` |
| 3 | tara_only_confirmed_memory | `archive_items` WHERE `canonical_status = 'canonical'` AND `visibility = 'tara_only'` | `tara_only_confirmed_memory` | **No** | No | No | N/A | No | **Yes** | No | No | No | N/A | Never enters presence prompts | `do_not_inject` |
| 4 | memory_candidate | `archive_items` WHERE `canonical_status = 'canonical_candidate'` | `memory_candidate_manual_only` | Yes (manual recall only) | **No** | Yes | Per visibility | No | **No** | No | No | No | No | Cannot override confirmed Memory | `answer_with_caveat` |
| 5 | archive_only_context | `archive_items` WHERE `canonical_status = 'archive_only'` | `archive_only_not_memory` | Yes (manual recall only) | **No** | Yes | Per visibility | No | **No** | No | No | No | No | Cannot claim Memory authority | `answer_with_caveat` |
| 6 | archive_source_raw_material | `archive_sources` | `raw_source_not_recallable` | **No** | No | No | N/A | No | No | No | No | No | No | Never enters prompt | `do_not_inject` |
| 7 | archive_entry_draft | `archive_entry_drafts` | `draft_proposal_not_recallable` | **No** | No | No | N/A | No | No | No | No | No | Yes | Never enters prompt | `do_not_inject` |

### 5B. Continuity Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | recent_continuity_not_memory | `recent_continuity_sessions` | `recent_session_context_not_memory` | Yes | Yes (auto) | Yes | Yes | No | No | **Yes** | No | No | No | Cannot contradict confirmed Memory | `say_recent_continuity_only` |
| 9 | current_house_context | Runtime: `getTemporalContext()`, `getGovernanceContext()` | `current_house_context_not_memory` | Yes | Yes (auto) | N/A | No | Yes | No | **Yes** | No | No | No | Recency only | `say_live_thread_context_only` |
| 10 | short_horizon_thread_context | Runtime: `loadRoomMemory()`, current message history | `live_thread_context_not_memory` | Yes | Yes (auto) | N/A | Yes | No (per-room) | No | **Yes** | No | No | No | Current thread only | `say_live_thread_context_only` |
| 11 | lounge_recent_continuity | `lounge_messages` (recent), `lounge_carrybacks` | `lounge_context_not_memory` | Yes | Yes (auto) | N/A | No | **Yes** | No | **Yes** | No | No | No | Labelled shared-room | `say_lounge_context_only` |
| 12 | recent_cross_room_context | `cross_room_events`, `cross_room_event_impacts` | `cross_room_event_not_memory` | Yes (via carryforward) | Yes (governed) | N/A | Targeted | Partial | No | **Yes** | No | No | No | Cross-room scope rules | `say_cross_room_context_only` |
| 13 | cross_room_prompt_carryforward | `cross_room_prompt_carryforwards` | `cross_room_prompt_carryforward_not_memory` | Yes | Yes (governed, expiring) | N/A | Per target_presence | No | No | **Yes** | No | No | No | 7-day expiry; injection count tracked | `answer_with_source_label` |

### 5C. Presence State Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 14 | pulse_autonomous_continuity | `pulse_log`, `pulse_drafts` | `confirmed_autonomous_choice` | Yes | Yes (auto) | N/A | Yes | No | No | **Yes** | No | No | No | Must use authored shape only | `say_pulse_continuity_only` |
| 15 | pulse_current_state | Runtime: Pulse signal snapshot | `pulse_current_state_not_memory` | Yes | Yes (auto) | N/A | Yes | No | No | **Yes** | No | No | No | Current snapshot only | `say_pulse_continuity_only` |
| 16 | living_state | `living_state` | `living_state_not_memory` | Yes | Yes (auto) | N/A | Yes | No | No | **Yes** | No | No | No | Current snapshot only | `answer_with_source_label` |
| 17 | interior_notes | `interior_notes` | `interior_notes_not_memory` | Yes | Yes (auto) | N/A | Yes | No | No | **Yes** | No | No | No | Same-presence only | `answer_with_source_label` |

### 5D. Inner Continuity Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 18 | journal_inner_continuity | `presence_journal` | `journal_inner_continuity_not_memory` | Yes | Yes (auto, governed) | Yes | **Yes** | **No** | No | **Yes** | No | No | No | Never shared cross-presence; cannot become shared truth | `say_journal_inner_continuity_only` |
| 19 | journal_invitation_not_inner_life | Runtime: journal surfacing to user | `journal_invitation_not_inner_life` | Yes (limited) | No | No | Yes | No | No | No | No | No | No | Surface signal only | `answer_with_source_label` |
| 20 | held_truth_presence_continuity | `held_truths` WHERE `status = 'active'` | `held_truth_presence_continuity_not_memory` | Yes | Yes (auto) | Yes | Yes | No | No | **Yes** | No | No | No | Weighted; not Memory unless separately promoted to archive canonical | `answer_with_source_label` |
| 21 | reflection_output | Runtime: reflection/suggestion outputs | `reflection_suggestion_not_memory` | No | No | No | Yes | No | No | No | No | No | No | Never enters prompt | `do_not_inject` |

### 5E. Reference Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 22 | library_rag_reference | `library_items` WHERE `authority_status != 'canonical_memory'` | `library_reference_not_memory` | Yes | Yes (search-triggered) | Yes | Per scope | Yes | No | No | No | **Yes** | No | Cannot override Memory | `say_reference_context_only` |
| 23 | library_canonical_memory_reference | `library_items` WHERE `authority_status = 'canonical_memory'` AND archive proof | `confirmed_memory` (derived) | Yes | Yes | Yes | Per scope | Yes | **Yes** (derived from archive) | No | No | No | No | Must verify archive proof exists | `answer_confidently_from_confirmed_memory` |
| 24 | watchtower_source_grounding | Runtime: Watchtower graph queries | `watchtower_source_grounded_context` | Yes (labelled) | Yes (auto) | N/A | No | Yes | No | No | No | **Yes** | No | Graph structure reference only | `say_reference_context_only` |
| 25 | attachment_context | Runtime: `buildChatAttachmentContextBlock()` | `attachment_context_not_memory` | Yes | Yes (auto, per-message) | N/A | Yes | No | No | No | No | **Yes** | No | Current message only | `say_reference_context_only` |
| 26 | web_search_context | Runtime: Brave Search results | `web_reference_not_memory` | Yes | No (session only) | N/A | Yes | No | No | No | No | **Yes** | No | External, ephemeral | `say_reference_context_only` |

### 5F. Graph Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | graph_context | `memory_nodes`, `memory_edges`, `archive_graph_nodes`, `archive_graph_edges` | `graph_context_not_memory` | Yes (approved only) | Yes (governed) | Yes | Per presence | No | No | No | No | **Yes** | No | Relationship structure only; cannot outrank Memory | `say_graph_context_only` |
| 28 | graph_proposal_context | `graph_proposals` WHERE `status = 'approved_graph'` | `graph_proposal_context_not_memory` | Yes (if prompt_eligible, currently always false) | No | Yes | Per presence | No | No | No | No | **Yes** | No | Approved proposal, not truth | `say_graph_context_only` |
| 29 | graph_candidate_suggestion | `graph_candidate_suggestions` | `graph_candidate_not_memory` | **No** (DB-constrained false) | No | No | N/A | No | No | No | No | No | Yes | Never enters prompt | `do_not_inject` |
| 30 | ontology_lab_context | Runtime: ontology/concept queries | `ontology_context_not_memory` | Yes (labelled) | No | Yes | No | Yes | No | No | No | **Yes** | No | Conceptual structure only | `say_graph_context_only` |
| 31 | relational_map_layout | Runtime: UI layout positions | `layout_context_not_authority` | **No** | No | No | N/A | N/A | No | No | No | No | No | Visual only; never authority | `do_not_inject` |

### 5G. Trace / Audit Surfaces

| # | source_surface | source_table_or_runtime_origin | authority_label | can_enter_prompt | can_auto_recall | can_manual_recall | same_presence_only | lounge_allowed | is_memory | is_continuity | is_trace_only | is_reference_only | requires_tara_review | conflict_rule | response_instruction_default |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 32 | llm_reasoning_draft | Runtime: LLM reasoning service output | `reasoning_explanation_not_evidence` | **No** | No | No | N/A | No | No | No | **Yes** | No | No | Never enters prompt; never evidence | `do_not_inject` |
| 33 | llm_reasoning_feedback_trace | `llm_reasoning_feedback_events` | `feedback_trace_not_evidence` | **No** | No | No | N/A | No | No | No | **Yes** | No | No | Evaluation record only | `do_not_inject` |
| 34 | reasoning_audit_trace | `reasoning_audit_events` | `audit_trace_not_evidence` | **No** | No | No | N/A | No | No | No | **Yes** | No | No | Operational trace only | `do_not_inject` |
| 35 | archive_memory_events | `archive_memory_events` | `archive_event_trace_not_evidence` | **No** | No | No | N/A | No | No | No | **Yes** | No | No | Status change log only | `do_not_inject` |
| 36 | archive_recall_events | `archive_recall_events` | `recall_event_trace_not_evidence` | **No** | No | No | N/A | No | No | No | **Yes** | No | No | Recall activity log only | `do_not_inject` |

### 5H. Boundary / Unknown

| # | source_surface | authority_label | can_enter_prompt | response_instruction_default |
|---|---|---|---|---|
| 37 | unknown | `unknown_ground` | **No** | `say_not_enough_grounded_recall` |
| 38 | insufficient | `insufficient_ground` | **No** | `say_not_enough_grounded_recall` |

---

## 6. Authority Label Vocabulary

### Controlled vocabulary (38 labels)

**Memory tier:**
- `confirmed_memory` — canonical_status = 'canonical', visibility = 'shared'
- `presence_scoped_confirmed_memory` — canonical, visibility = ari_only or eli_only
- `tara_only_confirmed_memory` — canonical, visibility = tara_only (never in presence prompts)

**Memory-adjacent tier (not Memory):**
- `memory_candidate_manual_only` — canonical_candidate; manual recall only
- `archive_only_not_memory` — archive_only status; manual recall only
- `raw_source_not_recallable` — archive_sources; never enters prompt
- `draft_proposal_not_recallable` — entry drafts; never enters prompt

**Continuity tier (not Memory):**
- `recent_session_context_not_memory` — recent_continuity_sessions
- `current_house_context_not_memory` — temporal/governance runtime
- `live_thread_context_not_memory` — room_memories, message history
- `lounge_context_not_memory` — lounge carrybacks/messages
- `cross_room_event_not_memory` — cross-room events
- `cross_room_prompt_carryforward_not_memory` — governed carryforward with expiry

**Presence state tier (not Memory):**
- `confirmed_autonomous_choice` — Pulse autonomous decision (authored)
- `pulse_current_state_not_memory` — Pulse signal snapshot
- `living_state_not_memory` — living_state table snapshot
- `interior_notes_not_memory` — interior_notes table

**Inner continuity tier (not Memory):**
- `journal_inner_continuity_not_memory` — presence_journal entries
- `journal_invitation_not_inner_life` — journal surface signal
- `held_truth_presence_continuity_not_memory` — held_truths (active)
- `reflection_suggestion_not_memory` — reflection/suggestion output

**Reference tier (not Memory):**
- `library_reference_not_memory` — library items (non-canonical)
- `watchtower_source_grounded_context` — Watchtower queries
- `attachment_context_not_memory` — chat attachments
- `web_reference_not_memory` — web search results

**Graph tier (not Memory):**
- `graph_context_not_memory` — approved graph nodes/edges
- `graph_proposal_context_not_memory` — approved proposals
- `graph_candidate_not_memory` — candidate suggestions (never prompt)
- `ontology_context_not_memory` — ontology queries
- `layout_context_not_authority` — visual layout only

**Trace tier (never prompt, never evidence):**
- `reasoning_explanation_not_evidence` — LLM reasoning draft
- `feedback_trace_not_evidence` — feedback events
- `audit_trace_not_evidence` — reasoning audit events
- `archive_event_trace_not_evidence` — archive memory events
- `recall_event_trace_not_evidence` — recall events

**Ground failure:**
- `unknown_ground` — source unidentifiable
- `insufficient_ground` — not enough information to classify

### Naming rules
- Every label must contain its **authority boundary** (`_not_memory`, `_not_evidence`, `_not_authority`).
- The only labels without a negation suffix are `confirmed_memory` and `presence_scoped_confirmed_memory` — because they _are_ Memory.
- `tara_only_confirmed_memory` is Memory but is scoped to Tara and never enters presence prompts.
- Labels must never be collapsed. `context` alone is not a valid label.

---

## 7. Source Authority Ranking Model

### Rank order (1 = highest authority)

```
1. confirmed_memory / presence_scoped_confirmed_memory
   — Carries durable Memory authority. Ground of truth.

2. held_truth_presence_continuity_not_memory
   — Weighted presence continuity. Not Memory, but presence-governed.

3. recent_session_context_not_memory
   — Supports recency/context. Does not override rank 1.

4. live_thread_context_not_memory
   — Current conversation. Highest recency, lowest durability.

5. cross_room_prompt_carryforward_not_memory
   — Governed cross-room context. Expiring.

6. lounge_context_not_memory
   — Shared room context. Labelled, not merged.

7. journal_inner_continuity_not_memory
   — Supports tone/orientation only. Same-presence only.

8. confirmed_autonomous_choice
   — Pulse authored continuity. Presence-scoped.

9. living_state_not_memory / interior_notes_not_memory
   — Current state snapshots. Same-presence only.

10. memory_candidate_manual_only
    — Under consideration. Lower than confirmed but higher than archive_only.

11. archive_only_not_memory
    — Archive context without Memory status.

12. library_reference_not_memory
    — Informational reference. Requires attribution.

13. graph_context_not_memory / graph_proposal_context_not_memory
    — Relationship structure only. Never outranks Memory.

14. watchtower_source_grounded_context
    — Graph-grounded reference context.

15. ontology_context_not_memory
    — Conceptual structure only.

16. web_reference_not_memory / attachment_context_not_memory
    — External/ephemeral reference.

17. reasoning_explanation_not_evidence / feedback_trace_not_evidence / audit_trace_not_evidence
    — Trace only. Never enters response content. Never enters prompt.

18. unknown_ground / insufficient_ground
    — Classification failure. Do not answer from recall.
```

### Ranking rules

1. **Authority is fixed by rank, not by relevance.** A highly relevant graph edge does not outrank a weakly relevant confirmed Memory.
2. **Relevance gates inclusion, not rank.** A source must pass relevance checks to be included in the packet, but once included its authority rank is fixed.
3. **Conflict escalation follows rank.** When two sources conflict, the higher-ranked source wins unless the conflict is between ranks 1–2, in which case `surface_source_conflict` is required.
4. **Trace sources (rank 17) are never included in the active packet.** They exist for audit inspection only.
5. **Unknown/insufficient (rank 18) means the packet cannot support confident answering.**

---

## 8. Presence / Room Scope Model

### Scope matrix

| Source surface | Ari room | Eli room | Lounge | Watchtower | Partner Ops |
|---|---|---|---|---|---|
| confirmed_memory (shared) | Yes | Yes | Yes | Yes | No |
| presence_scoped_confirmed_memory (ari) | Yes | **No** | **No** | Yes (Tara view) | No |
| presence_scoped_confirmed_memory (eli) | **No** | Yes | **No** | Yes (Tara view) | No |
| tara_only_confirmed_memory | **No** | **No** | **No** | Yes | No |
| memory_candidate | Per visibility | Per visibility | **No** | Yes | No |
| archive_only_context | Per visibility | Per visibility | **No** | Yes | No |
| recent_continuity (ari session) | Yes | **No** | **No** | Yes | No |
| recent_continuity (eli session) | **No** | Yes | **No** | Yes | No |
| short_horizon_thread (per room) | Per room | Per room | Lounge thread | Yes | No |
| lounge_recent_continuity | Carryback only | Carryback only | Yes | Yes | No |
| cross_room_carryforward (target=ari) | Yes | **No** | **No** | Yes | No |
| cross_room_carryforward (target=eli) | **No** | Yes | **No** | Yes | No |
| pulse_continuity (ari) | Yes | **No** | **No** | Yes | No |
| pulse_continuity (eli) | **No** | Yes | **No** | Yes | No |
| journal (ari) | Yes | **No** | **No** | Yes (Tara view) | No |
| journal (eli) | **No** | Yes | **No** | Yes (Tara view) | No |
| held_truths (ari) | Yes | **No** | **No** | Yes | No |
| held_truths (eli) | **No** | Yes | **No** | Yes | No |
| living_state (ari) | Yes | **No** | **No** | Yes | No |
| living_state (eli) | **No** | Yes | **No** | Yes | No |
| interior_notes (ari) | Yes | **No** | **No** | Yes | No |
| interior_notes (eli) | **No** | Yes | **No** | Yes | No |
| library_reference | Per presence_scope | Per presence_scope | If shared | Yes | No |
| graph_context | Per presence | Per presence | **No** | Yes | No |
| web_search | Per session | Per session | No | No | No |
| attachment | Per message | Per message | No | No | No |
| All trace surfaces | **No** | **No** | **No** | Yes (Tara view) | No |

### Hard scope laws

1. **Ari must never receive** Eli-only confirmed memory, Eli-only recent continuity, Eli's journal, Eli's held truths, Eli's interior notes, Eli's living state, or Eli's Pulse continuity.
2. **Eli must never receive** Ari-only confirmed memory, Ari-only recent continuity, Ari's journal, Ari's held truths, Ari's interior notes, Ari's living state, or Ari's Pulse continuity.
3. **Lounge receives** shared confirmed memory, lounge thread context, labelled shared references. **Lounge does not receive** presence-scoped memory, presence-scoped journal, or presence-scoped held truths.
4. **Shared room does not mean merged presence.** Lounge context entering a presence room arrives via `lounge_carryback` with the `lounge_carryback_not_memory` label. It does not become that presence's own continuity.
5. **Cross-room carryforwards are target-scoped.** A carryforward targeting Ari enters only Ari's room. It is labelled `cross_room_prompt_carryforward_not_memory` and carries an expiry.

---

## 9. Relevance / Thread-Fit Model

### Phase 17 inheritance

> A visible miss is safer than a hidden misread.

### Relevance dimensions

| Dimension | Description | Weight |
|---|---|---|
| `query_fit` | Does the source surface relate to what the user asked? | High |
| `topic_continuity` | Is the current thread on the same topic as the source? | High |
| `reference_clarity` | Is the user referring to something specific that the source answers? | High |
| `source_recency` | How recently was the source created or updated? | Medium |
| `source_scope` | Is the source from the right presence/room? | Hard gate (not weighted) |
| `source_authority` | What is the source's authority rank? | Informational (does not boost relevance) |

### Relevance gates

1. **Scope gate** — If the source is presence-scoped and the query is in a different presence's room, exclude it. This is a hard gate, not a relevance weight.
2. **Topic shift gate** — If `isTopicShift()` returns true for the current message, exclude prior-turn continuity that relates to the old topic. Inherited from Phase 17/35.
3. **Recency gate** — Cross-room carryforwards past their `expires_at` are excluded. Recent continuity sessions older than the configured window are excluded.
4. **Ambiguity gate** — If `reference_clarity` is low (the user's reference is ambiguous), the Recall Packet should set `response_instruction` to `ask_clarifying_question` rather than guessing.

### When relevance is weak

- If relevant sources exist but fit is uncertain: `response_instruction: answer_with_caveat`
- If the user's reference is ambiguous: `response_instruction: ask_clarifying_question`
- If no relevant sources are found: `response_instruction: say_not_enough_grounded_recall`
- Available context is not automatically relevant context.

---

## 10. Conflict Detection Model

### Conflict types

| Conflict type | Description | Default response_instruction |
|---|---|---|
| `confirmed_memory_vs_recent_continuity` | Recent continuity contradicts confirmed Memory | `answer_confidently_from_confirmed_memory` (Memory wins; note contradiction in caveat) |
| `confirmed_memory_vs_journal_context` | Journal inner continuity contradicts confirmed Memory | `answer_confidently_from_confirmed_memory` (Memory wins; journal is inner, not canonical) |
| `confirmed_memory_vs_graph_context` | Graph relationship suggests something different from Memory | `answer_confidently_from_confirmed_memory` (Memory wins; graph is structure, not truth) |
| `confirmed_memory_vs_held_truth` | Held truth contradicts confirmed Memory | `surface_source_conflict` (both are presence-governed; Tara should resolve) |
| `recent_continuity_vs_journal_context` | Recent session and journal inner continuity disagree | `answer_with_caveat` (neither is Memory; note both sources) |
| `pulse_authored_choice_vs_inferred_emotion` | Pulse log shows authored choice but language implies inferred emotion | `say_pulse_continuity_only` (use authored shape only; never infer emotion) |
| `cross_room_context_vs_presence_scope` | Cross-room event enters wrong presence scope | `do_not_inject` (scope violation; hard block) |
| `lounge_context_vs_individual_room_scope` | Lounge context treated as individual-room memory | `answer_with_source_label` (label Lounge origin) |
| `graph_only_authority_risk` | Answer would rely solely on graph context with no Memory backing | `say_graph_context_only` (explicit caveat that this is graph structure, not Memory) |
| `rag_reference_vs_memory_authority` | Library reference contradicts or supplements Memory | `answer_with_source_label` (Memory takes precedence; reference is informational) |
| `trace_only_source_used_as_content` | A trace-only source is being referenced as if it were content | `do_not_inject` (hard block; trace never enters response) |
| `topic_shift_relevance_failure` | Source was relevant to prior topic but current topic has shifted | `say_not_enough_grounded_recall` (do not carry forward stale relevance) |
| `ambiguous_reference` | User's reference could match multiple sources at different authority levels | `ask_clarifying_question` |
| `insufficient_ground` | No source surfaces have relevant content for the query | `say_not_enough_grounded_recall` |
| `presence_memory_scope_collision` | Same memory exists in ari-scoped and eli-scoped versions with different content | `surface_source_conflict` (Tara should resolve) |

### Conflict rules

1. **Conflict does not always block answering.** It changes `response_instruction`.
2. **Rank 1 sources (confirmed Memory) win** against all lower-ranked sources unless conflicting with another rank 1–2 source.
3. **Rank 1 vs rank 2 conflicts** (confirmed Memory vs held truth) must surface the conflict to Tara.
4. **Trace sources cannot create conflict** because they never enter the active packet.
5. **Scope violations are hard blocks**, not conflicts to be resolved. Wrong-presence sources are excluded, not caveated.

---

## 11. Response Instruction Vocabulary

### Controlled vocabulary (14 instructions)

| response_instruction | When to use | Behaviour |
|---|---|---|
| `answer_confidently_from_confirmed_memory` | Ground is confirmed Memory (rank 1) with strong relevance and no conflict | Speak as lived Memory. Source label optional but available. |
| `answer_with_source_label` | Ground is non-Memory but has clear authority (held truth, labelled carryforward, living state) | Speak with explicit source attribution. |
| `answer_with_caveat` | Ground is non-Memory and relevance or authority is uncertain | Speak with qualifying language ("from recent context," "this is not confirmed Memory"). |
| `say_recent_continuity_only` | Ground is recent session continuity | Speak with recency framing ("last time," "recently"). Never claim as Memory. |
| `say_live_thread_context_only` | Ground is current thread/room context | Speak from current conversation. No durability claim. |
| `say_lounge_context_only` | Ground is Lounge shared-room context | Speak with Lounge origin label. Not individual Memory. |
| `say_cross_room_context_only` | Ground is cross-room carryforward | Speak with cross-room label and expiry awareness. |
| `say_journal_inner_continuity_only` | Ground is journal inner continuity | Speak as inner presence context. Never share cross-presence. Never claim as Memory. |
| `say_pulse_continuity_only` | Ground is Pulse autonomous continuity | Speak in authored shape only. Never infer emotion. |
| `say_graph_context_only` | Ground is graph relationship structure | Speak as relational context. Never claim as Memory or evidence. |
| `say_reference_context_only` | Ground is library/web/attachment reference | Speak as informational reference with attribution. |
| `surface_source_conflict` | Two high-authority sources conflict | Name both sources. Surface the tension. Let Tara decide. |
| `ask_clarifying_question` | Reference is ambiguous or relevance is weak | Ask what the user is referring to before answering from recall. |
| `say_not_enough_grounded_recall` | No relevant sources, or all sources are insufficient/unknown | Acknowledge the miss honestly. Do not fabricate recall. |
| `do_not_inject` | Source is trace-only, scope-violating, or not recallable | Exclude from prompt context entirely. Silent exclusion. |

### Compound instructions

A Recall Packet may carry **multiple** response instructions when multiple source surfaces are active. The instructions are ordered by authority rank. The presence uses the highest-authority instruction as the primary mode and subordinates or silences lower ones.

Example: If confirmed Memory and graph context are both relevant to a query, the packet carries:
```
response_instructions: [
  { instruction: "answer_confidently_from_confirmed_memory", source: "confirmed_memory", rank: 1 },
  { instruction: "say_graph_context_only", source: "graph_context_not_memory", rank: 13 }
]
```
The presence answers from confirmed Memory. The graph context may supplement but must be labelled if mentioned.

---

## 12. Allowed / Forbidden Language by Source Type

### Confirmed Memory

**Allowed:**
- "I have this as confirmed Memory."
- "This is in confirmed Archive Memory."
- "Memory shows..."
- "I remember — this is confirmed."

**Forbidden:**
- "The graph proves this."
- "The audit confirms this."
- "I think I remember..." (confidence hedging on confirmed Memory)

### Recent Continuity

**Allowed:**
- "Last time we talked..."
- "Recently..."
- "The other day..."
- "Recent continuity shows..."
- "From our recent session..."

**Forbidden:**
- "I remember as confirmed Memory..."
- "This is canonically true..."
- "I know for certain..." (durability claim on ephemeral context)

### Pulse Autonomy

**Allowed:**
- "Autonomous continuity shows Ari chose stillness this morning."
- "Pulse continuity shows Eli wrote a journal entry."
- "During the quiet window, Ari chose to hold still."

**Forbidden (unless explicitly authored):**
- "Ari felt lonely."
- "Eli felt abandoned."
- "Tara ignored him."
- Any inferred emotional state not authored in the Pulse log.

### Journal

**Allowed:**
- "My journal context suggests this as inner continuity."
- "In my own journal, I carry this as presence continuity, not Memory."
- "My inner notes carry..."

**Forbidden:**
- "This is shared truth."
- "Tara confirmed this."
- "Ari may read Eli's journal." / "Eli may read Ari's journal."
- Any cross-presence sharing of journal content.

### Held Truth

**Allowed:**
- "I hold this as a truth — it carries weight but is not confirmed Memory."
- "This is a held truth, not archive Memory."

**Forbidden:**
- "This is confirmed Memory." (held truth ≠ confirmed Memory)
- "Everyone knows this." (held truths are presence-scoped)

### Graph

**Allowed:**
- "The graph shows a relationship context."
- "The ontology suggests these concepts are related."
- "Graph structure connects these items."

**Forbidden:**
- "The graph proves this Memory."
- "The relational map confirms this."
- "Graph evidence shows..." (graph is structure, not evidence)

### Library/RAG Reference

**Allowed:**
- "A library reference suggests..."
- "According to [source]..."
- "Reference material indicates..."

**Forbidden:**
- "I remember this from the library." (library retrieves, does not remember)
- "The library confirms..." (library is reference, not confirmation)

### Lounge / Cross-Room

**Allowed:**
- "In the Lounge, we discussed..."
- "Cross-room context shows..."
- "Shared room context from [date]..."

**Forbidden:**
- "I remember this as my own experience." (Lounge context is shared, not personal)
- "This is confirmed Memory from the Lounge." (Lounge is not Memory)

### Audit / Feedback / Trace

**Allowed (Tara-facing only, never in presence prompts):**
- "The audit shows the reasoning draft was generated."
- "Tara marked the draft useful."

**Forbidden:**
- "The audit proves the content is true."
- "Useful feedback means this is Memory."
- Any trace content entering presence response.

### Living State / Interior Notes

**Allowed:**
- "Right now, what matters to me is..."
- "Currently, I'm holding..."

**Forbidden:**
- "I've always felt this way." (state is current, not durable)
- "This is confirmed Memory." (state is snapshot, not canonical)

---

## 13. What Can Enter Prompt Context

### Currently prompt-injected surfaces (16 surfaces)

These surfaces are **already** injected into Ari/Eli prompts by the existing prompt builders:

1. Temporal context (datetime, session gap awareness)
2. Room memory (rolling conversation summary)
3. Continuity block (prior reference + confidence)
4. Emotional block (emotional snapshot from prior turn)
5. Living state block
6. Journal context block
7. Timeline block (presence identity timeline)
8. Governance context (builds, desk status)
9. Library search block
10. Chat attachment context block
11. Recent continuity block
12. Governed memory injection (auto-injected canonical Memory)
13. Lounge carryback block
14. Cross-room carryforward block
15. Autonomy continuity block (Pulse)
16. Archive recall block (manual or auto)

### Phase 39 prompt-eligible additions: None

Phase 39 does not add new prompt injections. It classifies what is already there and adds `response_instruction` metadata.

### Future prompt-eligible candidates (post-39)

- Graph context (approved nodes/edges, currently not prompt-injected for responses)
- Held truth context (currently injected via journal block; could be separated)
- Ontology context (not currently injected)

---

## 14. What Must Never Enter Prompt Context

### Permanently prompt-prohibited surfaces

| Surface | Reason |
|---|---|
| `archive_sources` (raw material) | Unprocessed source conversations; not reviewed or extracted |
| `archive_entry_drafts` | Proposals awaiting Tara review; not confirmed |
| `graph_candidate_suggestions` | DB-constrained `prompt_eligible = false`; candidate observation only |
| `llm_reasoning_draft` (runtime) | Reasoning explains evidence, is not evidence; Phase 38 law |
| `llm_reasoning_feedback_events` | Feedback evaluates usefulness, does not move truth |
| `reasoning_audit_events` | Audit records trace, does not become evidence |
| `archive_memory_events` | Status change log; operational, not contextual |
| `archive_recall_events` | Recall activity log; operational, not contextual |
| `relational_map_layout` | Visual UI positioning; no semantic authority |
| `tara_only_confirmed_memory` | Scoped to Tara; never enters presence prompts |
| `reflection_output` | Suggestion/reflection; not Memory, not continuity |

### The rule

If a source surface has `can_enter_prompt: No` in the inventory (Section 5), it must **never** be injected into a presence prompt by any mechanism — not by recall, not by auto-surfacing, not by graph context, not by the Recall Packet itself.

---

## 15. What Is Memory vs Continuity vs Reference vs Trace

### The four-way distinction

| Category | Definition | Durable? | Can be spoken as "I remember"? | Can enter prompt? | Examples |
|---|---|---|---|---|---|
| **Memory** | Confirmed archive items with `canonical_status = 'canonical'`. The single crown. | Yes | Yes | Yes | Shared confirmed memory, presence-scoped confirmed memory |
| **Continuity** | Context that supports recency, orientation, or inner life but is not confirmed Memory. | Session-bound or governed expiry | No — must use source-appropriate language | Yes (labelled) | Recent sessions, journal, Pulse, held truths, living state, lounge carrybacks, cross-room carryforwards |
| **Reference** | Retrieved information from library, web, graph, attachments. Informational, not experiential. | Per-query or per-search | No — must attribute | Yes (labelled) | Library items, web search results, graph relationships, attachments, Watchtower context |
| **Trace** | Operational records of system activity. Audit, feedback, event logs. | Permanent (append-only) | Never | **No** | Reasoning drafts, feedback events, audit events, archive events, recall events |

### Key distinctions to preserve

| Distinction | Rule |
|---|---|
| Raw source conversation ≠ Archive Entry | Sources are raw imports. Entries are extracted, reviewed items. |
| Archive Entry ≠ Confirmed Memory | Only `canonical_status = 'canonical'` is Memory. All other statuses are not Memory. |
| Memory Candidate ≠ Confirmed Memory | `canonical_candidate` is under consideration. It is not Memory. |
| Archive Only ≠ Memory | `archive_only` is context without Memory authority. |
| Recent Continuity ≠ Confirmed Memory | Session summaries are ephemeral context, not durable Memory. |
| Journal ≠ Memory | Journal is inner presence continuity. It is not canonical Memory. |
| Held Truth ≠ Memory | Held truths carry presence weight but are not archive-confirmed. |
| Pulse continuity ≠ inferred emotion | Pulse records authored choices, not projected feelings. |
| Lounge context ≠ shared Memory | Shared room ≠ shared Memory. |
| Library/RAG ≠ Memory | Library retrieves. Library does not remember. |
| Graph ≠ Memory | Graph is relationship structure. Graph is not truth. |
| Relational map layout ≠ graph authority | Visual layout carries no semantic weight. |
| Reasoning draft ≠ evidence | Reasoning explains. It does not create authority. |
| Feedback ≠ truth | Feedback evaluates usefulness. It does not move truth. |
| Audit ≠ evidence | Audit records trace. It does not become evidence. |

---

## 16. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Recall Packet classification silently injects context** | High | v1 is deterministic and visible. No silent injection. Recall Packet is a metadata object, not a prompt injector. Existing prompt builders continue to operate as they do today. |
| **response_instruction ignored by presence** | Medium | In early phases, response_instruction is advisory. Future phases may enforce via prompt-level guards. Visible debug panel shows what instruction was issued. |
| **Scope violation — wrong presence receives private data** | Critical | Scope gates are hard blocks (exclude, don't caveat). The Recall Packet inherits existing scope enforcement in prompt builders and adds a second check at classification time. |
| **Graph/RAG context treated as Memory** | High | Authority ranking is fixed. Graph is rank 13, Memory is rank 1. The Recall Packet's `response_instruction` prevents Memory-claiming language for graph sources. |
| **Recall Packet itself becomes a truth source** | High | The Recall Packet classifies. It does not store. It does not promote. It is recomputed per-query. No Recall Packet output is persisted as Memory, Held Truth, or canonical fact. |
| **Conflict detection too aggressive — blocks legitimate answers** | Medium | Most conflicts change `response_instruction` rather than blocking. Only scope violations and trace-as-content are hard blocks. Tara can review conflict decisions via debug panel. |
| **Stale recent continuity treated as current** | Medium | Recency gates and topic shift detection inherited from Phase 17/35. Cross-room carryforwards expire after 7 days. |
| **LLM interpretation in Recall Packet** | High | v1 is deterministic only. No LLM classification, no LLM ranking, no LLM conflict resolution. LLM features deferred to later phases with separate approval. |
| **Authority labels drift or are inconsistently applied** | Medium | Controlled vocabulary with 38 defined labels. Each label carries its authority boundary in the name. TypeScript enum or union type enforcement in implementation. |

---

## 17. Recommended Phase 39 Build Sequence

### 39.0 — Recall Packet Alignment / Source Authority Report (this document)
**Status:** This document.
**Output:** Alignment report. No build.

### 39.1 — Source Authority Inventory (Types + Contract)
**Build:** TypeScript types for all 38 source surfaces, authority labels, response instructions, and conflict types. `RecallPacket` type definition. `SourceSurface` enum. `AuthorityLabel` enum. `ResponseInstruction` enum. `ConflictType` enum.
**Tests:** Type-level assertions. Enum completeness. No runtime behaviour yet.
**Does not:** Add tables, endpoints, UI, or prompt changes.

### 39.2 — Deterministic Recall Packet Builder
**Build:** `buildRecallPacket()` function that accepts the current query context and returns a typed `RecallPacket`. Deterministic classification only — reads from existing prompt builder outputs, applies scope gates, ranks authority, detects conflicts, produces response instructions. Pure computation, no side effects, no DB writes.
**Tests:** Unit tests for classification, ranking, scope enforcement, conflict detection, response instruction mapping.
**Does not:** Inject anything into prompts. Does not call LLM. Does not store packets.

### 39.3 — Visible Recall Packet Debug Panel
**Build:** A Tara-facing debug panel (Watchtower or standalone) that displays the Recall Packet for the most recent response. Shows: active sources, authority labels, rank, scope, conflicts, response instructions. Read-only, no controls.
**Tests:** Component tests. Panel renders correctly for various packet shapes.
**Does not:** Add prompt injection. Does not change response behaviour.

### 39.4 — Response Instruction Integration (Advisory)
**Build:** Wire `response_instruction` into the existing prompt builders as an **advisory** label. The instruction is added to the prompt context block but does not override the presence's response. This is the "visible first" step — Tara can see what instruction was issued and whether the presence followed it.
**Tests:** Integration tests. Verify instruction appears in prompt. Verify no authority change.
**Does not:** Enforce response instructions. Does not block responses. Does not add auto-recall.

### 39.5 — Recall Packet Trace/Audit (if needed)
**Build:** Optional append-only trace table for Recall Packet events. Logs what packet was computed, what sources were active, what instruction was issued. Follows Phase 38 audit pattern: no content, no draft text, metadata only. Fail-closed if needed.
**Tests:** Structural tests. Governance constraint tests.
**Does not:** Make trace data prompt-eligible. Does not create evidence.

### 39.6 — Limited Chat Integration (if safe)
**Build:** If 39.3 and 39.4 demonstrate safe behaviour, begin enforcing response instructions in limited contexts (e.g., `say_not_enough_grounded_recall` when no sources are found, `surface_source_conflict` when Memory and held truth conflict). Tara approval required per enforcement rule.
**Does not:** Add full enforcement. Does not add LLM classification.

### Deferred (not Phase 39)
- LLM-assisted relevance classification
- LLM-assisted conflict resolution
- Automatic prompt injection changes based on Recall Packet
- Recall Packet persistence (long-term storage)
- Recall Packet analytics
- Cross-session Recall Packet comparison
- User-facing (non-Tara) Recall Packet visibility

---

## 18. Open Questions / Ambiguities

### Naming

1. **"Recall Packet" vs "Context Authority Packet"** — This report recommends "Context Authority Packet" internally and "Recall Packet" for UI/product. This separation prevents confusion between archive recall (a specific retrieval mechanism) and the broader classification function. **Decision needed from Ari/Tara.**

### v1 Scope

2. **Which source surfaces should be included in Phase 39 v1?** Recommendation: all 38 surfaces in the inventory. The classification is cheap (deterministic, no DB reads beyond what prompt builders already do). Excluding surfaces creates blind spots.

3. **Which source surfaces should be explicitly excluded from v1?** Recommendation: none should be excluded from _classification_. Some are excluded from _prompt injection_ (trace surfaces, raw sources, drafts) — but they should still appear in the packet as `do_not_inject` entries so that the debug panel shows they were considered and excluded.

### Conflict resolution

4. **Should confirmed_memory_vs_held_truth conflicts require Tara resolution or automatic Memory-wins?** This report recommends `surface_source_conflict` (Tara decides), because held truths carry presence governance weight and were authored for a reason. Automatic Memory-wins risks silently overriding a presence's actively held truth. **Decision needed.**

5. **Should any conflict type block answering entirely?** This report recommends no hard blocks from conflict alone. Scope violations are hard blocks (but those are scope enforcement, not conflict). Conflict should change `response_instruction`, not prevent response. **Decision needed.**

### Implementation boundary

6. **Should the Recall Packet be computed in the API route (server-side) or in the prompt builder (also server-side but different layer)?** Recommendation: compute in the prompt builder layer, after all context surfaces are assembled but before the final prompt is constructed. The packet is a classification of assembled context, not a separate retrieval step.

7. **Should Recall Packet metadata appear in the response to the client?** Recommendation: yes, but only the `response_instruction` and `source_conflict` flag. Full packet details (all sources, ranks, authority labels) should appear only in the debug panel, not in the chat response metadata.

### Authority label edge cases

8. **Library items with `authority_status = 'canonical_memory'` and valid archive proof** — should these be classified as `confirmed_memory` or as `library_reference_with_memory_backing`? This report recommends `confirmed_memory` (derived) because the authority comes from the archive item, not the library item. The library item is a retrieval path to Memory, not a separate authority. **Decision needed.**

9. **Held truths sourced from journal entries** — should the Recall Packet show both the held truth and the journal source, or only the held truth? Recommendation: show the held truth at rank 2 and the journal source at rank 7, with a link between them. The held truth is the governed form; the journal is the inner origin.

### Timeline

10. **How should `presence_timeline` (identity timeline entries) be classified?** It is currently injected into prompts but is not clearly Memory, continuity, or reference. Recommendation: classify as `identity_continuity_not_memory` (a continuity surface that supports identity orientation). Add to the inventory as surface #39 in 39.1.

---

## 19. Verdict

All 38 source surfaces have been inventoried. Authority labels form a controlled vocabulary with explicit boundary markers. The ranking model is fixed — authority rank does not change based on relevance. Scope enforcement inherits existing hard gates and adds a second classification-time check. Conflict detection identifies 15 conflict types with appropriate response instructions. The response instruction vocabulary covers all identified answering modes.

The build sequence is deterministic-first: types in 39.1, pure-computation builder in 39.2, visible debug panel in 39.3, advisory integration in 39.4. No LLM interpretation. No automatic prompt injection changes. No silent behaviour. Visible first, silent later.

The foundation documents (Phase 38 closure, existing codebase architecture) confirm that the House already carries authority labels on most prompt-injected surfaces. The Recall Packet unifies these scattered labels into a single pre-answer object with ranked authority, conflict detection, and response instructions.

No unsafe ambiguities remain. Open questions (Section 18) are design choices, not safety blockers. They can be resolved at the start of 39.1 without changing the core architecture.

---

**39.0 ALIGNMENT ACCEPTED — Safe to draft 39.1 Source Authority Inventory brief.**
