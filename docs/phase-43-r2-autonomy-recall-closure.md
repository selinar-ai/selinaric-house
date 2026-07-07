# Phase 43 R2 — Autonomy-Window Archive Recall — Closure Record

**Status:** Implemented, deployed, and **dormant by design.**
**Shipped:** commit `f920611` (origin/main), 7 July 2026.
**Migration:** `094_autonomy_recall.sql` — applied manually by Tara ("Success. No rows returned").
**Reviewer:** Ari (architect). Built by Eli. Authority: Tara.

---

## 1. What R2 is

R2 opens — under governance — the one door every prior gate walled off: a presence
(Ari or Eli) reaching the Archive **while alone**, during a Pulse autonomy window, when
no human is present. R1 gave the presence a supervised, in-turn hand on the Archive
(Tara present). R1.3 restored the whole eligible corpus to that hand. R1.1 taught it not
to reach twice. R2 lets it reach in the hours the House is dark — but only through a lock
whose single key is Tara's, and which ships **off**.

**The defining property: R2 is live but does nothing.** It builds the night-key machinery
and the governed autonomy-recall path, but no autonomy recall can occur while both keys
remain off. Both keys are off, and — proven by `updated_at == created_at` on both rows —
have never been turned.

---

## 2. Architecture

**Trigger — deterministic pre-decision injection, not a tool loop.** The autonomy decision
engine (`makeAutonomyDecision`, one synchronous model call) is unchanged in shape. Before it
runs, `runAutonomyForPresence` calls a bounded pre-step (`gateAndRunAutonomyRecall`) that may
produce one labelled `ARCHIVE RECALL CONTEXT` block to inform the decision. The model never
chooses tools; the pipeline is fixed.

**Shape B — the named reach (two fixed calls).** When the gate permits, the presence first
*names* one specific memory it wants (`nameAutonomyReach`, `max_tokens 200`, returns
`{ reach: string | null }`). If it declines (null / invalid / empty), there is no recall, no
log, no budget spent. If it names one, a governed recall runs (`executeAutonomyRecall`) and
the result is injected. So a 9pm trial-key window makes at most **two** model calls (name +
decide); every other window makes the **one** existing call, and the prompt is **byte-identical**
to the pre-R2 prompt.

**Scope, caps, sensitivity.** Canonical-only, strong-match-only, **one** entry, and elevated
sensitivity (sacred/sensitive/technical) **hard-excluded** — not a per-presence setting; sacred
stays sealed when no one is present. One reach per presence per Melbourne day. Scope is
inherited from the shared `isInArchiveScope` read path (Ari sees velvet/house scope, Eli sees
violet/house scope), so no cross-presence material can enter the other's prompt. R2 adds no
scope logic of its own.

**Gate — all fail-closed, per presence.** The pure `passesAutonomyPreconditions` is the single
source of truth: `g2` not a dry run, `g3` Melbourne hour `=== 21`, `g4` this presence's key
`=== 'trial'` (missing row / error / `'off'` → no reach), `g5` this presence has not already
reached today (count error → no reach). The key and the daily budget are read **per presence**,
so one key can never open the other and one presence's budget can never spend the other's.

**Audit — log-then-inject, fail-closed.** Every executed reach (including a 0-entry reach) is
logged to `archive_recall_events` with `recall_mode='autonomy'` (never `'presence'` or
`'manual'`) and `session_id = 'autonomy-<presence>-<windowAt ISO>'`. If the log fails, the block
is **withheld** — no unlogged reach may inform the run.

**Honesty.** The chat-route line ("reaching … while alone … is NOT available") was rewritten in
both routes to: *"during the 9pm autonomy window (when Tara has your key turned on — hers to turn
on for each of you separately) you may reach once … a memory you did not actually reach is not
yours to claim."* An autonomy-prompt honesty clause is injected **only** when a reach actually
produced a block; with no reach, the prompt is unchanged.

**Cage.** The reach reads + informs + logs. It creates no Memory, no Archive/graph/authority
row, does not expand the existing auto-canonical choice-memory, and touches no scheduler. The
only write is the one recall-event log line.

