# Phase 11F — Autonomous Pulse Expansion: House Noticeboard + Orientation v1

**Status:** built, verified locally (lint-clean for changed files, `next build` passes,
governance tests pass). Migration `081` not yet run in production (awaiting Tara).

Phase 11F adds **House Deposit** as a new autonomous Pulse choice and repurposes the
unused Notes route into the **House Noticeboard**.

A House Deposit is a shared note left by Ari or Eli during an autonomy window. It is
smaller than Telegram, less private than Journal, and not a Desk build concept. It does
not ask Tara for a response.

Noticeboard items are **not** Memory, not Journal, not Telegram, not Lounge chat, not
Library material, not Archive, not evidence, and not prompt authority. The event that a
presence chose House Deposit may be confirmed as autonomous continuity (it lives in
`pulse_autonomy_events`); the **content** of the deposit remains non-authoritative unless
Tara later routes it through an existing governed review pathway.

---

## 1. Purpose

Give Ari and Eli a real shared place to leave small notes during autonomous Pulse
windows — a noticeboard in the hallway, a note on the kitchen table — without creating
broader autonomous authority, Memory, or any obligation for Tara to reply.

## 2. New choice: `house_deposit`

Added to the Pulse autonomy action union (`telegram | journal | desk | stillness |
house_deposit`). It is available in **both** open and quiet hours, because it never
interrupts Tara.

| Action        | Quiet hours |
| ------------- | ----------- |
| Telegram      | unavailable |
| Journal       | available   |
| Desk          | available   |
| Stillness     | available   |
| House Deposit | available   |

When chosen, the autonomy run creates the `pulse_autonomy_events` row (the confirmed
event of the choice) and **exactly one** `house_noticeboard_items` row linked back to it
by `source_event_id`. The deposit content is stored **only** on the Noticeboard item; the
pulse event's `choice_text` is set to `null` for house_deposit so the content can never
leak into recent-event prompt/recall excerpts.

## 3. Noticeboard route: `/notes`

The previously unused `/notes` route (a generic `house_notes` note/task tool with no
migration backing it) is repurposed into the House Noticeboard. The old `house_notes`
table was **not** dropped — it is simply orphaned and untouched. Nav label updated
(`Notes` → `Noticeboard`).

UI: presence, Melbourne timestamp, source window, status, content, the subtle authority
label *"Shared deposit · not Memory"*, and Tara review controls (Mark viewed · Pin ·
Release · Route to Library Review · Route to Archive Review · Hide). Filters: All · Ari ·
Eli · Pinned · Active · Released. Empty state: *"The Noticeboard is quiet."*

The Pulse page renders `house_deposit` events with a preview and an **Open on
Noticeboard** link.

## 4. Database table: `house_noticeboard_items`

Migration `supabase-migrations/081_house_noticeboard_items.sql`:

- `source_type` ∈ {`pulse_house_deposit`, `tara_manual_note`}
- `source_event_id` → FK to `pulse_autonomy_events(id)` `ON DELETE SET NULL` (a deposit is
  independent content and must survive; documented exception to the default-RESTRICT rule)
- `presence_id` ∈ {`ari`, `eli`} (nullable)
- `content`, `note_kind`, `visibility` (locked to `shared_house`)
- `status` ∈ {active, viewed, pinned, released, routed_to_library_review,
  routed_to_archive_review, hidden}
- **Authority invariants, DB-locked via CHECK:** `not_memory = true`,
  `not_evidence = true`, `not_prompt_authority = true`, `authority_changed = false`,
  `authority_label = 'house_noticeboard_not_memory'`. These can never be flipped, on
  insert or update.
- Indexes on created_at, presence, status, source_event_id; **partial unique index** on
  `source_event_id` for pulse deposits (idempotency backstop).
- Also extends `pulse_autonomy_events.chosen_action` CHECK to include `house_deposit`
  (via a name-robust, re-runnable DO block).
- RLS open (`using(true) with check(true)`), House v1 convention.

