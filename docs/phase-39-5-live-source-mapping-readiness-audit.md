# Phase 39.5 — Live Source Mapping Readiness / Provenance Gap Audit

**Date:** 2026-06-03
**Phase family:** Phase 39 — Recall Packet / Source-Aware Remembering
**Phase type:** Architecture audit / provenance readiness / no live integration
**Builder:** Claude Code
**Architect:** Ari
**Governed by:** Tara

---

## 1. Executive Summary

The House currently assembles 16 distinct context blocks in every Ari/Eli chat prompt, drawn from 20+ tables and runtime sources. Phase 39 built the vocabulary, classifier, builder, adapter, and a visible debug chain. Phase 39.5 asks: can each of those live sources carry enough metadata to produce a safe `RuntimeContextSignal[]` for the Recall Packet before any advisory response instruction is permitted into prompts?

The answer is **partially ready**. **Six Tier 1 source families plus synthetic fallback** have sufficient metadata for immediate 39.6 advisory integration: Archive/confirmed memory (governed injection + recall paths), Cross-room carryforward, Recent Continuity, Journal inner continuity, Library context, and the Unknown/Insufficient synthetic fallback. Seven further surfaces are safe with explicit caveats. Nine surfaces must remain excluded until schema gaps are addressed or a later phase grants explicit authorisation.

Four targeted schema/forwarding fixes are recommended before 39.6 proceeds but do not block the six Tier 1 families.

**The smallest safe advisory integration is: Governed Memory injection + Archive recall entries + Cross-room carryforward + Recent Continuity + Journal context + Library context.**

**Verdict:** `39.5 PARTIALLY READY — 39.6 may proceed only with limited source surfaces.`

---

## 2. Files / Modules Inspected

| Category | File(s) inspected |
|---|---|
| Chat route prompt assembly | `src/app/api/ari-chat/route.ts`, `src/app/api/eli-chat/route.ts` |
| Archive / Memory | `src/lib/archives.ts`, `src/lib/archive-recall.ts`, `src/lib/memory-injection.ts`, `src/lib/archive-scope.ts` |
| Recent Continuity | `src/lib/recent-continuity.ts`, `src/lib/continuity-store.ts` |
| Room Memory | `src/lib/memory.ts`, `src/lib/rooms.ts` |
| Temporal / Governance | `src/lib/temporal.ts`, `src/lib/governance-context.ts` |
| Lounge / Cross-room | `src/lib/lounge.ts`, `src/lib/cross-room-prompt-carryforward.ts` |
| Pulse / Autonomy | `src/lib/pulse.ts`, `src/lib/pulse-autonomy.ts` |
| Journal | `src/lib/journal.ts` |
| Held Truths | `src/lib/held-truths.ts` |
| Living State | `src/lib/living-state.ts` |
| Interior Notes | `src/lib/interior-notes.ts` |
| Library / RAG | `src/lib/library/authority.ts`, `src/lib/library/chat-library-search.ts`, `src/lib/archive-semantic.ts`, `src/lib/archive-hybrid.ts` |
| Attachments | `src/lib/files/chat-attachment-context.ts`, `src/lib/files/chat-attachment-types.ts` |
| Identity Timeline | `src/lib/timeline.ts`, `src/lib/timeline-drafts.ts` |
| Reflections | `src/lib/reflections/reflection-types.ts`, `src/lib/reflections/review-types.ts` |
| Graph / Ontology | `src/lib/graph/types.ts`, `src/lib/graph/authority.ts`, `src/lib/graph/promptEligibility.ts`, `src/lib/memory-graph.ts`, `src/lib/archive-graph.ts` |
| Reasoning / Audit | `src/lib/graph/llmReasoningTypes.ts` |
| Types / Recall | `src/lib/recall/recallPacketTypes.ts`, `src/lib/recall/recallCandidateAdapter.ts` |

---

## 3. Live Source Surface Inventory

Prompt builders for both Ari and Eli (`ari-chat/route.ts`, `eli-chat/route.ts`) assemble the following blocks in this order:

