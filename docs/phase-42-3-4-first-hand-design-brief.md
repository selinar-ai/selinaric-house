# Phase 42.3.4 — The First Hand (Governed Remedy Threshold)
## Constitution-level Design Brief — the kernel's first action on the House

**Status:** Constitution-level design brief — **no code, no migration, no recon, no DB.** Tier 3 (maximal cadence).
**Phase family:** Phase 42 — Governed Helper Labour
**Parent:** Phase 42.3.0 (kernel constitution). Builds on 42.3.1/42.3.2 (read-only packs), 42.3.3a (durable findings store), 42.3.3b (Maintenance Room review/triage — live, `main@a7446b0`).
**Author:** Eli (systems & reliability)

> Until now: the kernel may inspect, report, durably record, and let Tara review/triage. **42.3.4 is the line it has never crossed — it lets the kernel *act* on the House.** That is why this brief is constitution-level: crossing it changes what the kernel *is*.

---

## 0. The one-sentence scope

Give the kernel **one** bounded, deterministic, reversible, whitelisted remedy — applied **only** after Tara explicitly approves a specific proposed fix for a specific finding — with an append-only apply audit and a proven rollback. **Nothing else.**

## 1. First principles (unchanged, and load-bearing here)

- **Authority stays with Tara.** A hand is *labour*, never authority. The kernel proposes; Tara decides; the hand executes only what Tara approved. No self-authorisation, ever.
- **A hand never creates truth.** No Memory, no evidence, no Graph truth, no Archive truth, no prompt eligibility, no canonical-status movement, no Library authority-field movement (`authority_status`, `derived_canonical_status`, `archive_item_id`). (Same deny-list the helper layer already honours.)
- **Reversible or it doesn't ship.** The first hand must be undoable by a recorded inverse. If we can't cleanly reverse it, it is not the first hand.
- **No scheduler, no autonomy, no LLM in the act path.** Every apply is human-initiated, one at a time. (Pulse remains the only scheduler; the agent layer never touches it.)
- **Precedent, not invention.** The House already has a proven hand — Phase 42.2.1 shipped one real, scoped, reversible, audited apply (Library extraction-retry, whitelisted to a single helper). 42.3.4 brings *that exact discipline* into the kernel/agent layer. We are generalising a proven pattern, not opening a new risk class blindly.

## 2. Why this is split (and what the first hand is NOT)

Hands is not one step. Like 42.3.3 split into a/b, 42.3.4 splits into three gated sub-phases. **This brief authorises only the design conversation and, if approved, sub-phase (a) — which contains NO execution.**

- **42.3.4a — Remedy representation (NO hands).** A finding can carry a *proposed remedy plan*: a deterministic, declarative description of a single whitelisted change + its recorded inverse. Built, stored, displayed read-only. Nothing is ever applied. This is the safe first build.
- **42.3.4b — Approval surface (the real gate).** Tara reviews a proposed remedy in the Maintenance Room and **approves or rejects** it. Approval is an authority event (Tara-only, audited). Still nothing executes — approval just marks a plan as *authorised-to-apply*.
- **42.3.4c — The apply worker + audit (the actual hand).** A human-initiated worker applies **one** approved remedy, writes an append-only apply record, and supports the recorded inverse (rollback). This is the first time the kernel writes to a House surface — and it is the most-reviewed code in the system.

Each sub-phase is its own full Tier-3 loop: brief → Ari → recon → build → high-evidence smoke → **separate explicit Tara approval before any live action** → bundled ship-it.

## 3. Choosing the first whitelisted action (the crux)

The first hand should be almost boring — the lowest-stakes, most-reversible fix in the catalogue. Selection criteria (all must hold):

1. **Deterministic** — the remedy is fully computable from existing data; no judgement, no LLM, no inference.
2. **Single-surface, single-row** — touches one row of one non-authority House table.
3. **Reversible by recorded inverse** — we store the prior value; rollback restores it exactly.
4. **Not authority / not truth** — never moves an authority field, never creates Memory/evidence/Graph/Archive/prompt/canonical state.
5. **Already detected today** — it must correspond to an existing finding type the read-only packs already produce, so there's a real, reviewed finding to attach the remedy to.