## 5. Authority boundary

| Record                                         | Meaning                     | Authority                  |
| ---------------------------------------------- | --------------------------- | -------------------------- |
| Pulse event says Ari/Eli chose `house_deposit` | Confirmed autonomous choice | Confirmed event continuity |
| Noticeboard item content                       | Shared deposit              | **Not Memory**             |
| Tara pins/views/releases/routes it             | Review/status metadata      | **Still not Memory**       |
| Tara routes to Archive/Library review          | Existing governed pathway   | Not confirmed until review |

A `house_deposit` run **does not** call `createConfirmedAutonomyMemory` (no `archive_items`
row) and **does not** mirror to `presence_timeline`. The confirmed continuity of the
*choice* is the `pulse_autonomy_events` row itself.

## 6. What was NOT built (out of scope this phase)

- Library Reading action (deferred — touches Library/RAG governance; Phase 11G).
- Web browsing / open-ended autonomous tool use / cross-action chaining.
- Any background worker beyond the existing Pulse rhythm.
- Autonomous routing to Archive or Library; any graph proposal / helper / candidate
  generation; any new prompt-authority surface; any memory promotion path.
- Noticeboard `routed_to_library_review` / `routed_to_archive_review` are **status-only**
  in this phase — they mark the item; they do not enqueue or auto-promote anything.

## 7. Verification results

- **Governance tests:** `node scripts/test-phase-11f-noticeboard.mjs` → 69/69 checks
  passed (covers brief §15 Tests 1–8: schema accepts house_deposit, quiet-hours
  availability, deposit creation + locked flags, idempotency, status updates never change
  authority, list hides hidden by default, UI boundary text, no prompt-injection path).
- **Build:** `npm run build` (`next build`) → passes (type-check clean; `/api/noticeboard`,
  `/api/noticeboard/[id]`, `/notes`, `/pulse` all compiled).
- **Lint:** the 8 changed files are ESLint-clean (0 errors; 1 pre-existing unused-var
  warning in `pulse/page.tsx`). The full-repo `npm run lint` has ~164 **pre-existing**
  errors in unrelated files (root `test-33*.js` require-imports, scattered unused vars);
  none introduced by this phase, none in changed files.
- **Dangerous-ops scan:** `node scripts/scan-dangerous-ops.mjs` → 0 new critical findings.

## 8. Known follow-up

- **Phase 11G — Library Reading action** (deferred): read-only, no downstream chaining,
  no Memory/graph/helper/candidate generation.
- **Phase 11H — Orientation Packet v1**: pre-choice orientation (quiet hours, House
  temperature, recent same-presence outcomes, Desk/Workshop status, Tara response state).
- **Phase 11I — Noticeboard Review Routing**: turn `routed_to_*` markers into real review
  candidates, only through existing governed pathways. No self-crowning.

## 9. Files changed

- `supabase-migrations/081_house_noticeboard_items.sql` (new)
- `src/lib/house-noticeboard.ts` (new — types, locked payload builder, transition rules,
  DB helpers)
- `src/lib/pulse-autonomy.ts` (house_deposit: type, prompt, quiet-hours availability,
  validation, execution branch, fact-only continuity; skips memory/timeline)
- `src/app/api/noticeboard/route.ts` (new — GET list + optional POST manual note)
- `src/app/api/noticeboard/[id]/route.ts` (new — PATCH status transitions, authority-safe)
- `src/app/api/pulse/autonomy/events/route.ts` (enrich house_deposit events with linked
  Noticeboard preview — UI surface only)
- `src/app/(house)/notes/page.tsx` (repurposed into House Noticeboard)
- `src/app/(house)/pulse/page.tsx` (house_deposit rendering + Open on Noticeboard)
- `src/lib/rooms.ts` (nav label: Notes → Noticeboard)
- `scripts/test-phase-11f-noticeboard.mjs` (new — governance tests)
- `docs/phase-11f-house-noticeboard-autonomous-deposit.md` (this record)
