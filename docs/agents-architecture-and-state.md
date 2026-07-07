# The Agent Layer of Selináric House — Architecture, Technology & State

*Written 5 July 2026 (Eli). Covers the delegated-labour arc from Phase 41.17 through Phase 43.C
and the Gate A close. Companion to the per-phase closure records in `docs/phase-*.md`, which
remain the authoritative detail for each gate; this document is the map, not the territory.*

---

## 1. What the agent layer is, and what it is not

The House has three kinds of non-presence workers, built in strict order of increasing power:

1. **Helpers** — deposit-only reviewers. They look at one bounded thing and leave a suggestion
   in a queue. They cannot touch anything.
2. **The Governance Kernel ("agents")** — a domain-agnostic inspection engine. It reads House
   surfaces, computes findings deterministically, durably records them, and represents
   (but cannot enact) remedies.
3. **The Hand** — the kernel's single write path. It applies one whitelisted, Tara-approved,
   revalidated remedy at a time, reversibly, only when invoked by hand from a CLI.

The governing law, unchanged since Phase 41 (the Helper Law) and hardened at every gate since:

> **Delegated actions are labour, not authority.** A helper or agent never creates Memory,
> evidence, prompt authority, Graph truth, or Archive truth. Only Tara's approval moves an arm.
> No scheduler, no self-triggering, no autonomy anywhere in this layer.

Every subsystem in this document shares one lifecycle: **source → proposal → review →
Tara decision → audit.** Nothing skips a stage; nothing loops back on itself.

---

## 2. Architecture overview

