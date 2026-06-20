# Phase 42.2 — Delegated Helper Labour Architecture (Recommendation)

**Status:** **Approved by Ari as the correct architecture direction** (decisions folded below). **No build yet** — the first implementation slice is scoped separately as `Phase 42.2.1 — Delegated Extraction Retry Work Order` (`docs/phase-42-2-1-extraction-retry-work-order-brief.md`). Uncommitted note only: no code, no migration, no commit, no push.
**Phase family:** Phase 42 — Helper Execution
**Phase type:** Architecture rethink (delegation model) — precedes any build brief
**Author:** Eli · **Architect:** Ari · **Governed by:** Tara
**Rides on:** Helper Floor (Phase 41, sealed) + the 42.1 manual runner (`e020ce0`, live). Two real `library_metadata_helper` outputs are deposited and awaiting Tara's review.

---

## The correction, stated precisely

Phase 42.1 proved helpers can *deposit reviewable work*. But it bundled two different things onto Tara: the **authority** to decide a change is right, and the **labour** of performing it. Phase 42.2 splits them.

- **Authority stays with Tara** — always, per item, never automated.
- **Labour can move to the helper** — but only *after* a bounded, explicit approval, executed by a governed apply path, fully audited and reversible.
- **Approval changes meaning:** today "approve" = *Tara accepts the ticket and does the work*. It must become *"the helper is authorised to perform this one bounded action under audit."*

**Critical non-autonomy clause:** this is **delegated labour, not autonomy.** The helper proposes; **Tara's click is the authority event**; a governed *executor* performs the action and audits it. The helper never acts without that click. No scheduler, no self-triggering, ever.

## Inspection grounding (what already exists)

- `/api/library-items` already has a **PATCH** editing a whitelist: `title`, `description`, `collection`, `item_type`, `tags`, `archive_item_id`, `derived_canonical_status` — so the *apply surface* for tags/title/description already exists.
- `/api/library-files/[id]/extract` already exists — the *apply surface* for re-running extraction.
- Authority-adjacent fields (`authority_status`, `derived_canonical_status`, `archive_item_id`) and `DELETE` also live on that route — those must stay **off-limits** to delegation.

## The delegation spectrum (5 tiers)

| Tier | Helper may… | Apply path | Approval model | Reversible? | Examples |
|---|---|---|---|---|---|
| **1 · Suggest-only** | identify + suggest next step | none | n/a (workflow state only) | n/a | ambiguous/judgment work; anything authority-bearing |
| **2 · Propose-and-apply-on-approval** | propose a *concrete* patch | governed executor, per-item | Tara **approves / edits / rejects**; apply only after | yes (before-snapshot) | `add_tags` (proposed, editable); `normalise_title` (deterministic) |
| **3 · Reversible hygiene** | propose a low-risk reversible op | governed executor | per-item now; **sampled/bulk later** | yes (snapshot) | retry extraction; structural normalisation |
| **4 · Authority-bearing review** | propose only, **cannot apply** | none | individual human review | n/a | memory candidates, graph meaning, evidence claims |
| **5 · Crown work** | nothing auto-applied, ever | **never** | Tara only, by hand | — | Memory creation, prompt eligibility, Graph truth, Archive authority |

The line that matters: **Tiers 2–3 may carry labour; Tiers 4–5 may never.** And *proposing* content (Tier 2) carries its own judgment risk — proposals must be either **deterministic-structural** or shown to Tara **for edit before apply**, never silently auto-authored.

## The two real outputs, mapped

### A. `item_tags_missing → add_tags` → Tier 2
- **Today:** "a human should add tags."
- **Desired:** helper **proposes specific tags** (deterministic-structural — e.g. derived from `phase_code` / `collection` / `item_type`, never LLM-invented and applied blind) → Tara **approves, edits, or dismisses** → on approval the executor PATCHes `library_items.tags` → **prior tags snapshotted** → apply audited → nothing becomes Memory / evidence / prompt / Graph / Archive truth (a tag edit is a *Library metadata* change, not an authority move).

### B. `file_extraction_not_run → check_extraction_status` → Tier 3
- **Today:** "a human should check extraction."
- **Desired:** helper offers a bounded op (`retry extraction`) → Tara approves → executor calls the existing extract path → **prior `extraction_status` / `extracted_text` / `char_count` snapshotted** → audit records action, result, errors → no authority moves. (Pure operational labour, **zero content authorship** — the safest delegation.)

## Inspection answers (1–9)