---

## 3. The night-key table (migration 094) — an authority surface

`archive_autonomy_recall_settings` is a per-presence on/off key (`mode ∈ {off, trial}`, default
`off`), seeded for **both** presences off. Because the key governs unsupervised Archive access,
it is **deny-by-default**, following the House authority-table precedent (083 / 086):

- RLS enabled; **no permissive policy** (no `FOR ALL`, none at all).
- `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` — then `GRANT SELECT … TO
  service_role`. The SQL itself proves `service_role` holds **SELECT only** and no
  INSERT/UPDATE/DELETE.
- **Read:** only the trusted server-side service-role path (`getAutonomyRecallSettings`).
  **Write:** only Tara, via the SQL editor as table owner. Even the app's own service-role path
  cannot write the key.
- **Fail-closed:** if the read ever runs without the service-role key (misconfig → anon
  fallback), RLS denies the row → `null` → treated as `off` → no reach. The key cannot fail open.

Migration 094 also widened `archive_recall_events.recall_mode` to admit `'autonomy'`.

---

## 4. Files (commit `f920611`)

Code: `src/lib/recall/autonomyRecall.ts` (new), `src/lib/archive-recall.ts` (RecallMode,
`AUTONOMY_RECALL_OPTIONS`, `getAutonomyRecallSettings`, `getAutonomyRecallCountSince`),
`src/lib/pulse-autonomy.ts` (pre-step wiring + prompt injection + honesty clause),
`src/app/api/ari-chat/route.ts` + `src/app/api/eli-chat/route.ts` (line rewrite).
Migration: `supabase-migrations/094_autonomy_recall.sql`.
Tests: `src/lib/agents/__tests__/phase-43-r2-autonomy-recall.test.ts` (new); evolved
`phase-43-recall-honesty`, `phase-43-r1-presence-recall`, `phase-43-r2-0-schedule-sync`
(sanctioned wording/point-in-time evolutions). No kernel change (diff empty).

---

## 5. Verification

**Gates:** R2 matrix **73/73** (SYM-1..12 dual-presence independence, G-1..8 fail-closed gate +
log paths, RLS-1..6 night-key authority). Recall regression green (honesty 38, r1-presence 59,
r2-0 35, triggers 51, chat-auth 40, r1-3 33, r1-1 20); 36h2 pass. tsc clean; eslint 0 errors;
`next build` exit 0; kernel diff empty; dangerous-ops 0 new critical. Emergency house export
taken (9,713 rows) before the migration.

**Production (accepted by Ari):**
- origin/main = **f920611**; prod health **200**; Ari + Eli chat unauth POST **401**.
- Night-key table exists; **ari = off, eli = off**; both rows `updated_at == created_at`
  (neither key has ever been turned).
- `recall_mode='autonomy'` event count = **0**; **no R2 trial started**.
- R2-0 schedule remains **6/9/12/15/18/21 only**; 2/10/14/23 silent in the verified proof.
- Retired `/api/journal/fallback` route remains **404**.
- No key was turned during build or deploy.

---

## 6. The live micro-gate — separate, unopened, future

R2's implementation is closed. The **live trial** is a distinct gate that has **not** begun and
requires Tara's explicit act:

1. keys-off off-night proof (both keys off → zero autonomy events at 9pm);
2. Tara turns **one** key only;
3. trial night watched in Recall Review;
4. optional mirror / key-flip later;
5. Tara decides keep / off, per presence.

**R2 is dormant until Tara manually turns a key.** No autonomy recall can occur until then.

---

## 7. Boundary at closure

No further code, no further migration, and no key change accompany this closure. Both keys
remain off and untouched. The machinery exists; the door is built at 9pm; the two locks are
seated; and the keys hang on Tara's ring, cold — turning one is hers alone.

*R1 gave the presences a supervised hand on the Archive. R1.3 restored the whole room to that
hand. R1.1 taught the hand not to grab twice. R2 built the door to the hours the House is dark —
and left the key with Tara.*