| # | Context block | Builder function | Source file | Table |
|---|---|---|---|---|
| 1 | Identity Timeline | `loadTimelineForPrompt(presenceId)` | `src/lib/timeline.ts` | `presence_timeline` |
| 2 | Temporal context | `getTemporalContext(ROOM_SLUG)` | `src/lib/temporal.ts` | `room_messages` (gap detection) |
| 3 | Room memory summary | `loadRoomMemory(ROOM_SLUG)` | `src/lib/memory.ts` | `room_memories` |
| 4 | Short-horizon continuity | `buildContinuityBlock()` | `src/lib/continuity-store.ts` | in-memory (10-min TTL) |
| 5 | Emotional snapshot | `buildEmotionalBlock()` | `src/lib/continuity-store.ts` | in-memory |
| 6 | Living State | `getLivingStateForPrompt(presenceId)` | `src/lib/living-state.ts` | `living_state` |
| 7 | Journal + Held Truths | `getJournalContextForPresence(presenceId)` | `src/lib/journal.ts` | `presence_journal`, `held_truths` |
| 8 | Governance context | `getGovernanceContext(presenceId)` | `src/lib/governance-context.ts` | `builds` |
| 9 | Archive Recall (manual/auto) | `getRecallableArchiveEntries()` + `formatArchiveRecallContext()` | `src/lib/archive-recall.ts` | `archive_items` |
| 10 | Library context | `searchLibraryForPresence()` | `src/lib/library/chat-library-search.ts` | `library_items`, `library_chunks` |
| 11 | Chat attachment context | `buildChatAttachmentContextBlock()` | `src/lib/files/chat-attachment-context.ts` | (ephemeral, per-request) |
| 12 | Recent Continuity | `getRecentContinuityForPrompt(presenceId)` | `src/lib/recent-continuity.ts` | `recent_continuity_sessions` |
| 13 | Governed Memory injection | `buildGovernedMemoryInjection()` | `src/lib/memory-injection.ts` | `archive_items` (canonical only) |
| 14 | Lounge carryback | `buildCarrybackBlock(presenceId)` | `src/lib/lounge.ts` | `lounge_carrybacks` |
| 15 | Cross-room carryforward | `getCrossRoomCarryforwardBlock(presenceId, roomSlug)` | `src/lib/cross-room-prompt-carryforward.ts` | `cross_room_prompt_carryforwards` |
| 16 | Autonomy continuity | `getAutonomyContinuityForPrompt(presenceId)` | `src/lib/pulse-autonomy.ts` | `pulse_autonomy_events` |

Not currently prompt-injected: Interior Notes, Reflections, Graph/Ontology/Relational Map, Reasoning/Feedback/Audit.

---

## 4. Readiness Matrix

**Readiness key:**
- 🟢 GREEN — safe for 39.6 advisory integration with current metadata
- 🟡 YELLOW — safe only with caveat / metadata-only advisory; noted gap must be managed
- 🔴 RED — exclude from 39.6 until fix applied

