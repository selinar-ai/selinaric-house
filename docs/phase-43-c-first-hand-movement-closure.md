# Phase 43.C — Remedy Whitelist v2 / The First Hand Movement — Closure Record

**Status:** CLOSED · shipped 4 Jul 2026 (NZT)
**Implementation commit:** `12a7b8a` (branch `phase-43-c`)
**Migrations:** `090` + `091` + `092` — all applied by Tara ("Success. No rows returned"; 090 first-run
and 092 first-run each failed closed and were patched retry-safe — see Honest Record below)

## What shipped

**Whitelist v2** — the Hand's actions, chosen from the 103 real findings by the accepted 43.C recon
(batch of TWO, data-sized; padding refused):

- **A1 `library_phase_label_backfill`** — backfills `library_items.phase_label` from the strict
  development_documentation title convention: prefix `Phase ` + everything after the FIRST em-dash,
  space-trimmed. Deliberately regex-free so the TS and SQL rules are byte-identical. Eligible only
  when collection matches, phase_code AND phase_number are present, and the label is null/blank.
  Observed-title provenance is ENFORCED: the plan's deterministic_reason must contain the live title
  (`REASON_MISSING_OBSERVED_TITLE`). ~19 eligible targets at ship time.
- **A2 `library_source_url_clear_non_url`** — clears a source_url that is not a valid http/https URL
  to SQL NULL (represented as JSON null in plans/snapshots). CLEAR only, per Ari — the displaced text
  is preserved byte-exactly as the recorded inverse and in the apply audit. One JS definition of
  "malformed" (the source-reference helper's exported `isValidHttpUrl`); the SQL twin is
  parity-locked by shared test vectors, with both divergence classes proven fail-closed.
- **Retry-extraction stayed in the helper work-order organ** (boundary, accepted verbatim: the Hand
  computes and writes VALUES with byte-exact inverses; work-orders re-run PROCESSES; an action lives
  in exactly one organ).

**All FIVE plan-value-reading RPCs** now dispatch class-aware (the lesson of this gate): record (091),
approval (092), validate/apply/rollback (090). Static per-action branches only; no dynamic SQL; the
writable columns are exactly `{title, phase_label, source_url}` on `library_items`; no authority
field is reachable. Manual CLI proposer (`scripts/agent-remedy-propose.ts`) with mandatory
`--max-plans` for real runs — refuses rather than truncates.

## The path-real smoke (accepted)

13 DB-boundary negatives rejected with exact codes (including the natural hyphen-title and
observed-title-provenance cases). **3 real plans** recorded exactly as declared: A1 `e6682de2`
(Phase 12A → "Interior Notes v1"), A1 `933df865` (Phase 13 → "Living State"), A2 `e914b299`
(source_url clear; JSON-null proposed verified in the UI by Tara). **One approval event** —
`#1 approved, decided_by='tara'`, class-aware snapshot (JSON-null current / string proposed).
Apply events during smoke: 0.

## The first Hand movement (micro-gate, accepted) + the keep

Emergency export (`scripts/exports/house-export-2026-07-03T08-58-58.json`, 16.5 MB, 24 tables) →
read-only validate READY → **Tara's explicit per-run word** → apply → verify → rollback →
verify-restored → **keep decision (Ari)** → re-validate READY → keep-apply.

**The final audit, three lines, forever:**

| Event | Outcome | Value |
|---|---|---|
| `#1` | `applied` | null → "Interior Notes v1" |
| `#2` | `rolled_back` (reverses `#1`) | "Interior Notes v1" → null · fingerprint restored byte-exactly to `e9fd405b4afcdfbe` |
| `#3` | **`applied` — KEPT** | null → **"Interior Notes v1"** |

Determinism proof: the kept fingerprint `fe3f8c3403cff44a` is byte-identical to apply `#1`'s —
the same single change produces the same house-wide hash, so exactly one row and one field changed.
Title, phase_code, phase_number, source_url untouched throughout. **The kept remedy: the Phase 12A
document now carries `phase_label = "Interior Notes v1"` — the House's first permanent self-repair,
performed by its own governed hand under Tara's word.**

## Honest record (the halts that made it stronger)

1. **090 first apply:** 42P13 (list-RPC return shape) → clean single-batch rollback → drop-function-first patch.
2. **091:** PostgREST cannot express jsonb `'null'` — SQL NULL slipped `<> 'null'` guards and died at
   NOT NULL. Fail-closed; patched by normalising SQL NULL → JSON null at RPC entry.
3. **092 first apply:** 42P13 flavor #2 — parameter DEFAULTS also bind; drop-first + default-preserving
   recreation. Approval was also the missed fifth RPC (title-era drift logic refused Tara's first
   Approve click with a 400 — correctly, wrongly).

Lessons now standing test rules: null-argument negatives at the PostgREST boundary; five-RPC
accounting; 42P13 = return shapes AND parameter defaults.

## Not done, not started (explicitly)

No Phase 13 apply · no A2 apply · no batch apply · no extra approvals/plans · no Memory / graph-truth /
prompt / authority mutation · no live LLM / provider SDK · no scheduler / daemon / queue / autonomy ·
**43.B not started** · **extraction work-order authorisation not started**.

## Next possible gates (each its own authorisation)

Batch-apply planning for the remaining ~18 A1 labels · the A2 decision/apply gate · extraction
work-order authorisation (helper organ) · 43.B live-LLM recon.
