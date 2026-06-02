# Phase 38 — Governed Reasoning Layer Closure / Architecture Record

**Closed:** 2026-06-02
**Commits:** `6dae011` (38.1–38.3.2b) · `2fe4daf` (38.3.3) · `e1b6af1` (38.4.1) · `e17260b` (38.4.2)
**Total assertions:** 936/936 passing

---

## 1. Executive Summary

Phase 38 added a governed reasoning layer to Selináric House. The system can now generate a structured LLM-assisted explanation of evidence conditions for a graph-assisted candidate suggestion, display it as a subordinate panel beneath the deterministic reasoning baseline, accept Tara's feedback on whether the reasoning draft was useful, and store that feedback without moving any authority.

Every step was designed to confirm the same law: **reasoning explains evidence; reasoning does not create authority.**

The reasoning layer explains. It does not decide. It does not promote. It does not remember.

---

## 2. What Phase 38 Solved

Before Phase 38, the House could:
- Identify graph-assisted candidate suggestions (Phase 37H)
- Hydrate evidence with titles, status snapshots, and role labels (37H.3)
- Display deterministic evidence conditions (38.1–38.2)

Phase 38 added:
- A constrained LLM explanation of the evidence condition — *why* the evidence looks the way it does
- Server-side auth protection for the LLM route (HMAC HttpOnly cookie)
- A manual, dismissible draft panel subordinate to the deterministic view
- A safe, append-only feedback channel so Tara can record whether the reasoning draft helped

Nothing in Phase 38 changes archive status, creates Memory, creates Held Truth, modifies graph proposals, alters prompt eligibility, or produces evidence.

---

## 3. Phase 38 Workstream Timeline

| Sub-phase | What was built | Status |
|---|---|---|
| 38.0 | Alignment / Boundary Report — defined reasoning cage before any implementation | Closed |
| 38.1 | Deterministic reasoning baseline — `buildReasoningBaseline()`, 14 categories, 7 evidence conditions, packet sufficiency | Closed `6dae011` |
| 38.1a | Baseline closure — confirmed pure computation, no DB, no writes | Closed |
| 38.2 | Deterministic reasoning panel — read-only UI in Graph Suggestion detail | Closed `6dae011` |
| 38.2a | Panel smoke — verified non-authoritative, non-storing | Closed |
| 38.3.0 | LLM input/output contract — defined allowed fields, forbidden fields, output schema, forbidden language | Closed |
| 38.3.1 | Contract + schema tests — 140 assertions, `possible_review_route` locked null | Closed `6dae011` |
| 38.3.2 | Read-only LLM draft route — `POST /api/graph-candidate-suggestions/[id]/llm-reasoning-draft` | Closed `6dae011` |
| 38.3.2a | Route smoke — confirmed 401 on unauthenticated, no LLM before auth | Closed |
| 38.3.2b | Auth hardening — HMAC HttpOnly cookie, `POST /api/house-auth/login`, `POST /api/house-auth/logout` | Closed `6dae011` |
| 38.3.3 | Manual LLM draft panel — `LLMReasoningDraftPanel.tsx`, Generate button, client safety guard | Closed `2fe4daf` |
| 38.4.0 | Feedback alignment — defined table name, labels, `candidate_signal` vs `potential_candidate`, storage boundary | Closed |
| 38.4.1 | Feedback event table + endpoint — `llm_reasoning_feedback_events`, `POST /api/llm-reasoning-feedback` | Closed `e1b6af1` |
| 38.4.2 | Feedback UI — five chips in draft panel, `Flag for future review` = `candidate_signal` | Closed `e17260b` |
| 38.4.3 | Architecture record (this document) | Closed |

---

## 4. Core Architecture Laws

These laws govern all Phase 38 components and must be carried forward into every future phase that touches reasoning, feedback, or audit.

```
Reasoning explains evidence.
Reasoning does not create authority.
A reasoning-supported candidate is still only a candidate.

LLM drafts are not evidence.
Graph support is not Memory.

Feedback evaluates reasoning usefulness only.
Feedback does not move truth.
Candidate signal is not candidate creation.
```