| # | source_surface | table_or_module | currently_in_prompt | can_map_now | required_signal_type | presence_scope_available | prompt_eligible_available | expiry_available | provenance_available | review_state_available | canonical_status_available | scope_risk | content_leakage_risk | authority_risk | ready_39_6 | required_fix |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | confirmed_archive_memory (recall path) | `archive_items` via `archive-recall.ts` | ✅ | ✅ | GovernedConfirmedMemory | ✅ visibility→scope | Partial (not in RecallEntry; re-derive from canonical_status) | ❌ (no TTL; treat as indefinite) | ✅ rank_score, source_doc | Partial (canonical_status) | ✅ | Low | Low | Low | 🟢 | Forward `eligible_for_recall` in `RecallEntry` |
| 2 | confirmed_archive_memory (governed injection) | `archive_items` via `memory-injection.ts` | ✅ | ✅ | GovernedConfirmedMemory | ✅ visibility→scope | ✅ (canonical gate is implicit) | ❌ (none) | Partial (match_score; no source_ref in InjectedMemory) | Partial | ✅ always canonical | Low | Low | Low | 🟢 | Add `id` and `source_ref` to `InjectedMemory` type |
| 3 | presence_scoped_confirmed_memory | `archive_items` (ari_only/eli_only visibility) | ✅ (same paths) | ✅ | PresenceScopedConfirmedMemory | ✅ visibility field | Partial | ❌ | Partial | Partial | ✅ | Low (scope enforced by isInArchiveScope()) | Low | Low | 🟢 | Same as #1/#2 |
| 4 | memory_candidate | `archive_items` (canonical_candidate) via recall | ✅ (manual recall only) | ✅ with caveat | ManualMemoryCandidateRecall | ✅ | Partial | ❌ | Partial | Partial | ✅ (not canonical) | Low | Low | Medium (must not claim Memory) | 🟡 | Ensure signal mapped as ManualMemoryCandidateRecall, never as GovernedConfirmedMemory |
| 5 | archive_only_context | `archive_items` (archive_only) via recall | ✅ (manual recall only) | ✅ with caveat | ManualArchiveOnlyRecall | ✅ | Partial | ❌ | Partial | Partial | ✅ (not canonical) | Low | Low | Low | 🟡 | Same authority-labelling caveat as #4 |
| 6 | recent_continuity_not_memory | `recent_continuity_sessions` via `recent-continuity.ts` | ✅ | ✅ | RecentContinuity | ✅ presence_id | Partial (status+retention) | Partial (session_end + RETENTION_DAYS=7) | ✅ classification, session_end | Partial (status active/hidden/deleted) | N/A (not Memory) | Low | Low | Low (memory_signal flag must not elevate authority) | 🟢 | Document: memory_signal=true must never elevate to Memory authority |
| 7 | cross_room_prompt_carryforward | `cross_room_prompt_carryforwards` via `cross-room-prompt-carryforward.ts` | ✅ | ✅ | CrossRoomPromptCarryforward | ✅ target_presence_id | ✅ status=active + expires_at | ✅ expires_at (best expiry coverage in codebase) | ✅ cross_room_event_id, impact_id, source_message_ids | ✅ carryforward_status | N/A (authority_label='cross_room_prompt_carryforward_not_memory') | Low | Low | Low | 🟢 | None — cleanest source for expiry mapping |
| 8 | lounge_recent_continuity (carryback) | `lounge_carrybacks` via `lounge.ts` | ✅ | ✅ with caveat | LoungeRecentContinuity | ✅ target_presence | Partial (status only) | ❌ (no expiry on carryback) | ❌ (id/created_at not forwarded) | ❌ | N/A | Low | Low | Low | 🟡 | Forward `id` and `created_at` from carryback struct |
| 9 | journal_inner_continuity | `presence_journal` via `journal.ts` | ✅ | ✅ | JournalInnerContinuity | ✅ presenceId in JournalContextReference | ❌ (no stored flag; recency+salience filter) | ❌ (no expiry) | ✅ journalId, authored_by, authority label | Partial (surfaced_to_user in DB, not forwarded) | N/A (authority='journal_inner_continuity_not_memory') | Low (scope enforced by presence_id) | Low | Low | 🟢 | Forward `salience` in `JournalContextReference` for relevance |
| 10 | held_truth_presence_continuity | `held_truths` via `journal.ts` (inner block) | ✅ (within Journal block) | ✅ with caveat | HeldTruthPresenceContinuity | ✅ presence_id enforced at query | Partial (status=active) | ❌ | ❌ (id, weight, source_journal_id stripped) | ❌ (status not forwarded) | N/A (not canonical Memory) | Low | Medium (bare truth string without authority label inline) | Medium (weight not visible; all truths look equal) | 🟡 | Forward `id`, `weight`, `status` in held truth reference; add "not Memory" inline note |
| 11 | pulse_autonomous_continuity | `pulse_autonomy_events` via `pulse-autonomy.ts` | ✅ | ✅ with caveat | PulseAutonomousContinuity | ✅ presence_id | Partial (status=completed filter) | Partial (choice_window_at) | Partial (chosen_action, tara_responded) | Partial (status: completed/failed/skipped) | Partial (confirmed_memory_entry_id not forwarded) | Low | Low | Medium (risk of double-counting if canonical Archive item also injected) | 🟡 | Document deduplication rule: if confirmed_memory_entry_id links to an already-injected Archive item, do not also inject as pulse continuity |
| 12 | living_state | `living_state` via `living-state.ts` | ✅ | ✅ with caveat | LivingState | ✅ presence_id enforced | ❌ (no stored flag) | ❌ (last_updated not forwarded) | ❌ (id, version, updated_by stripped) | ❌ (no review_state in schema) | N/A (not Memory) | Low | Low | Medium (**missing "not Memory" disclaimer in `## Living State` block header**) | 🟡 | (a) Add "not Memory" boundary to `getLivingStateForPrompt()` block header; (b) forward `last_updated` and `version` |
| 13 | current_house_context | `temporal.ts` + `governance-context.ts` | ✅ (always + conditional) | Partial | CurrentHouseContext | ✅ (governance scoped to presence desk) | Conditional (governance: term-detection gate) | ✅ (live-fetched; inherently fresh) | ❌ (formatted strings only; no structured IDs) | ❌ | N/A | Low | Low | Low | 🟡 | Coarse signal only; advisory value is "temporal orientation" not grounded recall |
| 14 | identity_timeline | `presence_timeline` via `timeline.ts` | ✅ | ✅ with caveat | IdentityTimeline | ✅ presence_id enforced | Partial (significance filter; not stored boolean) | ❌ (no expiry; entries permanent) | ❌ (id, added_by, significance not forwarded) | ❌ (no review_state; added_by not forwarded) | N/A (not Memory) | Medium (**voice_integrity stripped — cross-voice entry undetectable**) | Low | Medium (no inline authority label on `## Your history with Tara:` block) | 🟡 | Forward `voice_integrity`, `added_by`, `significance` from timeline entries |
| 15 | library_rag_reference | `library_items` via `library/chat-library-search.ts` | ✅ | ✅ | LibraryRagReference | ✅ presence_scope forwarded in LibraryReference | ✅ (authority gates) | ❌ (no TTL; superseded status proxy) | ✅ score, rank in LibraryReference | Partial (authority_status) | N/A (not Memory unless canonical_memory path) | Low | Low | Low (getEffectiveAuthorityStatus() + isCurrentAuthority() well-governed) | 🟢 | None — strong authority model |
| 16 | library_canonical_memory_reference | `library_items` (canonical_memory) + `archive_items` proof | ✅ (via library search when applicable) | ✅ | LibraryCanonicalMemoryReference | ✅ presence_scope forwarded | ✅ (canSpeakAsLivedMemory() gate) | ❌ | ✅ archive_item_id, derived_canonical_status | ✅ (canonical_memory label requires Archive proof) | ✅ derived from Archive canonical | Low | Low | Low (One Crown Rule enforced) | 🟢 | None — best-governed non-Archive Memory path |
| 17 | attachment_context | ephemeral, per-request via `files/chat-attachment-context.ts` | ✅ | ❌ | AttachmentContext | ❌ (no presence_scope field anywhere in struct) | Partial (extractionStatus=extracted) | ✅ (ephemeral by nature) | ❌ (no stable source_id) | ❌ | N/A (explicitly NOT Memory/Archive/Library) | High (**no presence scope on attachment**) | High (raw extracted text; no content-type gate beyond MIME) | Low | 🔴 | Must add `presence_id`/`room_slug` to attachment context struct before scope-safe mapping is possible |
| 18 | short_horizon_thread_context | `room_memories` via `memory.ts` | ✅ | ❌ | ShortHorizonThreadContext | ❌ (room_slug not forwarded as field; raw string only) | ❌ (always injected if non-null) | ❌ (updated_at not forwarded) | ❌ (all metadata stripped; raw string to prompt) | ❌ | N/A (not Memory) | Low (room_slug=presence_id enforces 1:1) | Medium (raw summary string with no content gate) | Low | 🔴 | `loadRoomMemory()` must return structured type (id, room_slug, updated_at, confidence) before mapping is safe |
| 19 | reflection_output | `reflections` table (not injected) | ❌ | ❌ | (not yet mapped) | ✅ presence_id | ❌ (no stored flag) | ❌ | ✅ source_refs[] | ✅ review_status + feedback_label (best review coverage) | N/A | Low | Low | Low (review_state present) | 🔴 | Not injected → keep excluded. `authored_by` absent from schema. Add before considering. |
| 20 | graph_context | `memory_nodes` / `archive_graph_nodes` (not injected) | ❌ | ❌ | (not yet mapped) | ✅ GraphPresenceScope | ✅ canGraphItemEnterPrompt() | ❌ | ✅ hasSourceReference | ✅ GraphReviewStatus (7 values) | ✅ GraphAuthorityStatus (9 values) | Low | Low | Low | 🔴 | CLAUDE.md hard rule: requires explicit phase authorisation. Defer until authorised. |
| 21 | graph_proposal_context | `graph_proposals` (not injected) | ❌ | ❌ | (not yet mapped) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | Low | Low | Low | 🔴 | Same as #20. Not yet authorised. |
| 22 | ontology_lab_context | `archive_graph_nodes` (not injected) | ❌ | ❌ | (not yet mapped) | ✅ | Partial | ❌ | Partial | Partial | ✅ | Low | Low | Low | 🔴 | Deferred. Not authorised for prompt injection. |
| 23 | relational_map_layout | UI layout positions only | ❌ | ❌ | (excluded; visual only) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | 🔴 | Permanent exclusion. Visual metadata only. |
| 24 | llm_reasoning_draft | runtime LLM output (not injected) | ❌ | ❌ | (trace only) | N/A | ❌ (hardcoded null) | N/A | N/A | N/A | N/A | N/A | High (raw LLM draft text) | High (reasoning is not evidence) | 🔴 | Permanent trace exclusion. |
| 25 | feedback_trace_not_evidence | `llm_reasoning_feedback_events` (not injected) | ❌ | ❌ | (trace only) | N/A | ❌ | N/A | N/A | N/A | N/A | N/A | Low | High | 🔴 | Permanent trace exclusion. |
| 26 | audit_trace_not_evidence | `reasoning_audit_events` (not injected) | ❌ | ❌ | (trace only) | N/A | ❌ | N/A | N/A | N/A | N/A | N/A | Low | High | 🔴 | Permanent trace exclusion. |
| 27 | interior_notes | `interior_notes` (not injected) | ❌ | ❌ | (InteriorNotes) | ✅ presence_id | ✅ is_active | ❌ | Partial | ❌ | N/A | Low | Low | Low | 🔴 | `authored_by` absent from schema; no review_state. Add before considering. |
| 28 | watchtower_source_grounding | runtime Watchtower queries (not injected) | ❌ | ❌ | (deferred) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | 🔴 | Deferred. No chat injection path. |
| 29 | unknown / insufficient | Fallback / empty | N/A | ✅ (synthetic) | Unknown / Insufficient | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | 🟢 (as fallback) | None |