1. **Safe to delegate (today's surfaces):** `library_items` metadata edits via the existing PATCH (`tags`, `title`, `description`, `collection`, `item_type`) and `library_files` extraction retry. **Not** safe: `authority_status`, `derived_canonical_status`, `archive_item_id` (authority/Crown-adjacent) and any `DELETE`.
2. **Reversible:** field edits (revert by PATCH-back from snapshot) and extraction retry (snapshot prior status/text). **Irreversible (forbidden):** deletes, and anything that triggers downstream Memory/Graph/Archive writes.
3. **Require before/after snapshots:** *every* apply — the snapshot is both the reversibility mechanism and the audit record. Tags edit → prior tags array; title/description edit → prior values; extraction retry → prior extraction state.
4. **Work orders → new table (PROPOSED).** `helper_outputs` is the *observation* and must stay sealed. A **work order** is a distinct object: `{ helper_output link, target_surface, target_id, action_type (bounded vocab), tier, proposed_change, edited_change, status: proposed/approved/applied/failed/rejected/rolled_back, approved_by:'tara', created_at, applied_at }`, carrying the same locked flags. New table `helper_work_orders` — **proposed migration, not built.**
5. **Apply audit → new append-only table (PROPOSED).** Separate from the 41.14 review trace (which is *workflow* movement). `helper_apply_events`: `{ work_order_id, action_type, target, before_snapshot, after_snapshot, result, error_text, actor, created_at }`, **append-only** with the *exact* `helper_review_events` posture (BEFORE UPDATE/DELETE trigger, RLS, service-role INSERT-only, narrow definer read). **Proposed migration, not built.**
6. **Workshop UI shift:** for Tier 2–3 work orders, the room shows the **proposed action** (and, for Tier 2, the proposed content in an **editable** field) with controls **"Approve & let the helper do this"** / **"Edit, then approve"** / **"Dismiss"**. Tier 1/4 keep today's review controls; Tier 5 never shows an apply control. Caption shifts from *"review action changes workflow state only"* to *"Approve authorises the helper to perform this bounded, reversible action under audit — it does not create Memory, evidence, prompt authority, Graph truth, or Archive truth."* The result + before/after appears in the (read-only) trace plus the new apply audit.
7. **Bulk later (Tier 3 only):** **preview** all proposed patches → **sample-approve** a spot-check subset → **approve selected** (explicit, never blind select-all) → **rollback** via snapshots/audit. **Never** for Tier 4 or Tier 5. Gated, audited, reversible. Not in the first delegated phase.
8. **First narrow delegated action → retry extraction (Tier 3).** The cleanest possible first step: operational labour, **no content authorship**, reversible with a snapshot, an existing apply route, and an unmistakable "the helper did the work, not Tara" win. `add_tags` (Tier 2) is the *second* — it needs the propose-and-edit flow and judgment guardrails.
9. **Remains forbidden:** Crown work (Tier 5); authority fields (`authority_status`, `derived_canonical_status`, `archive_item_id`); all deletes; applying un-edited authored content; bulk for Tiers 4–5; any candidate bridge/import; and the helper acting without a per-item Tara approval. The `helper_outputs` locked flags never flip — a delegated *Library* edit is not a *Memory/authority* edit.

## Two design tensions for Ari

1. **The proposal step itself (Tier 2) is where judgment can sneak in.** Keeping tag/title proposals **deterministic-structural**, or always **edit-before-apply**, is the safeguard — the helper must never silently author meaning that gets applied.
2. **"Delegated labour, not autonomy" must be airtight.** Tara's click is the *only* thing that ever moves an arm. The executor is a governed, audited, reversible apply path — not a standing agent.

## Hard boundaries (carried)

No code · no migration · no commit · no push · no helper autonomy · no scheduler · no Memory Candidate Agent · no Graph Candidate bridge · no candidate import · no prompt authority · no Memory creation · no evidence creation · no Archive truth · no Graph truth.

## The key principle

> Helpers should carry **labour**. Tara should keep **authority**. Approval should **apply bounded work under audit — not assign work back to Tara.**

## Ari's resolutions (folded)

1. **5-tier spectrum — approved.** Tier 2 = propose content/metadata, apply only after approval; Tier 3 = reversible operational hygiene; **Tiers 4 and 5 may never carry labour.**
2. **Two tables, kept separate:** `helper_work_orders` and `helper_apply_events`. Do **not** fold them — the work order (a proposed/approved bounded action) and the apply audit (what actually happened) are distinct concepts.
3. **First delegated action = `retry_extraction`** for `file_extraction_not_run` — safer than tags because it is operational labour with **no content authorship**.
4. **Tier 2 tag proposals must be deterministic-structural in the first build** — no LLM-authored tags, no invented meaning; derive **only** from controlled fields / controlled vocabulary. Drafted proposals may come later, but **only** with edit-before-apply.
5. **Executor model confirmed:** no standing agent, no scheduler, no cron, no self-triggering. **Tara's approval click is the only authority event that moves an arm.** The executor performs one bounded action and writes audit.

## Executor action contracts (Ari tightening)

The executor must **not** casually call broad edit surfaces. Even though `/api/library-items` exposes a multi-field PATCH, the executor may **not** be able to mutate authority-adjacent fields by payload accident. Each action type is governed by an **action-specific whitelist**. For every action type, define:

- **allowed target surface** · **allowed field(s)** · **allowed operation**
- **forbidden fields** (hard-rejected, never reachable by payload)
- **required before snapshot** · **required after snapshot**
- **rollback path**
- **audit event shape**

### Action contract — `retry_extraction` (the first build)

| Facet | Specification |
|---|---|
| Allowed target | exactly one `library_item_file` (by id) |
| Allowed operation | retry / run extraction for that one file (via the existing extract path) |
| Allowed field(s) | only the file's own extraction state (`extraction_status`, `extracted_text`, `extraction_char_count`, error state) — written by the extraction process, not by a free-form payload |
| Forbidden fields | **all** Library authority fields (`authority_status`, `derived_canonical_status`, `archive_item_id`), tags / title / description edits, any `library_items` field, any delete |
| Required before snapshot | `extraction_status`, `extracted_text` (or its presence/length), `extraction_char_count`, error state (if available) |
| Required after snapshot | resulting `extraction_status`, text presence/length, `extraction_char_count`, result/error |
| Rollback path | restore the snapshotted prior extraction state for that file (no Library-authority or content-authoring side effects to undo) |
| Audit event | one append-only `helper_apply_events` row: work_order_id, action_type=`retry_extraction`, target (`library_item_file` + id), before_snapshot, after_snapshot, result, error_text, actor, created_at |