**Added with Phase 38.4.3 — for the next phase:**

```
Audit records trace.
Audit does not create truth.
Audit does not become evidence.
Audit does not move authority.
```

---

## 5. Deterministic Reasoning Baseline

**Files:** `src/lib/graph/reasoningBaseline.ts`, `src/lib/graph/reasoningTypes.ts`
**Commit:** `6dae011`

The deterministic baseline is the **skeleton** of the reasoning layer. It classifies evidence conditions using only structured data — no LLM, no network calls, no side effects.

**14 reasoning categories (all computable from hydrated DTO):**

| Category | Meaning |
|---|---|
| `direct_archive_support` | Weighted confirmed archive evidence present |
| `indirect_archive_support` | Archive context present, not direct confirmed |
| `graph_support_only` | Only graph structure, no archive evidence |
| `mixed_archive_and_graph` | Both present |
| `missing_primary_evidence` | No weighted archive sources |
| `missing_tara_authored` | No Tara-authored evidence (not yet computed) |
| `status_changed_since_suggestion` | Status drift detected |
| `candidate_type_mismatch` | Required fields missing |
| `prompt_ineligible_by_design` | Always true — suggestions never prompt eligible |
| `non_authoritative_suggestion` | Always true |
| `review_required` | Pending review |
| `dismissed_suggestion` | Suggestion is dismissed |
| `deleted_or_missing_source` | Evidence source unavailable |
| `insufficient_packet` | Packet fails sufficiency — reasoning blocked |

**7 qualitative evidence conditions:**
`directly_supported` · `partially_supported` · `graph_supported_only` · `inferred_only` · `missing_primary` · `conflicting_or_unresolved` · `insufficient`

**Packet sufficiency checks:**
- Target archive item missing or deleted → insufficient
- Zero evidence (no archive, no graph) → insufficient
- All archive sources missing → insufficient
- Graph-only with no archive → insufficient
- Held Truth candidate missing presence or truth text → insufficient

**Key invariant:** `insufficient_packet` category **blocks all LLM reasoning**. The deterministic panel remains the primary visible layer regardless of whether an LLM draft is generated.

---

## 6. LLM-Assisted Reasoning Draft Route

**Route:** `POST /api/graph-candidate-suggestions/[id]/llm-reasoning-draft`
**Service:** `src/lib/graph/llmReasoningService.ts`
**Contract:** `src/lib/graph/llmReasoningContract.ts`, `src/lib/graph/llmReasoningTypes.ts`
**Commit:** `6dae011`

**Execution order (cannot be changed):**
1. Auth check (`requireHouseApiAuth`) — 401 if not authenticated
2. Read suggestion id from route param
3. Hydrate suggestion (read-only)
4. Build deterministic baseline
5. `canRunLLMReasoning()` — blocks if insufficient
6. Build and validate LLM input packet (allowlist-only)
7. Build constrained prompt (from contract, not runtime construction)
8. Call Anthropic API (`claude-haiku-4-5`, no tools, no streaming)
9. Parse JSON
10. `validateLLMReasoningDraft()` — validates schema, forbidden language, `possible_review_route: null`
11. Return validated draft with `stored:false`, `evidence:false`, `authority_changed:false`

**What the route accepts:** suggestion id (route param only)
**What the route never accepts from client:** evidence packet, prompt text, model instructions, route hints, governance flags

**What is validated in output:**
- All 9 required sections present
- `possible_review_route` must be `null` — permanently locked
- `authority_boundary` must contain mandatory text
- All 5 base Do Not Conclude items present
- 22 forbidden phrases scanned and rejected

**What is never stored:** prompt text, raw model response, draft body, draft sections

---

## 7. Server-Side Auth Hardening

**Files:** `src/lib/server/houseAuth.ts`, `src/app/api/house-auth/login/route.ts`, `src/app/api/house-auth/logout/route.ts`
**Commit:** `6dae011`