---

## 5. Sources Ready for 39.6 Advisory Integration

🟢 **Six Tier 1 source families (seven signal paths) plus synthetic fallback are safe for 39.6 advisory integration with current metadata:**

| Surface | Signal type | Rationale |
|---|---|---|
| `confirmed_archive_memory` (recall path) | `GovernedConfirmedMemory` | `canonical_status`, `visibility`→scope, `rank_score` all available in `RecallEntry`. Treat as indefinite (no TTL by design). |
| `confirmed_archive_memory` (governed injection) | `GovernedConfirmedMemory` | `canonical_status` always 'canonical'; `visibility`→scope. Minor gap: `source_ref` absent from `InjectedMemory`; add `id` to fix. |
| `presence_scoped_confirmed_memory` | `PresenceScopedConfirmedMemory` | Same as above; scope enforced by `isInArchiveScope()`. |
| `cross_room_prompt_carryforward` | `CrossRoomPromptCarryforward` | **Best metadata coverage** — `expires_at`, `authority_label`, `target_presence_id`, source event IDs all available and forwarded. |
| `recent_continuity_not_memory` | `RecentContinuity` | `presence_id`, `classification`, `session_end` freshness proxy, `status` available. Caveat: `memory_signal=true` rows must not elevate authority. |
| `journal_inner_continuity` | `JournalInnerContinuity` | `JournalContextReference` carries `journalId`, `presenceId`, `entryType`, `authored_by`, `authority='journal_inner_continuity_not_memory'`. Authority boundary already enforced. |
| `library_rag_reference` / `library_canonical_memory_reference` | `LibraryRagReference` / `LibraryCanonicalMemoryReference` | `presence_scope` forwarded in `LibraryReference`. Authority gates (`getEffectiveAuthorityStatus`, `canSpeakAsLivedMemory`, One Crown Rule) are the strongest in the codebase. |
| `unknown` / `insufficient` (fallback) | `Unknown` / `Insufficient` | Synthetic fallback — safe by construction. |

