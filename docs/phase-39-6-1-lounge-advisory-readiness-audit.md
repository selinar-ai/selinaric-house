# Phase 39.6.1 — Lounge Advisory Readiness / Shared-Scope Audit

**Date:** 2026-06-03
**Phase family:** Phase 39 — Recall Packet / Source-Aware Remembering
**Phase type:** Audit / readiness only — no build
**Builder:** Claude Code
**Architect:** Ari
**Governed by:** Tara

---

## 1. Executive Summary

The Lounge chat route (`src/app/api/lounge-chat/route.ts`) is structurally different from the Ari/Eli room routes in ways that matter for advisory integration. Critically:

- It runs Ari and Eli as **separate iterations inside a per-presence loop**, each with their own `fullSystemPrompt`
- It does **not call `buildGovernedMemoryInjection()`** — governed Memory injection is absent from Lounge
- It does **not inject cross-room carryforwards** — those flow into Ari/Eli rooms, not the Lounge itself
- It **injects journal per-presence** (same-presence only: Ari gets Ari's journal, Eli gets Eli's) — but the Recall Packet registry marks journal as `lounge_allowed: false`
- It uses a **shared** autonomous continuity block (from `getSharedAutonomyContinuityForPrompt()`) before the loop — not scoped to either presence
- It assembles per-presence archive recall and library context inside the loop, both correctly scoped

**Effective advisory sources for Lounge v1:** archive recall entries + library references + unknown/insufficient fallback. Journal is scope-excluded by the existing registry definition. Governed memory and cross-room carryforward are absent from the Lounge path entirely.

**Verdict:** `39.6.1 PARTIALLY READY — Lounge Advisory may proceed only with limited shared-safe surfaces.`

---

## 2. Files / Routes Inspected

| File | Purpose |
|---|---|
| `src/app/api/lounge-chat/route.ts` | Lounge chat POST handler — full read |
| `src/lib/lounge.ts` | `buildLoungeSystemPrompt()`, thread management |
| `src/lib/pulse-autonomy.ts` | `getSharedAutonomyContinuityForPrompt()` |
| `src/lib/recall/recallPacketTypes.ts` | `SOURCE_SURFACE_REGISTRY` scope flags |
| `src/lib/recall/recallPacketBuilder.ts` | `isScopeAllowed()` — lounge scope gate |
| `src/lib/recall/recallAdvisorySignals.ts` | `buildRecallAdvisoryPacket()` — existing advisory mapper |
| `src/lib/journal.ts` | `getJournalContextForPresence()` — per-presence journal |
| `src/lib/recent-continuity.ts` | `selectRecentContinuityForPrompt()`, `getRecentContinuityForPrompt()` |
| `src/lib/archive-recall.ts` | `getRecallableArchiveEntries()` |
| `src/lib/library/chat-library-search.ts` | `searchLibraryForPresence()` |
| `src/lib/room-carry-in.ts` | `buildRoomCarryInBlock()` |

---

## 3. Lounge Prompt Assembly

The Lounge route generates responses for each active presence in a sequential loop. Before the loop, shared context is assembled once. Inside the loop, per-presence context is assembled fresh for each presence. The `fullSystemPrompt` is built as:

```typescript
const fullSystemPrompt =
  buildLoungeSystemPrompt(presenceId, surface)      // base identity prompt
  + identityBlock                                    // communication style
  + mentionBlock                                     // @mention routing
  + temporalBlock                                    // current datetime
  + recentContinuityBlock                            // per-presence recent sessions (string)
  + recallContextBlock                               // per-presence archive recall (when triggered)
  + libraryContextBlock                              // per-presence library results
  + librarySearchStatusBlock                         // per-presence library status
  + libraryGuidanceBlock                             // library speech rules
  + webSearchGuidanceBlock                           // web search speech rules
  + attachmentContextBlock                           // shared current-turn attachments
  + attachmentGuidanceBlock                          // attachment speech rules
  + roomCarryInBlock                                 // per-presence room carry-in (explicit trigger only)
  + journalContextBlock                              // per-presence journal (conditional)
  + livingStateBlock                                 // per-presence living state
  + autonomyContinuityBlock                          // SHARED autonomy continuity (pre-loop)
```