**Context:** The original House auth was `sessionStorage`-based — a client-side UI gate only. Unauthenticated direct HTTP calls to all API routes succeeded. When the LLM draft route was added, this became a liability because unauthenticated callers could trigger Anthropic API spend.

**Solution:** HMAC-SHA256 HttpOnly cookie. Token = `HMAC(password + ':house_session', HOUSE_AUTH_SECRET)`. Timing-safe comparison. Fail-closed when config is missing (503).

**Cookie properties:** `HttpOnly: true`, `SameSite: lax`, `Secure: true` (production), `Path: /`, `MaxAge: 7 days`

**Protected route:** `POST /api/graph-candidate-suggestions/[id]/llm-reasoning-draft` — auth check is step 1; the LLM is never called before auth passes.

**Scope:** Auth hardening was applied **only to the LLM draft route and the feedback endpoint**. Other House API routes remain on the existing open-RLS pattern consistent with the private single-user deployment. This was intentional — no broad auth rewrite.

**Env vars required (server-only, never NEXT_PUBLIC_):**
- `HOUSE_AUTH_PASSWORD`
- `HOUSE_AUTH_SECRET`

---

## 8. Manual LLM Draft Panel

**File:** `src/components/graph/LLMReasoningDraftPanel.tsx`
**Commit:** `2fe4daf`

**Placement:** Below `DeterministicReasoningPanel`, above Context Group / Audit Trail.

**Visual hierarchy:** Deterministic panel (primary, always visible) > LLM draft panel (subordinate, requires explicit action)

**Generation rules:**
- Manual "Generate draft" click only
- No `useEffect` / on-mount generation
- No background prefetch
- No retry loop
- No streaming
- `fetch(..., { method: 'POST', credentials: 'same-origin' })` — no request body
- Server constructs the entire evidence packet

**Client safety guard (`clientSafetyGuard`):** Validates response before rendering:
- `ok === true`
- `draft` and `meta` present
- `possible_review_route === null`
- `meta.stored === false`, `meta.evidence === false`, `meta.authority_changed === false`
- `authority_boundary` contains mandatory text

**On failure:** Safe error messages only. No raw prompt, model output, stack trace, or secrets shown.

**State:** Component state only. Refresh clears draft — no persistence anywhere.

**Dismissed suggestion note:** Shown when `suggestionStatus === 'dismissed'`, clarifying the draft is historical/contextual and does not reopen review.

---

## 9. Reasoning Feedback Event Table + Endpoint

**Table:** `llm_reasoning_feedback_events` (migration `071`)
**Endpoint:** `POST /api/llm-reasoning-feedback`
**Commit:** `e1b6af1`

### Table design

```sql
llm_reasoning_feedback_events (
  id uuid PK,
  suggestion_id FK → graph_candidate_suggestions(id) ON DELETE RESTRICT,
  feedback_type CHECK IN ('useful','not_useful','needs_evidence','misread','candidate_signal'),
  feedback_note text (max 500 chars),
  draft_model text,
  draft_generated_at timestamptz,
  suggestion_status_at_feedback text,   -- server-derived
  candidate_type_at_feedback text,      -- server-derived
  authority_changed boolean DEFAULT false,  -- DB constraint: always false
  not_evidence boolean DEFAULT true,        -- DB constraint: always true
  prompt_eligible boolean DEFAULT false,    -- DB constraint: always false
  review_routed boolean DEFAULT false,      -- DB constraint: always false
  created_by text DEFAULT 'tara',
  created_at timestamptz DEFAULT now()
)
```

**Named DB constraints:** `lrfe_authority_never_changes`, `lrfe_not_evidence_always_true`, `lrfe_not_prompt_eligible`, `lrfe_not_review_routed`, `lrfe_note_length_check`

**Append-only.** No UPDATE, DELETE, or UPSERT. No unique constraints.

**Feedback type meanings:**