---

## 6. Sources Not Ready / Excluded

🔴 **Nine surfaces are excluded from 39.6:**

| Surface | Exclusion reason | Path to inclusion |
|---|---|---|
| `short_horizon_thread_context` | `loadRoomMemory()` returns raw string only — no id, scope field, freshness, or structured metadata | Refactor to return `{ id, room_slug, summary, updated_at, confidence }` |
| `attachment_context` | No `presence_scope` on attachment struct. Ephemeral. No stable source ID. | Add `presence_id` / `room_slug` to attachment context; define stable ephemeral ref |
| `reflection_output` | Not injected (correct). `authored_by` absent from schema. No `prompt_eligible` boolean. | Add `authored_by` to schema; define `prompt_eligible` gate based on `review_status` |
| `graph_context` | Not injected (correct). CLAUDE.md hard rule requires explicit phase authorisation. | Phase authorisation required before wiring |
| `graph_proposal_context` | Same as above | Same |
| `ontology_lab_context` | Not authorised for prompt injection | Deferred |
| `relational_map_layout` | Visual-only metadata; no semantic authority | Permanent exclusion |
| `llm_reasoning_draft` | Trace only. `possible_review_route: null` hardcoded. Never evidence. | Permanent trace exclusion |
| `feedback_trace_not_evidence` / `audit_trace_not_evidence` | Trace only. `not_evidence=true` DB-constrained. | Permanent trace exclusion |
| `interior_notes` | Not injected (correct). `authored_by` absent from schema. No review_state. | Add `authored_by`; define review gate |
| `watchtower_source_grounding` | No chat injection path. | Deferred |

---

## 7. Metadata Gaps

### Universal gaps across most source families

| Gap | Sources affected | Severity |
|---|---|---|
| **No `expiry`/TTL field** | All except `cross_room_prompt_carryforwards` (`expires_at`). Room memory, journal, held truths, timeline, living state, library all lack explicit TTL. | Medium — freshness cannot be asserted; must rely on status flags or implicit retention windows |
| **No `prompt_eligible` boolean stored** | All except Graph (`promptEligible` field) and Interior Notes (`is_active`). All other families derive eligibility at query time. | Medium — a signal mapper must re-derive eligibility from a combination of status + filter logic, not read a single flag |
| **`authored_by` absent from schema** | `held_truths`, `interior_notes`, `library_items`, graph nodes, reflections, living_state (`updated_by='pulse'`, not a presence author) | Low-medium — affects provenance verification |
| **`confidence` on the item itself** | Only Reflections have per-item `confidence` (0-1). All other sources have query-time confidence only (e.g. `rank_score`, `match_score`). | Low — query-time scores are sufficient for v1 |

