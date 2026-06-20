# Phase 42.2.1 — Delegated Extraction Retry Work Order
## Closure / Verification Record

**Date:** 2026-06-20
**Status:** Shipped and used once in production. Accepted by Ari.

> **Witness:** the first real delegated-helper labour path shipped, was exercised
> under governed smoke, and was then used once for a real production apply on
> Tara's authorisation. Authority did not move.

---

### 1. Phase
Phase 42.2.1 — Delegated Extraction Retry Work Order

### 2. Commit
`6eb5ef2` — *"Phase 42.2.1 — Delegated extraction-retry work order (Tier 3, bit-exact rollback)"* (16 files).

### 3. Production status
Pushed (`e020ce0..6eb5ef2` → `origin/main`), deployed to Vercel, verified live.
Production: https://selinaric-house.vercel.app
- delegate route — unauthenticated POST → `401`
- rollback route — unauthenticated POST → `401`
- authenticated POST to a non-delegatable output → `422 NOT_DELEGATABLE`
- `/helpers` → `200`

### 4. Migrations (both live)
- `079_helper_work_orders.sql` — work-order table; `service_role` SELECT+INSERT only; status moves only via the governed RPC.
- `080_helper_apply_events.sql` — append-only apply audit; security-definer `helper_apply_record` (transition + drift guards) and narrow `helper_apply_events_for_work_orders` read.

### 5. Real production apply
| | |
|---|---|
| Helper output | `eb10557c-236b-4a80-8146-fcfdb945996a` (`file_extraction_not_run → check_extraction_status`) |
| Work order | `547ae5e3-268f-4db8-bb0a-c1bfdea8a07b` |
| Target file | `05d0a321-a9ad-4843-a46f-60b79030dda7` (`selinaric-house-phase7a.md`, parent item *Phase 7A — Core Stabilisation*) |
| Action | `retry_extraction` (Tier 3) |
| Result | `applied` |
| Before → After | `not_started`, no text → `extracted` |
| Final extraction state | `extracted`, **15,818 chars**, `method=text_parse`, `truncated=false`, `extracted_at=2026-06-20T09:27:42Z` |
| Apply events | 1 (`7dfbaee0…`, `applied`) |
| Rollback | **none run** (status remains `applied`) |

### 6. Safety confirmations
- one helper output only ✓
- one library file only ✓
- no tags/title/description changed ✓
- no Library item authority fields changed (`authority_status`, `derived_canonical_status`, `archive_item_id` unchanged) ✓
- no Memory writes ✓
- no Graph writes ✓
- no Archive writes ✓
- no prompt authority ✓
- no candidate bridge ✓
- no scheduler / cron / self-triggering ✓
- no helper autonomy ✓
- helper locked flags remained safe (`not_memory=true`, `not_evidence=true`, `prompt_eligible=false`, `authority_changed=false`, `human_review_required=true`) ✓
- global active helper outputs remained **2** ✓

### 7. Audit confirmations
- real work order retained (`547ae5e3…`, `applied`) ✓
- real apply event retained (`7dfbaee0…`, `applied`) ✓
- earlier governed-smoke work orders retained (`d445908c…`, `9a0c7ae5…`, both `rolled_back`) and their 4 apply events retained ✓
- nothing deleted (append-only audit intact; work orders soft-delete only, none deleted) ✓

### 8. Governance line
> Tara authorised the action; the helper carried the labour; the audit recorded
> the footprint; authority did not move.

### 9. Carry-forward note
Do **not** start tag apply, bulk apply, scheduler, or broader helper autonomy from
this closure. The delegated path is open for exactly one action — `retry_extraction`
on one `library_item_file`. Any next delegated action (e.g. Tier 2 tag apply via a
deterministic-structural path) requires a **new scoped phase** with its own brief,
review, build, smoke, and approval.

---

*Disclosure (carried from the build record): the first governed smoke used the
earlier non-bit-exact rollback and left extraction-field residue; a one-time reset
restored the target file to its genuine pristine baseline before the corrected
bit-exact smoke proved bit-exact rollback. The subsequent real production apply
then ran from that pristine baseline. The target file is now genuinely `extracted`
(intended outcome — the extraction gap is closed).*