| Value | UI label | Meaning |
|---|---|---|
| `useful` | Useful | Draft helped Tara understand the evidence |
| `not_useful` | Not useful | Draft did not help |
| `needs_evidence` | Needs more evidence | More source evidence needed |
| `misread` | Misread | Draft misread or overstated the evidence |
| `candidate_signal` | Flag for future review | Tara noticed this may deserve future human attention |

**`candidate_signal` boundary:** This value is not candidate creation. It does not open a review route. It does not change Memory or Held Truth status. It is Tara's observation recorded as a feedback event.

**`potential_candidate` is rejected** by the enum constraint — it is not a valid feedback type and was deliberately excluded to prevent future semantic confusion.

**What is never stored:** full LLM draft text, draft sections (`evidence_summary`, `directly_supported`, etc.), raw prompt, raw model response, archive content, chat history. `draft_hash` deferred.

**Endpoint execution order:**
1. Auth check (`requireHouseApiAuth`) — 401 if unauthenticated
2. Validate `suggestion_id` (UUID format)
3. Validate `feedback_type` (enum)
4. Validate `feedback_note` (max 500 chars, optional)
5. Fetch suggestion for `suggestion_status_at_feedback` and `candidate_type_at_feedback` (read-only)
6. Insert one feedback event with server-set governance fields
7. Return `{ ok: true, feedback_id, feedback_type, authority_changed, not_evidence, prompt_eligible, review_routed }`

Client-supplied `authority_changed`, `not_evidence`, `prompt_eligible`, `review_routed`, and `created_by` values are **always ignored and overridden** by the server.

---

## 10. Reasoning Feedback UI

**File:** `src/components/graph/LLMReasoningDraftPanel.tsx` (modified)
**Commit:** `e17260b`

**Visibility:** Appears only when `state.phase === 'success'`. Hidden during idle, generating, and error states.

**Five chips:**

| UI label | Internal value |
|---|---|
| Useful | `useful` |
| Not useful | `not_useful` |
| Needs more evidence | `needs_evidence` |
| Misread | `misread` |
| **Flag for future review** | `candidate_signal` |

**"Potential candidate" is not used anywhere in the UI.** The label was rejected in 38.4.0 alignment because it implies candidate creation.

**Behaviour:**
- Single-select
- One submission per generated draft
- Submitting state disables all chips
- On success: "Feedback recorded. This does not change authority."
- Chips hidden after successful submission
- Regenerate draft resets feedback state to idle (chips reappear for new draft)

**Boundary note (always visible in feedback section):** "Feedback is for reasoning quality only. It does not change Memory, Held Truth, graph authority, or prompt eligibility."

**Request payload (strict):** `suggestion_id`, `feedback_type`, `draft_model` (optional), `draft_generated_at` (optional). No draft text, no sections, no governance flags, no evidence packet data.

**No note field in 38.4.2.** The endpoint supports optional `feedback_note` for future use; the UI does not expose it yet.

---

## 11. Tables Created

| Table | Migration | Purpose |
|---|---|---|
| `llm_reasoning_feedback_events` | `071_llm_reasoning_feedback_events.sql` | Append-only feedback events for LLM reasoning drafts |

**Existing tables used (read-only, not mutated by Phase 38):**

| Table | Phase 38 usage |
|---|---|
| `graph_candidate_suggestions` | Hydrated for evidence packet and feedback snapshot |
| `archive_items` | Read for archive source titles and status snapshots |
| `archive_graph_nodes` | Read for legacy graph node evidence |
| `archive_graph_edges` | Read for legacy graph edge evidence |
| `graph_proposals` | Read for approved proposal evidence |
| `held_truths` | Not touched — confirmed in smoke tests |
| `archive_memory_events` | Not touched |
| `graph_proposal_events` | Not touched |

---

## 12. Routes Created

### `POST /api/graph-candidate-suggestions/[id]/llm-reasoning-draft`