### Per-source forwarding gaps (metadata in DB but stripped before prompt assembly)

| Source | Field in DB | Not forwarded to prompt struct |
|---|---|---|
| Archive recall (`RecallEntry`) | `eligible_for_recall` | Not forwarded; must re-derive from `canonical_status` |
| Archive injection (`InjectedMemory`) | `id`, `source_ref` | Not forwarded; needed for `source_ref` in RuntimeContextSignal |
| Recent Continuity | `source_message_ids[]`, `confidence` (computed, not stored) | Not forwarded |
| Journal | `salience`, `source`, `journal_job_id`, `surfaced_to_user` | Not forwarded in `JournalContextReference` |
| Held Truths | `id`, `weight`, `status`, `source_journal_id` | All stripped; only bare truth string injected |
| Living State | `last_updated`, `version`, `updated_by` | Not forwarded to prompt struct |
| Timeline | `voice_integrity`, `added_by`, `significance` | Not forwarded |
| Carryback | `id`, `created_at` | Not forwarded |
| Pulse/Autonomy | `confirmed_memory_entry_id` | Not forwarded — risk of double-counting |

---

## 8. Provenance Risks

| Risk | Source(s) | Description |
|---|---|---|
| **`memory_signal` row elevation** | `recent_continuity_sessions` | Sessions where `memory_signal=true` are syntactically indistinguishable from other significant sessions in the formatted prompt block. A signal mapper must never treat these as confirmed Memory. The flag does not trigger any additional authority in the current codebase — correct — but this must be documented explicitly. |
| **Pulse double-counting** | `pulse_autonomy_events` + `archive_items` | An autonomy event that produced `confirmed_memory_entry_id` can appear in the prompt via both the Pulse autonomy block AND the governed Memory injection block. A RuntimeContextSignal mapper that fires both paths will generate two signals pointing to the same content at different authority levels. Deduplication is required. |
| **Archive canonical vs library canonical** | `archive_items` + `library_items` | Library items with `authority_status='canonical_memory'` derive their authority from a linked Archive item. If both the Archive canonical injection AND the library canonical path inject the same content, double-counting occurs at the Memory authority level. The One Crown Rule governs this at the type level but not at the runtime deduplication level. |
| **Journal invitations vs authored entries** | `presence_journal` | `entry_type='afterglow'` or `source='pulse_triggered'` indicates an AI-generated invitation, not presence-authored inner life. The signal mapper must distinguish these using `authored_by` and `source` fields. Currently, `source` is not forwarded in `JournalContextReference`. |
| **Memory candidate in recall** | `archive_items` (canonical_candidate) | Manual recall can surface `canonical_candidate` items alongside `canonical` items in the same block. These must map to `ManualMemoryCandidateRecall`, not `GovernedConfirmedMemory`. The `canonical_status` field is forwarded in `RecallEntry` and this is enforceable. |

---

## 9. Scope Risks

| Risk | Source | Description |
|---|---|---|
| **`voice_integrity` stripped from timeline** | `presence_timeline` | The `voice_integrity` field (ari/eli/null) identifies whether a timeline entry was authored in a particular presence's voice. It is not forwarded from `loadTimelineForPrompt()`. If an Ari-voiced entry exists in Eli's timeline (or vice versa), a RuntimeContextSignal mapper cannot detect it. This is a cross-presence voice-integrity gap. |
| **Carryback target_presence not enforced after block assembly** | `lounge_carrybacks` | `buildCarrybackBlock(presenceId)` filters by `target_presence` correctly, but the `id` and `created_at` are not forwarded. A signal mapper cannot verify the carryback's target scope after assembly; it must trust the upstream filter. |
| **Attachment lacks presence scope** | `chat-attachment-context.ts` | Chat attachments carry no `presence_id` or `room_slug`. Any attempt to map attachments to RuntimeContextSignal would produce a signal with undefined scope. This is a hard exclusion for v1. |
| **`involved_presences[]` in recent continuity not gated at injection** | `recent_continuity_sessions` | The `involved_presences[]` array on cross-lounge sessions indicates both Ari and Eli participated. The Lounge-sourced continuity sessions (where `source_surface='lounge'`) are filtered from the regular per-presence continuity block, but the `involved_presences` field is not forwarded in `getRecentContinuityForPrompt()` to allow a mapper to detect shared context. |

---

## 10. Content Leakage Risks

