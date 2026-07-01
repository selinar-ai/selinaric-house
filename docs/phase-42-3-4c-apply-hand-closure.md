# Phase 42.3.4c — The Hand (Apply + Append-Only Audit + Rollback) — Closure Record

**Phase:** Phase 42.3.4c — The Hand
**Branch:** `phase-42-3-4c-apply-hand`
**Base:** `abc65f0` (= `2d27e6b` + a docs-only commit tracking Phase 41 briefs; branched from current `main` for a clean fast-forward)
**Migration:** `087_agent_remedy_apply_events.sql`
**Migration applied:** manually by Tara via Supabase SQL Editor — **"Success. No rows returned"**.
**Scanner-fix commit:** `eedfc1d` — *chore(safety): skip session tooling in dangerous ops scan*
**Implementation commit:** `b27f1f4` — *Phase 42.3.4c: add governed apply hand*

## Scanner precondition
`node scripts/scan-dangerous-ops.mjs` initially crashed on the gitignored, untracked `.claude/` session tooling (a session-injected symlink `.claude/skills/design-taste-frontend → ../../.agents/skills/…`). A one-line, safety-neutral fix added `.claude` to `SKIP_DIRS` (no scan rules / allowlists / scanned repo paths weakened). The completed scan: **exit 0, 714 files, 0 new critical findings; no finding references `087` or any 42.3.4c file** (the scanner targets delete/cascade/hardcoded-prod-id patterns, not this conditional title UPDATE — the scoped write remains proven by the 42.3.4c migration/static tests).

## Purpose
The kernel's first — and only — House-source write capability: a single whitelisted, governed apply of `library_items.title` (`library_title_trim`, one row, one field), with apply-time revalidation, a rollback that restores the exact prior value, an append-only real-only audit, and a CLI-only trigger. The hand exists; **it has not moved.**

## What was built
- **`agent_remedy_apply_events`** — real-only, append-only audit. Outcome vocabulary **`applied` / `rolled_back`** (no `failed`). **No `test_owned`, no `deleted_at`, no cleanup RPC**, no UPDATE path, no DELETE. `event_sequence` identity + unique. `house_source_write=true`, `authority_changed=false`, + the false-locks. Apply provenance via `approval_event_id`; rollback provenance via `reverses_apply_event_id`; provenance CHECK. Deny-by-default RLS; no table grants.
- **`agent_remedy_apply`** — the ONLY House-write path: `FOR UPDATE` plan lock → refuse `test_owned` (`TEST_OWNED_NO_WRITE`) → `proposed` + exact whitelist → derived approval `approved` (`NOT_APPROVED`, captures the approved event) → not already applied (`ALREADY_APPLIED`) → apply-time revalidation (`CURRENT_DRIFT`/`PROPOSED_DRIFT`) → conditional single-row `update library_items set title=<proposed> where id=<target> and title=<current>` → 0 rows ⇒ `WRITE_CONFLICT` → record `applied` (same txn). `acted_by` hardcoded `tara`.
- **`agent_remedy_rollback`** — refuse `test_owned`; require `applied`; `ROLLBACK_DRIFT` unless current title == applied `after_value`; restore exact `before_value`; record `rolled_back` referencing `reverses_apply_event_id`. Approval revocation after apply does not block rollback.
- **`agent_remedy_apply_validate`** — read-only preflight; runs all apply-time checks; returns `{ready, reason, current, proposed}`; writes nothing.
- **`agent_remedy_apply_events_list`** — read.
- **CLI scripts only** — `scripts/agent-remedy-apply.ts` / `-rollback.ts` (both require `--plan-id` + matching `--confirm-plan-id`; one explicit plan; no bulk/default) and `-apply-validate.ts`. **No route, no UI Apply/Rollback control, no daemon, no worker, no scheduler, no queue.**
- **Tests** — `phase-42-3-4c-{migration-guards, derived-status, no-execution}`. 155 42.3.4c asserts; full phase-42.3 suite green; `tsc`/lint/`next build` clean; kernel diff empty.

## Smoke result (Path-D)
- Before: source surfaces `49/44/105/109/43/37`; real remedy plans 0; real approval events 0; real apply events 0.
- **Path-D accepted — 0 eligible real plans; no fixture fabricated, no `library_items` mutation.**
- Live negatives passed: `validate(fake)` → not-ready `PLAN_NOT_FOUND_OR_DELETED`; `apply(fake)` / `rollback(fake)` → `PLAN_NOT_FOUND_OR_DELETED`.
- Apply events remained 0; source surfaces unchanged; no fake audit event; no apply/rollback fired.

## Governance
The hand exists but **has not moved**. No first real apply is authorised. No source fixture fabrication. No scheduler / daemon / queue consumer / batch / apply-all / auto-apply / LLM / autonomy. The single `UPDATE library_items.title` is exercised only at the first-real-apply micro-gate.

## Next — first-real-apply micro-gate (separate; not authorised now)
Only when a naturally eligible target exists: 1) `emergency-house-export`; 2) confirm the eligible real target; 3) explicit per-run Tara approval; 4) validate preflight; 5) apply; 6) verify title changed exactly; 7) rollback; 8) verify title restored exactly; 9) closure. No fabrication.