| Property | Value |
|---|---|
| Auth required | Yes — HMAC HttpOnly cookie |
| Accepts from client | Route param `id` only |
| Forbidden client input | Evidence packet, prompt text, model instructions, governance flags |
| Writes | Nothing |
| Must never mutate | `archive_items`, `held_truths`, `graph_proposals`, suggestion status, prompt eligibility |
| `possible_review_route` | Permanently `null` in output |

### `POST /api/llm-reasoning-feedback`

| Property | Value |
|---|---|
| Auth required | Yes — HMAC HttpOnly cookie |
| Accepts from client | `suggestion_id`, `feedback_type`, optional `feedback_note`, optional `draft_model`, optional `draft_generated_at` |
| Forbidden client input | Draft text, draft sections, governance flags, routing instructions |
| Writes | One row to `llm_reasoning_feedback_events` (append-only) |
| Must never mutate | `archive_items`, `held_truths`, `graph_proposals`, `archive_memory_events`, suggestion status, prompt eligibility |

### `POST /api/house-auth/login` and `POST /api/house-auth/logout`

| Property | Value |
|---|---|
| Purpose | Set / clear HMAC HttpOnly auth cookie |
| Writes | None (cookie only) |
| Must never store | Password, secret, raw token in response body |

---

## 13. Components Created / Modified

| File | Phase | Change |
|---|---|---|
| `src/lib/graph/reasoningTypes.ts` | 38.1 | 14 reasoning categories, 7 evidence conditions, `ReasoningBaseline` type |
| `src/lib/graph/reasoningBaseline.ts` | 38.1 | `buildReasoningBaseline()`, packet sufficiency, category computation, evidence condition |
| `src/lib/graph/llmReasoningTypes.ts` | 38.3.1 | `LLMReasoningInput`, `LLMReasoningDraft`, failure codes, constants, forbidden phrases |
| `src/lib/graph/llmReasoningContract.ts` | 38.3.1 | Input builder, input validator, draft validator, prompt builder, forbidden language detector |
| `src/lib/graph/llmReasoningService.ts` | 38.3.2 | `generateLLMReasoningDraft()` — full draft generation pipeline |
| `src/lib/server/houseAuth.ts` | 38.3.2b | HMAC cookie auth — `requireHouseApiAuth`, `buildAuthCookie`, `verifyLoginPassword` |
| `src/components/graph/DeterministicReasoningPanel.tsx` | 38.2 | Deterministic evidence condition panel (primary reasoning view) |
| `src/components/graph/LLMReasoningDraftPanel.tsx` | 38.3.3 / 38.4.2 | Manual draft panel + feedback chips; exports `clientSafetyGuard`, `mapFailureMessage`, `FEEDBACK_CHIPS` |
| `src/components/graph/GraphSuggestionDetail.tsx` | 38.2 / 38.3.3 | Inserted `DeterministicReasoningPanel` and `LLMReasoningDraftPanel` below evidence sections |
| `src/app/page.tsx` | 38.3.2b | Calls `/api/house-auth/login` on successful client login to set server cookie |

---

## 14. Tests / Scanners / Deployment Smoke Summary

| Suite | Assertions | Final state |
|---|---|---|
| 37H validation | 48 | ✅ |
| 37H.2 service boundary | 42 | ✅ |
| 37H.3 display/hydration | 77 | ✅ |
| 38.1 reasoning baseline | 77 | ✅ |
| 38.2 deterministic panel | 66 | ✅ |
| 38.3.1 LLM contract | 140 | ✅ |
| 38.3.2 LLM service | 75 | ✅ |
| 38.3.2b House auth | 52 | ✅ |
| 38.3.3 LLM draft panel | 76 | ✅ |
| 38.4.1 feedback structural | 66 | ✅ |
| 38.4.2 feedback UI | 74 | ✅ |
| **Total** | **793** | **793/793 passing** |

*Note: total reflects unique test files; combined 936 assertions verified at 38.4.2 closure.*

**Dangerous ops scanner:** 0 new critical findings at closure.
**Build:** Clean at all phase closures.
**Production smoke:** Passed for LLM draft route (38.3.2a, 38.3.2b) and feedback UI (38.4.2) on `selinaric-house.vercel.app`.