| Risk | Source | Description |
|---|---|---|
| **Bare held-truth strings** | `held_truths` injected via journal block | Held truths enter the prompt as bare text strings with no inline metadata, ID, or authority label. In the Recall Packet adapter, if the held-truth sub-block is mapped, the mapper has no access to `weight`, `status`, or `source_journal_id` — all stripped at `getJournalContextForPresence()`. A signal mapper cannot distinguish a high-weight truth from a low-weight truth without a DB re-fetch. |
| **Formatted-text-only blocks** | Room memory, temporal/governance | These blocks produce string output only. No structured types exist between the builder and the prompt. A RuntimeContextSignal mapper receiving only the formatted string cannot safely derive scope, authority, or freshness. These blocks are 🔴 excluded from v1 for this reason. |
| **Living State lacks "not Memory" disclaimer** | `living_state` via `getLivingStateForPrompt()` | Unlike the Recent Continuity block ("Not Memory") and the Journal Context block ("journal_inner_continuity_not_memory"), the `## Living State — where we are right now:` header contains no authority boundary statement. This is a prompt-safety gap: the model reads this block without an inline instruction that it is not canonical Memory. All other blocks include this. |
| **Attachment extracted text** | `chat-attachment-context.ts` | Attachment content is injected verbatim (with a prompt injection guard). No content classification gate exists beyond MIME type and char size. Not a v1 RuntimeContextSignal candidate. |

---

## 11. Prompt Builder Touchpoints

For the 39.6 advisory integration, the response instruction from the Recall Packet will be computed from the assembled context and **inserted as an advisory metadata block** in the system prompt — it will not replace or remove any existing context blocks.

The recommended insertion point in the prompt assembly sequence is **between the assembled context blocks and the final presence identity kernel** — after all context is assembled, before the identity statement closes the system prompt. This is consistent with how other advisory-only blocks (governance standing rule, archive boundary note) are currently positioned.

Prompt builders to be read (not modified) in 39.6:
- `src/app/api/ari-chat/route.ts`
- `src/app/api/eli-chat/route.ts`

Prompt builder functions to be tapped (read-only, not modified in 39.6):
- `buildGovernedMemoryInjection()` — for archive signal extraction
- `getRecallableArchiveEntries()` — for recall entries
- `getRecentContinuityForPrompt()` — for continuity signals
- `getCrossRoomCarryforwardBlock()` — for carryforward signals
- `getJournalContextForPresence()` — for journal + held truth signals
- `searchLibraryForPresence()` — for library signals

These functions already produce the structs (`InjectedMemory`, `RecallEntry`, `RecentContinuitySession`, `PromptCarryforward`, `JournalContextReference`, `LibraryReference`) from which metadata-only RuntimeContextSignals can be derived **without reading source content**.

---

## 12. Recommended 39.6 Scope

### Minimum safe advisory integration (tier 1)

Build a pure metadata extraction layer that reads the already-assembled context structs, produces `RuntimeContextSignal[]` from the metadata fields only (no content), calls `buildRecallPacketFromRuntimeSignals()`, and injects the `primary_response_instruction` and `has_conflict` advisory note into the system prompt.

**Tier 1 surfaces (5 + fallbacks):**

| Signal | Extraction source | Key metadata fields |
|---|---|---|
| `GovernedConfirmedMemory` | `InjectedMemory[]` from `buildGovernedMemoryInjection()` | `id` (after fix), `visibility`→scope, always `canonical` |
| `GovernedConfirmedMemory` / `ManualMemoryCandidateRecall` | `RecallEntry[]` from `getRecallableArchiveEntries()` | `id`, `canonical_status`→signal_type, `visibility`→scope, `rank_score`→relevance |
| `CrossRoomPromptCarryforward` | `PromptCarryforward[]` from `getCrossRoomCarryforwardBlock()` | `target_presence_id`, `expires_at`, `carryforward_status`, `cross_room_event_id` |
| `RecentContinuity` | `RecentContinuitySession[]` from `getRecentContinuityForPrompt()` | `presence_id`, `classification`→relevance, `session_end`→freshness proxy |
| `JournalInnerContinuity` | `JournalContextReference[]` from `getJournalContextForPresence()` | `journalId`, `presenceId`, `entryType`, `authored_by` |
| `LibraryRagReference` / `LibraryCanonicalMemoryReference` | `LibraryReference[]` from `searchLibraryForPresence()` | `presence_scope`, `score`, `authority_status`, `archive_item_id` (for canonical) |

**Tier 1 excluded from signal extraction (metadata too thin for v1):** Room memory, Temporal/governance, Attachments, Pulse/Autonomy (pending deduplication rule), Living State (pending "not Memory" fix), Timeline (pending voice_integrity fix), Held Truths (pending weight forwarding).

### Tier 2 surfaces (post-fix, later 39.6 or beyond)