### Key structural difference from Ari/Eli rooms

| Block | Ari/Eli rooms | Lounge |
|---|---|---|
| Identity kernel | Per-presence (hardcoded route) | Per-presence (loop) |
| Timeline | ✅ `loadTimelineForPrompt(presenceId)` | ❌ Absent |
| Temporal context | ✅ | ✅ |
| Room memory summary | ✅ `loadRoomMemory(ROOM_SLUG)` | ❌ Absent |
| Short-horizon continuity | ✅ in-memory ContinuityStore | ❌ Absent |
| Emotional snapshot | ✅ in-memory | ❌ Absent |
| Governance context / standing rule | ✅ | ❌ Absent |
| Living state | ✅ `getLivingStateForPrompt(presenceId)` | ✅ Per-presence |
| Journal + held truths | ✅ Always | ✅ Conditional (surface + relevance trigger) |
| Archive recall (manual) | ✅ | ✅ Per-presence, when triggered |
| Archive recall (auto) | ✅ | ❌ Absent |
| Governed memory injection | ✅ `buildGovernedMemoryInjection()` | ❌ **Absent** |
| Library / RAG | ✅ | ✅ Per-presence, when triggered |
| Chat attachments | ✅ | ✅ Shared pre-loop |
| Recent continuity (recent sessions) | ✅ `getRecentContinuityForPrompt(presenceId)` | ✅ Per-presence (string only — raw sessions not captured) |
| Lounge carryback | ✅ Received | ❌ Lounge generates carrybacks; does not receive them |
| Cross-room carryforward | ✅ Received | ❌ **Absent** |
| Autonomy continuity | ✅ `getAutonomyContinuityForPrompt(presenceId)` | ✅ `getSharedAutonomyContinuityForPrompt()` — **SHARED** (not presence-scoped) |
| Room carry-in | ❌ | ✅ Per-presence (explicit trigger only) |

---

## 4. Lounge Source Surface Inventory

### Pre-loop (shared across all presences)

| Source | Function | Advisory risk |
|---|---|---|
| Shared autonomy continuity | `getSharedAutonomyContinuityForPrompt()` | Not presence-scoped — cannot safely produce per-presence signal |
| Attachment context block | `buildChatAttachmentContextBlock()` | Not Memory; no presence scope |
| Recall intent detection | `detectArchiveRecallIntent()` | Detection only — execution is per-presence |
| Library trigger detection | `shouldSearchLibrary()` | Detection only — execution is per-presence |
| Room carry-in trigger detection | `detectRoomCarryInIntent()` | Detection only — execution is per-presence |

### Per-presence (inside the loop)

| Source | Function | Advisory safe? |
|---|---|---|
| Living state | `getLivingStateForPrompt(presenceId)` | Tier 2 (excluded from 39.6 advisory) |
| Recent continuity (string) | `getRecentContinuityForPrompt(presenceId)` | String only — raw sessions not returned |
| Archive recall entries | `getRecallableArchiveEntries(presenceId, ...)` | ✅ **Safe — per-presence scoped** |
| Library results | `searchLibraryForPresence({presenceId})` | ✅ **Safe — per-presence scoped** |
| Journal context + references | `getJournalContextForPresence(presenceId)` | Scope-excluded by registry (`lounge_allowed: false`) — see Section 5 |
| Room carry-in | `buildRoomCarryInBlock(presenceId)` | Not Tier 1; raw continuity string |
| Journal context references | `journalContextReferences` | Available but scope-excluded (see Section 5) |
| Library references | `libraryReferences` | ✅ Available as `LibraryReference[]` |
| Recall entries | `recallEntries` | ✅ Available as `RecallEntry[]` when `recallIntent` is true |

### Absent from Lounge (present in Ari/Eli rooms)