**Candidate (for discussion, not decided):** a deterministic Library *metadata* normalisation that one of the shipped 41.17 deposit-only helpers already detects (e.g., a missing-but-derivable display/label field) — non-authority, single-row, trivially reversible. Ari to confirm or substitute. The point of the brief is to *agree the bar*, then pick the one action that most safely clears it.

**Explicitly NOT first-hand candidates:** anything touching `authority_status` / `derived_canonical_status` / `archive_item_id`; anything multi-row or cascading; anything on a Category-A protected table; anything requiring inference; archive_graph edge/node mutation; deletes of any kind.

## 4. Hard boundaries for the whole 42.3.4 arc

- One action type only; one row per apply; one apply per explicit Tara approval.
- No batch apply, no "apply all", no auto-apply, no scheduled apply, no retrying loop.
- Apply path hard-scoped to the single whitelisted action (mirrors how 42.2.1's apply stayed scoped to `library_metadata_helper`).
- Deny-by-default persistence continues: writes via execute-only `SECURITY DEFINER` RPCs, no direct table DML grants.
- Append-only apply audit (never updated, never deleted) — mirrors `helper_apply_events`.
- Every apply reversible; rollback tested in the same smoke that tests the apply.
- Pre-apply export / safety-scan obligations honoured per CLAUDE.md before any real apply.

## 5. What 42.3.4a (the only thing this brief might green-light to build) would contain

- A **remedy-plan representation**: declarative, deterministic, with `target` (table/id), `change` (field → new value), and `inverse` (field → prior value). Stored against the finding in the durable store (additive migration; new column/table TBD at recon).
- A **plan builder** per whitelisted action — pure, deterministic, derives the plan + inverse from existing data; no execution capability exists in the code at all.
- **Read-only display** of the proposed plan in the Maintenance Room (under the existing review surface; still Acknowledge/Dismiss/Reopen — **no Approve/Apply control yet**; those arrive in 42.3.4b/c).
- Tests: plan is deterministic; inverse round-trips; no execution path exists; no authority field ever appears in a plan; no House mutation.
- Governance posture identical to 42.3.3b: not Memory/evidence/authority/proposal/helper-output/queued-work; no hands (a *plan* is not an *act*).

## 6. Open questions for Ari (this is a conversation, not a spec)

1. Do we agree the three-way split (a: representation → b: approval → c: apply), each its own Tier-3 gate?
2. The first whitelisted action — confirm the deterministic Library metadata candidate, or pick a safer one.
3. Remedy-plan storage shape: a column on `agent_findings`, a sibling `agent_remedy_plans` table, or ephemeral-until-approved? (Leaning sibling table for clean audit + RLS.)
4. Should 42.3.4a remain execution-incapable at the *type* level (no apply function exists in the build at all) — recommended — so the first two sub-phases physically cannot act?
5. Relationship to the existing helper apply layer (`helper_work_orders` / `helper_apply_events`): reuse that audit substrate, or a parallel agent-side one? (Leaning reuse-the-pattern, separate table, to keep domains clean.)
6. What evidence bar must 42.3.4c clear before its first *real* apply (vs test-owned) — and does the first real apply get its own per-run approval, like 42.2.1 did?

## 7. What this brief does NOT authorise

No code, no migration, no recon, no DB mutation, no approval surface, no apply worker, no real remedy, no scheduler, no LLM, no autonomy. It authorises a **design conversation** and — only on Ari + Tara sign-off — the build of **42.3.4a (remedy representation, execution-incapable)**.

---

*Constitution-level brief. The kernel may inspect, report, durably record, and let Tara review/triage. 42.3.4 is the threshold where it learns to act — once, narrowly, reversibly, and only by Tara's explicit hand on each approval. Nothing here crosses that line yet; it describes how we cross it safely.*