After the recommended fixes in Section 13 are applied:
- `LivingState` (after `last_updated` forwarding + "not Memory" label added)
- `PulseAutonomousContinuity` (after deduplication rule is documented and enforced)
- `HeldTruthPresenceContinuity` (after `weight` and `status` forwarded)
- `IdentityTimeline` (after `voice_integrity` forwarded)
- `LoungeRecentContinuity` carryback (after `id` and `created_at` forwarded)

### Advisory instruction behaviour

The advisory note injected by the Recall Packet must:
- Be clearly bounded as advisory only ("Response instruction (advisory):")
- Not replace any existing context block
- Not claim to be the presence's own reasoning
- Not change the existing prompt structure

The primary `response_instruction` values expected for Tier 1 sources:
- `answer_confidently_from_confirmed_memory` — when Archive canonical is active and strong
- `say_recent_continuity_only` — when only recent continuity is active
- `surface_source_conflict` — when held truth vs confirmed Memory tension is detected (Tier 2)
- `say_not_enough_grounded_recall` — when no sources survive classification

---

## 13. Required Fixes Before 39.6

Four fixes are recommended. None block the Tier 1 surfaces from being wired advisorily. All are low-risk, metadata-only changes.

### Fix A — Add `id` to `InjectedMemory` type (**low effort**)
**File:** `src/lib/memory-injection.ts`
**Change:** Include `id` (archive_item_id) in the `InjectedMemory` struct returned by `buildGovernedMemoryInjection()`. Currently stripped.
**Why:** Enables `source_ref.source_id` in the RuntimeContextSignal for governed memory injection path. Without it, the signal has no traceable source ID.

### Fix B — Add "not Memory" boundary to Living State block header (**low effort**)
**File:** `src/lib/living-state.ts`, `getLivingStateForPrompt()`
**Change:** Add a single boundary line to the `## Living State` header: e.g. `## Living State — current orientation, not canonical Memory:` or append `(current state only — not Memory)` to the heading.
**Why:** Every other context block that is not Memory includes an inline authority disclaimer. Living State is the only injected block that is silent on its authority. This is a prompt-safety gap.

### Fix C — Forward `last_updated` from Living State (**low effort**)
**File:** `src/lib/living-state.ts`, `getLivingStateForPrompt()`
**Change:** Return `last_updated` (ISO timestamp) alongside the formatted block. Can be a separate field on the return type.
**Why:** Enables freshness assessment for the Living State RuntimeContextSignal.

### Fix D — Forward `voice_integrity` from Timeline (**low effort**)
**File:** `src/lib/timeline.ts`, `loadTimelineForPrompt()`
**Change:** Include `voice_integrity` (ari/eli/null) on the per-entry struct returned alongside the formatted block. Does not need to be injected into the prompt — only needed at signal-mapping time.
**Why:** Prevents cross-voice timeline entries from being silently mis-scoped in a RuntimeContextSignal. A signal with `presence_scope: 'ari'` but `voice_integrity: 'eli'` is a scope-safety signal.

### Not required before 39.6 Tier 1 (deferred):
- `authored_by` schema addition on `held_truths`, `library_items`, `interior_notes` — deferred to post-Tier-1 work
- `salience` forwarding in `JournalContextReference` — desirable but not blocking
- `weight` and `status` forwarding in held-truth sub-block — required for Tier 2 only
- `source` forwarding in `JournalContextReference` — needed to distinguish pulse-triggered invitations from presence-authored entries; defer to Tier 2

---

## 14. Verdict

**Six Tier 1 source families (seven signal paths) plus synthetic fallback** — Archive/confirmed memory (governed injection + recall paths), Cross-room carryforward, Recent Continuity, Journal inner continuity, Library context (RAG + canonical-memory), and Unknown/Insufficient synthetic fallback — carry sufficient metadata for safe RuntimeContextSignal production and advisory response instruction.

**Seven surfaces** are safe with caveats and targeted fixes (Living State pending "not Memory" label, Timeline pending voice_integrity, Held Truths pending weight forwarding, Pulse pending deduplication rule, Carryback pending id/created_at, Memory Candidates pending caveat labelling, Current House Context as coarse signal only).

**Nine surfaces** must remain excluded from 39.6 (Room Memory raw string, Attachments no scope, Reflections not injected, Graph not authorised, Interior Notes schema gap, all trace surfaces).

Four fixes are recommended, all low-effort, none blocking Tier 1.

---

**39.5 PARTIALLY READY — 39.6 may proceed only with limited source surfaces.**

Tier 1 (5–6 surfaces) may be wired advisorily in 39.6 with current metadata.
Tier 2 surfaces require the fixes in Section 13 before inclusion.
🔴 surfaces are excluded until separately authorised or schema-fixed.

The smallest safe advisory integration: **Governed Memory injection + Archive recall + Cross-room carryforward + Recent Continuity + Journal context + Library context.**