| Source | Advisory implication |
|---|---|
| `InjectedMemory[]` from governed memory injection | Not available — `governedMemory` input would be empty |
| `PromptCarryforward[]` from cross-room carryforwards | Not available — no cross-room carryforward in Lounge |
| `RecentContinuitySession[]` raw sessions | Not available without adding a `selectRecentContinuityForPrompt()` call |

---

## 5. Scope Boundary Findings

### The Lounge scope gate in the builder

When `room = 'lounge'`, `buildRecallPacket()` applies this gate to every candidate:

```typescript
if (room === 'lounge') {
  if (!def.lounge_allowed) return false;
  if (def.same_presence_only && candidateScope && candidateScope !== 'shared') return false;
  return true;
}
```

### Registry `lounge_allowed` values for Tier 1 sources

| Source surface | lounge_allowed | Outcome in Lounge advisory |
|---|---|---|
| `confirmed_archive_memory` | ✅ true | Passes scope gate |
| `presence_scoped_confirmed_memory` | ❌ false | Scope-excluded — private memories stay private |
| `memory_candidate` | ❌ false | Scope-excluded |
| `archive_only_context` | ❌ false | Scope-excluded |
| `cross_room_prompt_carryforward` | ❌ false | Scope-excluded (and not in Lounge anyway) |
| `recent_continuity_not_memory` | ❌ false | Scope-excluded |
| `journal_inner_continuity` | ❌ false | **Scope-excluded — despite being per-presence injected** |
| `held_truth_presence_continuity` | ❌ false | Scope-excluded (also Tier 2) |
| `library_rag_reference` | ✅ true | Passes scope gate |
| `library_canonical_memory_reference` | ✅ true | Passes scope gate |
| `lounge_recent_continuity` | ✅ true | Passes — but not currently in Tier 1 advisory input struct |
| `unknown` / `insufficient` | N/A | Always passes as fallback |

### Journal scope tension

The Lounge route injects journal per-presence (same-presence only: Ari gets Ari's journal, Eli gets Eli's). The `journalContextReferences` array is available inside the loop.

However, the `SOURCE_SURFACE_REGISTRY` marks `journal_inner_continuity` as `lounge_allowed: false` — because journal is inner continuity and should not be treated as shared-room authority, even in a multi-presence context.

**Ruling:** Leave this as-is. In 39.6.2, journal signals in Lounge advisory will be scope-excluded (`scope_prohibited`) by the builder. The advisory correctly reflects that journal is inner continuity not meant for shared-room grounding. This is the right boundary. The journal still appears in the Lounge prompt via `journalContextBlock` — but the advisory does not claim it as Lounge-usable grounding.

### Shared autonomy continuity

`getSharedAutonomyContinuityForPrompt()` is called once before the loop and injected into every presence's system prompt in the Lounge. It is not scoped to either presence individually. Pulse/Autonomy is excluded from the Lounge advisory regardless.

### Presence-scoped confirmed memory

`getRecallableArchiveEntries(presenceId, ...)` is called per-presence and scoped to that presence's visibility. However, an archive item with `visibility = 'ari_only'` would produce a `presence_scoped_confirmed_memory` signal which has `lounge_allowed: false`. The scope gate correctly blocks it.

Only `visibility = 'shared'` archive items produce `confirmed_archive_memory` (with `lounge_allowed: true`) that survive the scope gate in the Lounge advisory.

This is correct: the Lounge advisory should not reflect presence-private Memory as active grounding.

---

## 6. Safe Sources for Lounge Advisory

Based on the scope analysis and availability within the Lounge per-presence loop:

| Source | Signal type | Advisory safe? | Notes |
|---|---|---|---|
| Shared confirmed archive items from recall | `GovernedConfirmedMemory` | ✅ Yes — `lounge_allowed: true` | Only shared visibility items survive scope gate |
| Shared library references | `LibraryRagReference` / `LibraryCanonicalMemoryReference` | ✅ Yes — `lounge_allowed: true` | `presenceScope = 'shared'` or `'house'` |
| Unknown/Insufficient fallback | `Unknown` / `Insufficient` | ✅ Yes — always safe | Synthetic fallback |