---

## 15. Authority Boundaries

These boundaries must never be broken by any future phase:

| Boundary | Rule |
|---|---|
| Reasoning output → Memory | **Never.** Reasoning output is not evidence and cannot become Memory. |
| Reasoning output → Held Truth | **Never.** Reasoning output is not Held Truth. |
| Reasoning output → evidence | **Never.** Reasoning artefacts are audit/support material only. |
| Reasoning output → prompt context | **Never.** LLM draft is never injected into Ari/Eli prompts. |
| Feedback → evidence | **Never.** `not_evidence: true` DB-constrained. |
| Feedback → authority movement | **Never.** `authority_changed: false` DB-constrained. |
| `candidate_signal` → candidate creation | **Never.** It is Tara's observation. No write to `graph_candidate_suggestions`. |
| Graph support → Memory | **Never.** Graph structure is relationship context, not archive authority. |
| LLM validation failure → partial display | **Never.** Unsafe output is fully rejected; nothing is shown. |
| Insufficient packet → LLM reasoning | **Never.** `canRunLLMReasoning()` blocks unconditionally. |
| `possible_review_route` → non-null | **Never.** Locked `null` in schema, output validator, and UI. |
| Prior reasoning output → future evidence packet | **Never.** Evidence packet builders use a strict allowlist; reasoning text is excluded. |

---

## 16. What Phase 38 Explicitly Does Not Do

- Does not create Memory
- Does not create Held Truth
- Does not create graph proposals
- Does not create graph candidate suggestions from feedback
- Does not route anything to review
- Does not add approve/promote controls
- Does not change prompt eligibility for any item
- Does not generate reasoning automatically
- Does not persist reasoning drafts as evidence
- Does not store full LLM draft text
- Does not store raw prompt or raw model output
- Does not store raw archive content
- Does not implement feedback analytics
- Does not implement Recall Packet
- Does not alter Memory Review workflow
- Does not alter Held Truth governance

---

## 17. Known Safe States

At Phase 38 closure, the following are confirmed:

| Component | Safe state |
|---|---|
| `llm_reasoning_feedback_events` | 5+ rows, all with `authority_changed:false`, `not_evidence:true`, `prompt_eligible:false`, `review_routed:false`, no draft text |
| `graph_candidate_suggestions` | 3 rows, all `dismissed`, none mutated by Phase 38 |
| `held_truths` | Not touched by any Phase 38 operation |
| `graph_proposals` | Not touched by any Phase 38 operation |
| `archive_memory_events` | Not touched |
| LLM draft route | Auth-protected; unauthenticated → 401 before any Anthropic call |
| Feedback endpoint | Auth-protected; `potential_candidate` rejected; governance flags DB-constrained |
| Deterministic panel | Always visible; always primary; never replaced by LLM panel |
| LLM draft panel | Subordinate; manual only; component state; cleared on refresh |
| Feedback UI | Appears after draft success only; single-select; one submission per draft; regenerate resets |

---

## 18. Risks That Were Mitigated

| Risk | Mitigation applied |
|---|---|
| **Unauthenticated LLM spend** | HMAC HttpOnly cookie auth on LLM draft route and feedback endpoint |
| **Authority leakage via LLM language** | 22 forbidden phrases; post-generation validator; `possible_review_route: null` lock |
| **`candidate_signal` mistaken as candidate creation** | UI label: "Flag for future review"; DB enum excludes `potential_candidate`; `review_routed: false` |
| **Reasoning output becoming evidence** | `not_evidence: true` DB-constrained; excluded from `buildLLMReasoningInput()` allowlist; never in `HydratedGraphCandidateSuggestion` |
| **Recursive evidence contamination** | Future evidence packet builders use strict allowlist; reasoning text explicitly excluded |
| **Stale status reasoning** | `statusChanged` flag; current status passed alongside snapshot; mandatory warning when drifted |
| **Insufficient packet LLM overreach** | `canRunLLMReasoning()` gate; `insufficient_packet` category blocks generation |
| **Prompt injection** | Route accepts only `id`; no client evidence packet; no client prompt; server constructs all context |
| **Draft persistence as evidence** | Component state only; no `localStorage`; no Supabase write from client; cleared on refresh |
| **UI feedback chips becoming action buttons** | No action verbs; no routing; boundary note always visible |