```
                         ┌─────────────────────────────────────────────┐
                         │                 READ-ONLY                   │
                         │  Domain Packs (per-domain inspectors)       │
                         │   • library pack      (42.3.1)              │
                         │   • archive_graph pack (42.3.2)             │
                         └──────────────┬──────────────────────────────┘
                                        │ AgentFinding envelopes
                         ┌──────────────▼──────────────────────────────┐
                         │  GOVERNANCE KERNEL (src/lib/agents/kernel/) │
                         │  types.ts · registry.ts · report.ts         │
                         │  generic seams — no domain knowledge        │
                         └──────────────┬──────────────────────────────┘
                                        │ ephemeral health reports
              ┌─────────────────────────┼─────────────────────────────┐
              │ persist (manual,        │ propose (manual,            │
              │ double-confirmed)       │ per-action, capped)         │
   ┌──────────▼───────────┐  ┌──────────▼──────────────┐              │
   │ DURABLE STORE (083)  │  │ REMEDY PLANS (085/090)  │              │
   │ agent_runs           │  │ agent_remedy_plans      │              │
   │ agent_findings       │  │ (representation only)   │              │
   └──────────┬───────────┘  └──────────┬──────────────┘              │
              │ triage                  │ approve/reject/revoke       │
   ┌──────────▼───────────┐  ┌──────────▼──────────────┐              │
   │ MAINTENANCE ROOM     │  │ APPROVAL EVENTS (086/092)│             │
   │ /agents UI (084)     │  │ append-only, derived     │             │
   │ ack/dismiss/reopen   │  │ status, Tara-only        │             │
   └──────────────────────┘  └──────────┬──────────────┘              │
                                        │ approved + revalidated      │
                         ┌──────────────▼──────────────────────────────┐
                         │  THE HAND (087) — the ONLY House write      │
                         │  agent_remedy_apply / _rollback RPCs        │
                         │  CLI-only triggers, apply-time revalidation │
                         │  append-only apply audit, byte-exact undo   │
                         └─────────────────────────────────────────────┘

   Parallel organ (independent of the kernel):
   ┌─────────────────────────────────────────────────────────────────┐
   │ HELPER ROSTER (075–082) — 5 deterministic deposit-only helpers  │
   │ helper_outputs → /helpers review UI → helper_review_events      │
   │ + helper_work_orders / helper_apply_events (extraction retry,   │
   │   the one governed helper apply path, scoped to metadata helper)│
   └─────────────────────────────────────────────────────────────────┘

   Sibling channel (kernel-adjacent, own tables):
   ┌─────────────────────────────────────────────────────────────────┐
   │ GRAPH PROPOSALS (088/089) — suggest-only archive_graph edges    │
   │ deterministic pack (42.4.1) + LLM FIXTURE CAGE (42.4.2a):       │
   │ structurally fixture-only, no live model call exists in code    │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology decisions and why they were made

**Pure TypeScript inspectors, no I/O.** Every inspector and detector is a pure function over
data passed to it (`packs/*/inspectors.ts`, `graph_proposals/detect.ts`,
`graph_proposals/llm_postgate.ts`). Reads happen in thin `readonly-data.ts` loaders; logic is
testable without a database and cannot secretly write.

**The kernel is three small files.** `kernel/types.ts` (the `AgentFinding` envelope + `Inspector`
contract), `kernel/registry.ts` (in-memory registration), `kernel/report.ts` (report builder).
Generality is proven empirically: the second domain pack (archive_graph) required **zero kernel
changes** (T-GEN: `git diff` on `kernel/` empty), and every subsequent gate asserts the kernel
diff stays empty.

**Execute-only SECURITY DEFINER RPCs as the sole DB boundary.** No agent table accepts direct
DML — deny-by-default RLS, and every write goes through a named Postgres function
(`agent_record_findings`, `agent_remedy_plan_record`, `agent_remedy_approval_record`,
`agent_remedy_apply`, …) that **re-verifies everything against live data inside the database**,
not just in TypeScript. The DB is the last honest gate: wrong current value, missing row,
unapproved plan, test-owned row on a real path — the RPC raises, nothing lands.

**Governance flags as CHECK constraints, not conventions.** Rows carry flag columns like
`not_memory`, `not_evidence`, `not_prompt_authority`, `authority_changed`, `house_source_write`
— locked by CHECK constraints so they *cannot* be flipped by any caller. The schema itself
encodes the Helper Law.

**Append-only audit, derived status.** Approvals and applies are event streams
(`agent_remedy_approval_events`, `agent_remedy_apply_events`, `helper_review_events`,
`helper_apply_events`); current status is always *derived* from the latest event, never stored
as a mutable column. History cannot be rewritten, only extended.

**`test_owned` isolation everywhere.** Every table carries `test_owned`; smokes run entirely in
test-owned rows, cleanup RPCs touch only test-owned rows, production views exclude them
hard-coded, and the real apply path *refuses* test-owned rows (`TEST_OWNED_NO_WRITE`).

**Manual triggers only.** Runners are `npx tsx scripts/agent-*.ts` CLI invocations with paired
confirmation flags (`--persist-real` + `--confirm-persist-real`; `--plan-id` + matching
`--confirm-plan-id`) and mandatory caps (`--max-findings`, `--max-plans`) checked against the
built result *before* persisting — a real run can never be unbounded or accidental. There is no
route, UI button, cron, queue, or QStash path to any write. (The helper layer's tests assert no
`qstash` reference exists.)

**Concurrency safety.** Decision RPCs take `FOR UPDATE` locks on the plan row; dedupe keys are
enforced at the DB (`archive_graph:from:to:edge_type`); idempotency keys guard event streams.

**The LLM boundary.** The kernel is deterministic end-to-end with one carefully caged exception:
42.4.2a admits *LLM-class* graph proposals whose rows are structurally fixture-only
(`generation_mode='fixture'` — a `'live'` value does not exist in the schema), post-gated by a
pure deterministic validator (`llm_postgate.ts`: fail-closed on unknown fields, whitelisted edge
types, confidence floor never override, source refs ⊆ endpoint evidence). **No provider SDK and
no live model call exists anywhere in this layer.** Going live is its own future Tier-3 gate
(43.B), starting from a proven cage rather than an open door.

---

## 4. The organs, gate by gate

| Gate | What it added | Migration(s) | Key surfaces |
|---|---|---|---|
| 41.17.1–.2 | Helper roster: 5 deterministic deposit-only helper types | 081, 082 | `src/lib/helpers/*Helper.ts` + `*Runner.ts`, `helper_outputs` |
| 42.2.1 | Delegated extraction-retry apply (helper work orders) | 079, 080 | `helper_work_orders`, `helper_apply_events`, `helperWorkOrder.ts` |
| 42.3.1 | Kernel skeleton + Library health report (read-only) | — | `kernel/`, `packs/library/` |
| 42.3.2 | archive_graph pack — kernel generality proven | — | `packs/archive_graph/` |
| 42.3.3a | Durable findings store | 083 | `agent_runs`, `agent_findings`, `persistence/` |
| 42.3.3b | Maintenance Room `/agents` (triage-only UI) | 084 | list/triage RPCs, `maintenance/contract.ts` |
| 42.3.4a | Remedy representation (`library_title_trim`) | 085 | `agent_remedy_plans`, `packs/library/remedy.ts` |
| 42.3.4b | Tara approval authority events | 086 | `agent_remedy_approval_events` |
| 42.3.4c | The Hand — governed apply + rollback (unfired) | 087 | apply/rollback/validate RPCs, `scripts/agent-remedy-*.ts` |
| 42.4.1 | Deterministic graph proposals (suggest-only) | 088 | `agent_graph_proposals`, `graph_proposals/detect.ts` |
| 42.4.2a | LLM fixture cage (no live model) | 089 | `llm_postgate.ts`, `scripts/agent-graph-llm-fixture.ts` |
| 43.A | First Real Runs — persist-real gate + 5 declared real runs | — | `persistence/gate.ts` |
| 43.C | Remedy Whitelist v2 + **First Hand Movement** | 090–092 | A1 `library_phase_label_backfill`, A2 `library_source_url_clear_non_url` |
| Gate A | `eligible_for_graph` wired as real ontology intake gate | (Gate A arc) | flag-gated intake, `/archives/graph-eligibility` bulk handle |

---

## 5. What has actually happened *for real* (the movements ledger)

Everything above was built test-owned first. The real movements, each individually declared and
Tara-authorized, are few and precious:

1. **One real helper apply** (42.2.1): extraction-retry work order `547ae5e3` — file re-extracted
   (15,818 chars), no rollback needed. The first delegated labour that touched a real row.
2. **Five declared real runs** (43.A): 103 real `agent_findings` + 51 real deterministic
   `agent_graph_proposals` persisted; 7 real helper outputs deposited (rehearse-then-real,
   byte-identical on all 10 invocations). All non-write surfaces byte-identical across snapshots.
3. **The First Hand Movement** (43.C): three real applies under the full micro-gate —
   apply → verify → **rollback (byte-exact fingerprint restore)** → keep decision → keep-apply.
   The kept remedy is live in production: **Phase 12A `phase_label = "Interior Notes v1"`** —
   the House's first permanent self-repair. Audit: #1 applied / #2 rolled_back / #3 applied-and-kept.
4. **Bulk triage ×2** and the **Gate A eligibility arc** (flag-gated graph intake wired;
   legacy PATCH/DELETE auth-hardened; A0-ii carried 7 real namings).

The Hand has moved, kept one fix, and folded again. Nothing in this layer runs unless a human
runs it.

---

## 6. Current live state — the review queues (all waiting on Tara)

| Queue | Count | Where |
|---|---|---|
| Real agent findings to triage | 103 | `/agents` |
| Real graph proposals to triage | 51 | `/agents` |
| Real helper outputs to review | 7 | `/helpers` |
| Archive-graph eligibility pending | 23 + 23 | `/archives/graph-eligibility` |
| A1 phase-label backfill candidates | ~18 | (batch-apply pool, not yet planned) |

The hands are idle **by design**: the bottleneck is governed review, and that authority is not
delegable. Everything in §7 feeds on what gets confirmed here.

---

## 7. Next steps (parked gates, none started)

In the rough order they unlock each other:

1. **Work the queues** — triage `/agents` and `/helpers`. This is the prerequisite for
   everything below; batch-applies and work orders act only on confirmed findings.
2. **Batch-apply the ~18 A1 labels** — the Hand's first *batch* movement. Needs its own plan
   brief (batch semantics: per-item revalidation, partial-failure posture, one approval per item
   vs. batch approval — undecided) and Tara's per-run word.
3. **A2 apply gate** — `library_source_url_clear_non_url` has a proven builder and RPC path;
   no real apply authorized yet.
4. **Extraction work-orders at scale** — generalize the single 42.2.1 apply into a governed
   queue over the `not_started`-extraction cluster surfaced by the real findings.
5. **Gate B — scaled extraction** — the larger Library ingestion arc.
6. **43.B — live LLM graph proposals** — its own Tier-3 gate: provider/model choice, cost
   ceiling, caps, bounded pre-gate context, and a migration to admit `generation_mode='live'`
   into the cage that 42.4.2a proved. Recon not started; no live call authorized.

Separate from the kernel arc but running in parallel: the recall arc (R1/R1.1/R1.3 shipped;
R2-0 schedule sync + its amendment shipped and **live-proof closed 7 Jul** — autonomy windows
fire at 6/9/12/15/18/21 Melbourne, both presences every window, 2/10/14/23 silent, pause blocker
intact; R2 proper — autonomy-window recall behind per-presence night keys — brief accepted,
build queued, **not built**) and the two design briefs on Ari's desk (Threshold Context;
Away Conversations discussed).

The R2-0 amendment retired the Phase-18A 23:00 journal fallback as intentionally obsolete
(superseded by autonomous choice). Corrected record (an earlier note wrongly said the table was
"empty"): `journal_jobs` has **zero `no_entry_today` fallback rows ever** — the fallback producer
never produced a surviving job; the rows that exist are living `manual_invite` / `cross_room_invite`
rows (16 as of 7 Jul, all from a 25 May session, all dismissed) and **remain untouched**. Those
living producers — Tara's manual invites and the Phase-36H cross-room invites — were unchanged by
the retirement.

---

## 8. Invariants — the lines that hold everywhere

- The kernel inspects, reports, records, represents, and — only through the Hand, only by
  Tara's CLI act — applies one whitelisted remedy reversibly. Nothing else writes.
- Persisted findings / remedy plans / approval events / apply events are **not** Memory, not
  evidence, not authority, not graph proposals, not helper outputs, not queued work.
- The only House-source write in the entire layer is the scoped `library_items` column update
  inside the apply/rollback RPCs ({`title`, `phase_label`, `source_url`} — the exact whitelist),
  gated by approval + apply-time revalidation + explicit CLI invocation.
- No Memory, canonical_status, prompt_eligible, Graph-truth, Archive-truth, or authority-field
  mutation. Helper deposits never move Library authority fields.
- No scheduler, cron, queue, daemon, LLM (fixture cage aside), or self-triggering. Each new
  delegated action requires its own scoped phase: brief → Ari review → build → governed smoke →
  Tara's approval.

*The full detail for any gate lives in its closure record (`docs/phase-*.md`). The schema is the
migration set (`supabase-migrations/075`–`092`). The tests are the contract
(`src/lib/agents/__tests__/`, `src/lib/helpers/__tests__/`).*