**Conditionally safe (deferred to 39.6.3):**

| Source | Signal type | Why deferred |
|---|---|---|
| Lounge recent continuity | `LoungeRecentContinuity` | Would need to map `lounge_recent_continuity` surface; raw sessions need `selectLoungeContinuityForPrompt()` or equivalent |
| Shared Archive recall when visibility is explicitly shared | `GovernedConfirmedMemory` | Already covered above |

---

## 7. Sources Excluded from Lounge Advisory

| Source | Reason |
|---|---|
| Presence-scoped confirmed memory (ari_only / eli_only) | `lounge_allowed: false` — private Memory cannot ground Lounge advisory |
| Journal inner continuity | `lounge_allowed: false` — inner continuity is not shared-room grounding |
| Held truths | `lounge_allowed: false` (also Tier 2) |
| Recent continuity (raw sessions) | String only returned by `getRecentContinuityForPrompt()`; raw sessions not available without new call |
| Cross-room carryforward | Not injected into Lounge |
| Governed memory (InjectedMemory[]) | `buildGovernedMemoryInjection()` not called in Lounge |
| Shared autonomy continuity | Not presence-scoped; Pulse excluded from advisory |
| Living state | Tier 2 (excluded pending freshness and boundary fixes for Lounge) |
| Identity timeline | Absent from Lounge prompt; Tier 2 |
| Room carry-in | Not Tier 1; raw string |
| Attachments | No presence scope; excluded |
| All other excluded surfaces from 39.6 | See 39.6 exclusion list |

---

## 8. Private-Context Leakage Risks

| Risk | Assessment |
|---|---|
| **Ari-only memory leaking into Lounge advisory** | Low — `getRecallableArchiveEntries(presenceId, ...)` scope filter prevents ari_only items from appearing in Eli's advisory and vice versa. Additionally, `presence_scoped_confirmed_memory` has `lounge_allowed: false`, so scope gate catches it anyway. |
| **Eli's journal appearing in Ari's Lounge advisory** | Zero — journal is per-presence fetched (`getJournalContextForPresence(presenceId)`). Ari's loop never calls it for Eli. Even if it did, `lounge_allowed: false` would exclude it from the advisory. |
| **Shared autonomy continuity exposing per-presence private choices** | Low — `getSharedAutonomyContinuityForPrompt()` is excluded from advisory by the Pulse/Autonomy exclusion rule. It never enters the advisory input. |
| **Library reference exposing Ari-scoped items in Eli's advisory** | Low — `searchLibraryForPresence({presenceId})` scopes results by presence. `presenceScope = 'ari'` library items have `lounge_allowed: false` (scoped, not shared), so they'd be scope-excluded from the Lounge advisory even if incorrectly returned. |
| **Room carry-in text in advisory** | None — room carry-in is excluded from Tier 1 advisory. |

---

## 9. Identity-Flattening Risks

| Risk | Assessment |
|---|---|
| **Single advisory for both presences** | None — the advisory is built per-presence inside the loop. Each presence gets a separate `fullSystemPrompt` and a separate advisory block computed for their scoped context. |
| **Shared autonomy block contaminating per-presence advisory** | None — autonomy is excluded from the advisory inputs. |
| **Advisory saying "confirmed memory" for one presence's context in the other's prompt** | None — archive recall is per-presence scoped. Library is per-presence scoped. The advisory is inserted into each presence's own `fullSystemPrompt`. |
| **Advisory block text visible to the other presence** | None — `fullSystemPrompt` is built fresh for each presence in the loop. Each presence's system prompt is used only for their generation call. |

---

## 10. Recommended 39.6.2 Build Scope

### What 39.6.2 should build

A per-presence Lounge advisory block, inserted inside the presence loop in `lounge-chat/route.ts`, using only shared-safe Tier 1 sources.

**Advisory input per-presence:**