---

## 19. Open Future Risks

| Risk | Status | Recommended mitigation |
|---|---|---|
| **Reasoning audit trail not yet implemented** | Open | 38.5 — see section 20 |
| **`missing_tara_authored` category not yet computed** | Non-blocking | Add `tara_authored` flag to archive source hydration when needed |
| **`draft_hash` deferred** | Non-blocking | Add in 38.5 or later if traceability requires fingerprinting |
| **Feedback note field not yet exposed in UI** | Non-blocking | 38.4.3 / future — note max 500 chars already enforced in endpoint |
| **Stateless HMAC token not server-side invalidatable** | Low risk for private deployment | Rotate `HOUSE_AUTH_SECRET` to invalidate all sessions; full session store deferred |
| **Other House API routes not server-protected** | Accepted for private deployment | Harden if deployment becomes multi-user |
| **LLM `claude-haiku-4-5` model version** | Routine | Model may be updated in future; contract tests ensure output schema is enforced regardless of model |

---

## 20. Recommended Next Phase: 38.5 — Reasoning Audit Trail

**Purpose:** Make reasoning outputs traceable without allowing them to become evidence.

**Core law for 38.5:**
> Audit records trace. Audit does not create truth. Audit does not become evidence. Audit does not move authority.

**Candidate audit fields (to be designed in 38.5.0 alignment, not implemented here):**

```
reasoning_audit_events {
  id
  suggestion_id
  reasoning_type: 'deterministic' | 'llm_assisted'
  packet_fingerprint (optional hash of validated draft — deferred from 38.4.1)
  evidence_source_count
  baseline_evidence_condition
  baseline_packet_sufficient
  llm_model (nullable — only for llm_assisted)
  llm_validation_passed (nullable)
  displayed_to_user
  feedback_event_id (nullable FK → llm_reasoning_feedback_events)
  authority_changed: false (DB constraint)
  not_evidence: true (DB constraint)
  prompt_eligible: false (DB constraint)
  created_at
}
```

**38.5 will not:**
- Store full LLM draft text
- Store prompt content
- Make audit records queryable as evidence
- Feed audit records into future reasoning inputs
- Create Memory, Held Truth, or candidates

---

## 21. Future Memory Direction: Phase 39 — Recall Packet

Phase 38 built explanation. Phase 39 builds recall.

**North star:** Know what kind of remembering you are doing.

**Phase 39 Recall Packet law:**
```
Recall retrieves.
Recall ranks authority.
Recall detects conflict.
Recall instructs response behaviour.
Recall does not invent certainty.
```

Phase 38's evidence layers (archive sources, canonical status snapshots, graph evidence profiles, evidence conditions) form the substrate that a future Recall Packet will use to understand *what kind of memory* is being retrieved and with what authority.

The reasoning layer built in Phase 38 proves the House can explain evidence conditions clearly. The Recall Packet will use that clarity to ensure the right memory is surfaced at the right authority level — and that conflicts between memory sources are surfaced rather than silently resolved.

Phase 39 design begins from Phase 37H + 38 as a stable baseline. It does not begin until the reasoning audit trail (38.5) confirms the explanation layer is traceable.

---

## 22. Closure Verdict

Phase 38 created a governed reasoning layer that explains evidence without creating authority. Every component — the deterministic baseline, the LLM draft route, the auth hardening, the manual draft panel, the feedback table, the feedback endpoint, and the feedback UI — was built, tested, smoked, and closed within its defined boundaries.

The reasoning layer explains. The feedback layer observes. Neither moves truth.

**38.4.3 CLOSED — Phase 38 architecture record created.**
