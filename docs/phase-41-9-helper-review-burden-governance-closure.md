# Phase 41.9 — Helper Review Burden Governance — Closure / Architecture Record

**Status:** SEALED (governance closure committed; migration not yet run)
**Phase family:** Phase 41 — Helper Architecture
**Phase:** 41.9 — Helper Review Burden Persistence Schema / Governance
**Commit:** `5121c0b` — "Phase 41.9 helper review burden governance"
**Closure record commit:** `0f81ea7`
**Parent:** `4b1dd63` · **Branch:** `main` · **Pushed:** Yes — `origin/main` (2026-06-14)
**Migration 076 run in Supabase:** Yes — run and verified 2026-06-14 (see §8)
**41.10 started:** No

---

## 1. Purpose

Persist the Phase 41.8 review-burden classification on `helper_outputs` and bring the 41.8 classifier and the 41.9 DB constraints into one strict, consistent governance lane — so review burden can be *stored* (risk, priority, mode, batch eligibility, sampling, escalation) without becoming review execution, batch approval, prompt visibility, or authority movement.

---

## 2. Files Changed (commit `5121c0b`, 6 files)

- `supabase-migrations/076_helper_outputs_review_burden.sql` — additive migration (draft, not run): adds `risk_class`, `review_priority`, `review_mode`, `batch_eligible`, `sample_required`, `escalation_required`, `escalation_reasons` with conservative defaults; CHECK constraints for closed vocabularies, low-risk-only batch eligibility, two-gate-not-batchable, `authority_critical ⇒ two_gate + escalation`, and `escalation_required=false` only for low-risk `no_review_needed`/`batch_review_allowed`; six review-queue indexes.
- `src/lib/helpers/helperReviewScalability.ts` — classifier aligned to the strict lane (medium now escalation-bound).
- `src/lib/helpers/__tests__/helperReviewScalability.test.ts` — added governance locks (medium escalation, low-only non-escalation invariant, library default).
- `src/lib/helpers/helperReviewPresenter.ts` — optional burden fields + read-only `reviewBurdenForDisplay`.
- `src/app/(house)/helpers/page.tsx` — conditional read-only burden line (renders only when present; no controls).
- `src/lib/helpers/__tests__/helperReviewBurdenSchema.test.ts` — migration/constraint/display tests.

---

## 3. Governance Decision — Conditional `escalation_reasons`

`escalation_reasons` is **conditionally** non-empty, not globally non-empty:

- `escalation_required = true` → `escalation_reasons` must be **non-empty** and closed-vocabulary.
- `escalation_required = false` → `escalation_reasons` may be **empty**, but must still be **non-null** and vocabulary-valid.
- Low-risk `no_review_needed` and `batch_review_allowed` rows carry **no artificial escalation language** — an empty array means "there are no escalation reasons because there is no escalation."

A `no_escalation` token was deliberately **rejected**: it would make `escalation_reasons` behave like a status field instead of a reasons field and muddy the semantics. The shape is protected by `NOT NULL`, values by the closed-vocabulary CHECK, and governance by the "non-empty when escalation is required" CHECK.

Aligned classifier rule: `low` may be non-escalated only for `no_review_needed`/`batch_review_allowed`; **`medium` ⇒ `escalation_required=true` + non-empty reasons + `individual_review_required` + `batch_eligible=false`**; `high` and `authority_critical` remain escalation-bound. Medium can no longer drift into a low-risk, non-escalated lane.

---

## 4. Test / Build Status

| Check | Result |
|---|---|
| Helper review scalability | 192/192 pass |
| Helper review burden schema | 105/105 pass |
| Helper review state schema | 66/66 pass |
| Helper review action | 126/126 pass |
| Helper contract | 247/247 pass |
| Helper review surface | 72/72 pass |
| Helper output store | 57/57 pass |
| Library Metadata Helper | 73/73 pass |
| Typecheck (`tsc --noEmit`) | exit 0 |
| Build (`next build`) | exit 0 |

Read-only production probe confirmed `helper_outputs.risk_class` does not exist (076 unrun), while `review_state` exists (075 live).

---

## 5. Not Done (explicit)

- Migration 076 — **now run and verified** in Supabase on 2026-06-14 (see §8). *(Was draft-only at sealing.)*
- Commits `5121c0b` + `0f81ea7` — **now pushed** to `origin/main` (2026-06-14). *(Were local-only at sealing.)*
- No UI controls, review buttons, batch/queue UI.
- No mutation API route; the GET route does not select burden columns yet (burden line renders nothing in v1).
- No classifier wiring into `helperOutputStore` (write path unchanged).
- No review execution, no batch review, no helper execution, no production Library scan.
- No Memory / evidence / prompt visibility / graph / reasoning / recall / Library mutation; no authority movement.
- **41.10 not started.**

---

## 6. Architecture Meaning

Phase 41.9 lets the House **store** how heavy a helper output's review is — and proves the price is honest by making the classifier and the database agree. Review burden is triage metadata, not authority. The House can price the friction and record the price; it cannot yet act on it.

Phase 41 sequence:

> Contract → Ledger → Pure helper → Read-only review surface → Controlled test-owned write path → Review-action contract → Review-state storage → Review scalability contract → Review-burden governance

---

## 7. Stop Condition

Hold the current state. Do not start 41.10 without a separate approved brief. (Migration 076 has since been authorised, run, and verified — see §8.)

---

## 8. Migration 076 — Execution & Verification (2026-06-14)

Migration 076 was authorised separately from the source-control sealing, run once in the Supabase SQL Editor (`Success. No rows returned.`), and verified read-only.

**Pre-checks:**
- Safety export — `node scripts/emergency-house-export.mjs` exit 0 (8158/8158 rows, no writes, no deletes).
- Dangerous-ops scan — 0 new critical.
- `helper_outputs.risk_class` absent pre-run (076 unrun); `review_state` present (075 live); 4 rows total, all soft-deleted (0 active).

**Post-checks (read-only):**

| # | Check | Result |
|---|---|---|
| 1 | 7 burden columns + defaults | ✅ present (`authority_critical` / `normal` / `two_gate_review_required` / `false` / `false` / `true` / `['human_judgement_required']`) |
| 2 | 9 `ho_` constraints | ✅ 9/9 present (direct catalog query) |
| 3 | 6 indexes | ✅ 6/6 present (direct catalog query) |
| 4 | existing rows defaulted conservatively; none batchable | ✅ all rows `authority_critical` / two-gate / escalation-required; `batch_eligible=true` count = 0 |
| 5 | authority invariants intact | ✅ 0 violations |
| 6 | active helper output count | ✅ 0 (all rows soft-deleted) |

No negative-validation inserts were run. No code change, no commit, no push, no review execution, no authority movement accompanied the run. **41.10 not started.**

**Net:** the burden schema is live and conservatively populated; existing (soft-deleted) rows carry the safe `authority_critical` posture; nothing is batchable; the authority invariants from 074/075 remain intact.

---

**41.9 SEALED & APPLIED — the burden is priced, the price is honest, the schema is live and conservative; the crown stays with Tara.**