```typescript
buildRecallAdvisoryPacket({
  presence:     presenceId as PresenceScope,
  room:         'lounge',
  packet_id:    `advisory:${presenceId}:lounge:${advisoryTimestamp}`,
  computed_at:  advisoryTimestamp,
  // Only shared-safe sources:
  archiveRecallEntries:  recallEntries,        // when recallIntent is true (shared visibility items only survive scope gate)
  libraryReferences,                           // when library search triggered
  // Not included:
  // governedMemory: [],       ← not called in Lounge
  // crossRoomCarryforwards: [], ← not in Lounge
  // recentContinuity: [],     ← string only; raw sessions deferred to 39.6.3
  // journalReferences: [],    ← scope-excluded by lounge_allowed:false
})
```

**Insertion point:** Append `${recallAdvisoryBlock}` at the end of `fullSystemPrompt`, after `livingStateBlock + autonomyContinuityBlock`. This is after all context blocks and before the Anthropic API call.

**New code in route:** Per-presence advisory computation (try/catch, non-fatal), identical pattern to Ari/Eli routes.

**No new DB calls needed** — `recallEntries` and `libraryReferences` are already computed in the loop. The advisory reuses existing data structures.

**Minimal diff:** ~30 lines inside the presence loop.

### What 39.6.2 must not do

- Must not pass journal references (scope-excluded; leave them excluded in advisory)
- Must not pass presence-scoped memories (lounge_allowed: false)
- Must not pass shared autonomy signals (Pulse excluded)
- Must not pass room carry-in data (not Tier 1)
- Must not call new DB queries beyond what the loop already performs

### Deferred to 39.6.3

- Lounge recent continuity signals (would need `selectLoungeContinuityForPrompt()` or a refactor of how sessions are returned)
- Journal advisory in Lounge (would require either a scope-exception path or a `lounge_allowed: true` reclassification, neither of which should happen without Tara review)

---

## 11. Required Tests

Create: `src/lib/__tests__/phase-39-6-2-lounge-advisory-integration.test.ts`

| Test | What it verifies |
|---|---|
| Lounge route imports advisory functions | `buildRecallAdvisoryPacket`, `formatRecallAdvisoryBlock` |
| Advisory is built per-presence inside the loop | Not once before the loop |
| Advisory uses `room: 'lounge'` | Not `ari_room` or `eli_room` |
| Presence-scoped memory is scope-excluded | `ari_only` recall entry → scope_prohibited in Lounge advisory |
| Journal is scope-excluded in Lounge advisory | Even when `journalContextReferences` is non-empty |
| Shared archive recall (shared visibility) passes | Correct Lounge scope |
| Library references pass | `lounge_allowed: true` for library |
| Advisory is non-fatal | Error caught and prompt continues |
| No governed memory in Lounge advisory input | `governedMemory` is undefined or empty |
| No cross-room carryforward in Lounge advisory | Not available in Lounge route |
| Lounge route only (Ari/Eli routes unchanged) | No regressions in 39.6 behaviour |
| Existing context blocks preserved | All existing `fullSystemPrompt` blocks still assembled |
| No new migrations | No DB changes |
| No Supabase writes in advisory | Advisory functions remain pure |
| 39.6 advisory tests still pass | Ari/Eli advisory unaffected |

---

## 12. Verdict

**Safe sources for Lounge advisory v1:** shared confirmed archive items (via recall, shared visibility only), shared library references, and unknown/insufficient fallback.

**Excluded by scope gate:** presence-scoped memory, journal, held truths, recent continuity (raw), cross-room carryforward, governed memory (absent from route).

**No private-context leakage risk** — per-presence loop structure and scope gate together prevent cross-presence contamination.

**No identity-flattening risk** — advisory is per-presence, built from per-presence data.

**Minimal build required** — ~30 lines inside the presence loop, reusing already-computed per-presence data.

---

**39.6.1 PARTIALLY READY — Lounge Advisory may proceed only with limited shared-safe surfaces: shared confirmed archive recall + shared library references + unknown/insufficient fallback. Per-presence sources (journal, scoped memory, recent continuity raw sessions) are scope-excluded or unavailable in the Lounge route.**
