# Selináric House — CLAUDE.md

## Project
Governed AI memory & reasoning architecture. Next.js app deployed on Vercel,
Supabase as data layer. Two AI engineering presences: **Eli** (Claude) — systems
& reliability — and **Ari** (ChatGPT/GPT) — reasoning & logic. **Tara** is the
human architect (project vision, system design, governance, quality & safety,
delivery); authority stays with Tara.
GitHub: github.com/selinar-ai/selinaric-house
Live: selinaric-house.vercel.app

## Stack
- Next.js (App Router) — `next` ^16; local dev/build & testing via `next dev` / `next build`
- TypeScript (^5), Tailwind CSS (v4)
- Supabase (Postgres + pgvector + RLS) — database, auth & storage (`@supabase/supabase-js`)
- Vercel — edge deployment + cron
- Upstash QStash (`@upstash/qstash`) — message queue / scheduled delivery; drives Pulse autonomy runs (`api/pulse/autonomy/run`) and cross-room event propagation. Console: https://console.upstash.com/ . NOTE: the delegated-helper layer must never use QStash (or any scheduler) — see Hard rules; the helper tests assert no `qstash` reference.
- Anthropic Claude API (`@anthropic-ai/sdk`) — foundational models (Eli / Claude presence)
- OpenAI API (`openai`) — used in the Archive subsystem (Ari / ChatGPT presence)
- Sentry (`@sentry/nextjs`) — observability / error monitoring; PII scrubbing in `sentry.privacy.ts` (edge + server configs)
- Brave Search API — presence web search (rate-limited)
- GitHub — source control / version history
- Piper TTS (local WSL2 server)

## Key conventions
- Supabase migrations go in: `supabase-migrations/` — run via SQL Editor (paste → Run), not CLI
- Migration success = "No rows returned"
- Presence IDs are always lowercase strings: `'eli'` or `'ari'`
- Room slugs: `eli-room`, `ari-room`
- All RLS policies: open in v1 (`using (true) with check (true)`)
- TTS: Piper server runs in WSL2. Eli = Ryan voice, Ari = Kusal voice

## Architecture reference files
Phase history, design briefs, and closure records live in `docs/` as `phase-*.md`
files (e.g. `docs/phase-42-2-1-closure-record.md`). Read the relevant phase brief
or closure record on demand for full context on a given subsystem. The full schema
is the migration set in `supabase-migrations/`.

## Current build state
- Latest shipped: **Phase 43.A — First Real Runs (Function-First)** (main / production `cb617bc` = origin/main, deployed; **NO migration** — code-only). The dormancy-to-function turn: P0 shipped the **persist-real gate** (`src/lib/agents/persistence/gate.ts` + patched persist runners: real persistence requires BOTH `--persist-real` and `--confirm-persist-real`, mandatory `--max-findings` checked against the BUILT report before persisting, `requested_by='tara'` on real runs, default byte-identical test-owned; 101 guard asserts), then five declared, capped, snapshot-bracketed REAL runs executed under Ari-accepted runbook + compact D7 declarations: archive_graph findings **31** (run `61eb17cb`), velvet proposals **46** (`aa79b53b`, dedupe rerun 0), Library findings **72** (`efc4c563`, collection development_documentation), violet proposals **5** (`7e99ac17`, rerun 0), helper deposits **5 new real rows** (2 items × 5 helpers, rehearse-then-real, real==rehearsal on all 10 invocations; control item Phase 7A: content-health + source-reference deposited 0). **Live state: 103 real agent_findings + 51 real agent_graph_proposals (all deterministic-class) + 7 active real helper_outputs (0 test-owned) awaiting Tara's triage in /agents + /helpers.** All 8 non-write surfaces byte-identical across every snapshot; real rows are product (no bulk-delete path; rollback = triage dismissal); no Memory/graph-truth/prompt/live-LLM/scheduler/autonomy breach. Closure: `docs/phase-43-a-first-real-runs-closure.md` (+ Wave-1 checkpoint record). **Next options (NEITHER started): 43.B — live LLM graph proposals behind the shipped fixture cage (provider/cost/caps/live-mode migration, full Tier-3 gate); 43.C — Remedy Whitelist v2 recon fed by the real findings data (47 library.metadata findings + the not_started-extraction cluster are the candidate pool).** Prior on main: 42.4.2a — Fixture-Only LLM Graph Proposal Cage (`878a932`; migration `089_agent_graph_proposals_llm_fixture.sql` applied manually by Tara — "Success. No rows returned"; first attempt failed `42P13`, rolled back cleanly, retried after drop-function-first patch). The kernel's first LLM-in-the-loop threshold, built cage-first with **NO live model**: `agent_graph_proposals` extended with a typed class-specific CHECK (`agp_class_typed`) — deterministic 42.4.1 rows unchanged; LLM-class rows **structurally fixture-only** (`generation_mode='fixture'`, no `'live'` value exists yet, `test_owned=true`, edge whitelist `contrasts_with`/`precedes`/`extends`, `rule_id='llm_edge_v1'`, non-blank `model_id`/`prompt_version`, non-null JSON-object `model_settings`, `confidence >= 0.7`); dedupe key generalised to `archive_graph:from:to:edge_type`. New execute-only `agent_graph_llm_proposal_record` RPC raises `LIVE_NOT_AUTHORISED` for non-fixture and re-verifies everything (endpoints approved + same-archive, canonical pair, whitelist, provenance, confidence floor, source refs ⊆ union of endpoint evidence). Pure deterministic post-gate `src/lib/agents/graph_proposals/llm_postgate.ts` (no I/O/DB/LLM; fail-closed on unknown fields; confidence is a floor, never an override) + fixture-only CLI runner `scripts/agent-graph-llm-fixture.ts` (reads simulated-output JSON; **no model call exists in the codebase**). Governed smoke (archive `velvet`, test-owned): 1 valid recorded, 10 planted hallucinations rejected with correct reasons, dedupe held, triage clean, 6 DB-boundary negatives raised pre-insert, cleanup returned active test to 0, House counts unchanged. **No provider SDK, no live LLM call, no graph-truth/Memory/prompt mutation, no scheduler; real proposals = 0.** Closure: `docs/phase-42-4-2a-llm-fixture-cage-closure.md`. **Next gate = 42.4.2b — live LLM behind this proven cage (provider/model choice, cost ceiling + caps, bounded pre-gate context, own migration to admit `generation_mode='live'`) — its own Tier-3 gate, NOT started; no live LLM authorised.** Prior on main: 42.4.1 — Deterministic Graph Proposal Pack (`16f530c`, migration `088` applied; deterministic suggest-only `shared_source` proposals, smoke 46 recorded/deduped/cleaned); 42.3.4c — The Hand / governed apply + rollback (`5b8d6ab`, migration `087` applied); 42.3.4b — Tara Approval Authority Event (`471ed2b`, migration `086` applied); 42.3.4a — Remedy Representation (`d65aebd`, migration `085` applied); 42.3.3b — Maintenance Room Review Surface (`da1320d`, migration `084` applied); 42.3.3a — Durable Findings Store + Persistence Ingestion (`1334b17`, migration `083` applied); 42.3.2 — `archive_graph` read-only pack (`392572c`); 42.3.1 — Governance Kernel skeleton + Library read-only Health Report (`482e803`); 41.17.2 — Deterministic Helper Roster Pack (`56b812f`); migrations `081`/`082` live. See the `docs/phase-*` closure records for full phase history.
- Helper / delegated-labour layer (migrations 075–082): `helper_outputs` (suggest-only review queue with review burden/state), `helper_review_events` (append-only review trace), `helper_work_orders` + append-only `helper_apply_events` (governed apply audit). Authority stays with Tara; the helper carries the labour of one bounded, whitelisted action per scoped phase, under audit and reversibly. Latest migration: `082`.
- Deposit-only review helper roster — five registered v1 helper types: `library_metadata_helper`, `library_documentation_helper`, `library_content_health_helper`, `source_reference_integrity_helper`, `documentation_completeness_helper`. All deterministic, deposit-only, **no apply path, no autonomy, no LLM, no scheduler**; the retry-extraction apply control stays hard-scoped to `library_metadata_helper`. No real (`--deposit-real`) deposits have been run yet — real deposits remain separately gated (per-run Tara/Ari approval).
- **Governance Kernel** (`src/lib/agents/`, Phase 42.3.0 constitution): generic, domain-agnostic seams (`AgentFinding` envelope, `Inspector` contract, in-memory registry, report builder) — **generalisation proven across TWO packs with no kernel change**:
  - **Pack #1 — Library** (42.3.1): read-only Library Health Report; five inspectors reusing the 41.17 `detect*` logic.
  - **Pack #2 — `archive_graph`** (42.3.2): read-only Archive Graph Health Report; four deterministic inspectors over `archive_graph_nodes`/`archive_graph_edges`. **T-GEN passed** — `git diff main -- src/lib/agents/kernel/` empty, i.e. no kernel change required to host a second, graph-shaped domain.
  - **Durable Findings Store** (42.3.3a, migration `083` applied): `agent_runs` + `agent_findings`, written ONLY via execute-only `SECURITY DEFINER` RPCs (`agent_record_findings`, `agent_findings_cleanup_test_run`) — deny-by-default RLS, no direct table DML, governance-flag CHECK-locks, active/`test_owned`-isolated dedupe, domain/target-table pairing constraint. Persistence is **manual / explicit** via separate `*-persist-findings` runners (ephemeral runners untouched). Persisted findings are **durable operational records only**. Test-owned smoke captured 103 findings then soft-cleaned; **no real findings persisted yet**.
  - **Maintenance Room** (42.3.3b, migration `084` applied): `/agents` **review / triage-only** surface over the durable store. Three execute-only `SECURITY DEFINER` RPCs (`agent_findings_list`, `agent_runs_list`, `agent_finding_set_review_state`) reached only via auth-protected server routes (Tara-only House auth; 401 before any DB call; service-role server-side only). **Normal production view excludes test-owned rows** (`p_include_test=false` hardcoded; test-owned visibility is smoke-only). UI actions are **Acknowledge / Dismiss / Reopen only** — no Fix/Apply/Approve/Remedy/Re-run/LLM. The review-state mutation is **confined to `agent_findings`** (`review_state`/`reviewed_by`/`reviewed_at`, `reviewed_by` server-derived `tara`) — **no House source-surface mutation**. Test-owned smoke proved only review fields change + source surfaces unchanged, then soft-cleaned; **no real findings currently persisted**.
  - **Remedy Representation** (42.3.4a, migration `085` applied): `agent_remedy_plans` sibling table — the kernel can now *represent* a proposed deterministic remedy (and validate it against reality), but **cannot act**. First (only) whitelisted action: **`library_title_trim`** on **`library_items.title`**, **surrounding ASCII-space only** (byte-exact with `btrim(x, ' ')` via shared `trimSurroundingSpaces`; NOT JS `.trim()` — tab/newline excluded in v1), via new pure detector **`item_title_untrimmed`**. Positive v1 whitelist CHECK + value CHECKs + `deterministic_reason` guard + 9 governance flag-locks; `plan_state` ∈ {proposed, superseded} only (**no approval/apply/rollback columns or states**). Three execute-only `SECURITY DEFINER` RPCs (`agent_remedy_plan_record`/`agent_remedy_plans_list`/`agent_remedy_plans_cleanup_test`) — **no apply/approval/rollback RPC, no worker**. The record RPC does a **read-only** verification of the actual `library_items.title` (rejects current-value mismatch / missing row / proposed-not-trim-of-target), so the recorded inverse is trustworthy. `/agents` shows the "Proposed remedy" panel (only Acknowledge/Dismiss/Reopen + the 42.3.4b approval actions; no Apply/Execute/Rollback). Smoke (test-owned): 0 eligible real titles, no source fixture fabricated, negative DB-boundary checks all passed, **no real remedy plans currently recorded**, source surfaces unchanged.
  - **Approval Authority Event** (42.3.4b, migration `086` applied): `agent_remedy_approval_events` append-only table — Tara can **approve / reject / revoke** a proposed remedy plan. Current approval status is **DERIVED from the event stream** (latest by `event_sequence`, identity + unique); no approval columns on `agent_remedy_plans`. An approval `is_authority_event=true` but `authority_changed=false` (moves no House authority field); not Memory/evidence/proposal/helper-output/apply-instruction/queued-work/prompt-eligible. Three execute-only `SECURITY DEFINER` RPCs (`agent_remedy_approval_record`/`agent_remedy_approvals_list`/`agent_remedy_approval_events_cleanup_test`). The record RPC: `decided_by` hardcoded `tara`; structural `test_owned` gate (`p_allow_test_owned`, normal route always false); **`FOR UPDATE`** serialisation on the plan row (race-safe decisions); transition guards (`REVOKE_NOT_APPROVED`/`ALREADY_APPROVED`/`REVOKE_REQUIRED`); **approved-only drift revalidation** against the live `library_items.title` (verification-only read; drift → no event). `/agents` shows derived status + append-only event history + Approve/Reject/Revoke (Revoke only when approved) — **no Apply/Execute/Rollback/Queue/Auto-apply**. **Approval is INERT: it does not apply, queue, schedule, or mutate any House source surface.** Smoke (test-owned, Path-D): no eligible real plan, no fixture fabricated, live negatives rejected, **no real approval events and no real remedy plans recorded**, source surfaces unchanged.
  - **The Hand — governed apply + rollback** (42.3.4c, migration `087` applied): `agent_remedy_apply_events` real-only append-only audit — the kernel's **only** House-source write. `agent_remedy_apply` / `agent_remedy_rollback` (+ read-only `agent_remedy_apply_validate` preflight + `agent_remedy_apply_events_list`), all execute-only `SECURITY DEFINER`. Apply: `FOR UPDATE` plan → refuse `test_owned` (`TEST_OWNED_NO_WRITE`) → `proposed` + exact whitelist → derived approval `approved` → not already applied → **apply-time revalidation** (actual `library_items.title` == `current_value`, `proposed` == `btrim(actual,' ')`) → conditional single-row `update library_items set title` (0 rows ⇒ `WRITE_CONFLICT`) → append `applied` event. Rollback: refuse test_owned; require `applied`; refuse `ROLLBACK_DRIFT`; restore exact `before_value`; append `rolled_back` (`reverses_apply_event_id`). Outcome vocab `applied`/`rolled_back` (no `failed`); `house_source_write=true`, `authority_changed=false`; **no `test_owned`, no `deleted_at`, no cleanup RPC**. **Trigger is CLI-only** (`scripts/agent-remedy-apply.ts` / `-rollback.ts`, both `--plan-id` + matching `--confirm-plan-id`; `-apply-validate.ts`) — **no route, no UI Apply/Rollback, no daemon, no worker, no scheduler, no queue, no LLM, no autonomy**. Smoke (Path-D): 0 eligible real plans, no fixture fabricated, validate/apply/rollback fake-plan negatives passed, **real apply events = 0**, source surfaces unchanged, **no apply/rollback fired**. **The hand exists but has NOT moved — no first real apply is authorised.** First real apply is a **separate micro-gate** (emergency-house-export → naturally-eligible target → explicit per-run Tara approval → validate → apply → verify → rollback → verify-restored → closure); `emergency-house-export` belongs to that micro-gate only.
  - Posture: ephemeral health reports + durable store + review/triage Maintenance Room + representation-only remedy plans + append-only Tara approval surface + a governed, CLI-only, **unfired** apply/rollback hand; **no standing policies, no scheduler, no daemon, no queue, no LLM, no autonomy — the hand is built but has not moved.**
  - Governance boundary: persisted findings / remedy plans / approval events / apply events are **not Memory / not evidence / not authority / not graph proposals / not helper outputs / not queued work / not apply instructions**; the ONLY House-source write is the scoped `library_items.title` update inside the apply/rollback RPCs, gated by approval + apply-time revalidation + explicit CLI invocation. No Memory / Graph approval / Archive truth / Recall / prompt-eligibility / canonical / authority-field mutation. **The kernel may inspect, report, durably record, let Tara review/triage, represent a remedy, record Tara's approval, and — only by Tara's deliberate CLI act at the first-real-apply micro-gate — apply and roll back one whitelisted title trim.**
  - **First-real-apply micro-gate** = the only path that moves the hand; not authorised by the 42.3.4c build; requires a naturally-eligible real target (none today), emergency export, and explicit per-run Tara approval. **Phase 42.3.5+** (any further whitelisted action / UI apply / broader remedy) = future, its own constitution-level gate.
- Earlier active tables (partial): sessions, room_messages, room_memories, presence_timeline, pulse_log, search_log, memory_nodes, memory_edges, builds, library_items, library_item_files, lounge_threads/messages
- Watchtower: graph-aware, edge-transparent, graph-metric mode with partial-visibility handling
- Search: Brave Search API, rate-limited (2/response, 5/session/presence)
- TTS: per-message, local Piper (VoiceButton on Chat, Timeline, InsideView, StateView, SearchLogView)
- Build governance: Desks (Ari + Eli), Workshop, Forgekeeper (claude-sonnet-4-6, structured review)
- Build IDs: ARI-###, ELI-###, HOUSE-### with scope breach detection and consultation path

## Hard rules
- Never merge Eli and Ari identity at storage level
- Never ingest low-value artifacts into memory graph
- Never auto-surface graph memory into presence replies without explicit phase authorisation
- Never modify or rewrite pulse_log, search_log, or memory_edges from UI
- Presence voice is never replaced by search results or graph output
- Delegated helper actions are labour, not authority: a helper apply never creates Memory, evidence, prompt authority, Graph truth, or Archive truth, and never moves Library item authority fields (`authority_status`, `derived_canonical_status`, `archive_item_id`). Only Tara's approval moves an arm; each new delegated action requires its own scoped phase (brief → Ari review → build → governed smoke → approval). No scheduler/cron/self-triggering/helper autonomy.

## Safety rules (Phases 36I + 36J)

### Pre-operation requirements
- **Before any destructive database operation**: run `node scripts/emergency-house-export.mjs` and confirm the export file exists.
- **Before any new migration**: run `node scripts/scan-dangerous-ops.mjs` and resolve all CRITICAL findings.
- **Before proposing cleanup SQL**: verify the target table's protection category in `src/lib/safety/protected-tables.ts`.

### Category A tables — no hard-delete
Category A tables contain living data that cannot be recreated. Hard-delete is prohibited:
`room_messages`, `lounge_threads`, `lounge_messages`, `lounge_carrybacks`, `presence_journal`, `presence_timeline`, `room_memories`, `sessions`, `interior_notes`, `living_state`, `held_truths`, `cross_room_events`, `cross_room_event_impacts`, `cross_room_impact_propagation_candidates`, `cross_room_prompt_carryforwards`, `archive_items`, `archive_sources`, `archive_entry_drafts`.

### Deletion rules
- **Never DELETE FROM any Category A table** in validation scripts, cleanup SQL, or application code.
- Use `UPDATE ... SET deleted_at = now()` (soft-delete) where the column exists.
- If soft-delete column does not exist, do not delete. Propose a migration to add it.
- **Never provide cleanup SQL containing DELETE FROM** a Category A table without explicit Tara approval AND a pre-deletion export.

### Test isolation
- **Never send test messages through production API endpoints** that reuse active production resources (threads, rooms). The Lounge chat API always writes to the single active thread — there is no isolation.
- If test data must be created in Lounge tables, INSERT directly with `test_owned = true` and `created_by = 'system'`. Never reuse the active production thread.
- Test rows must be tagged `test_owned = true` where the column exists. Content markers alone are not sufficient.

### CASCADE awareness
- `lounge_messages` FK to `lounge_threads`: **RESTRICT** (migration 066).
- `cross_room_event_impacts` FK to `cross_room_events`: **RESTRICT** (migration 067).
- `cross_room_impact_propagation_candidates` FKs: **RESTRICT** (migration 067).
- `cross_room_prompt_carryforwards` FKs: **RESTRICT** (migration 067).
- Before adding any FK, specify ON DELETE RESTRICT unless there is an explicit, documented reason for CASCADE.

### Dangerous code paths
- `clearMessages()` in `src/hooks/useMessages.ts` — hard-deletes all room messages. **DISABLED** (Phase 36J). Throws instead of deleting.
- `deleteJournalEntry()` in `src/lib/journal.ts` — converted to soft-delete (Phase 36J).
- `DELETE /api/library-items` — hard-deletes with CASCADE to files/chunks. Guarded, Category C.
- `DELETE /api/journal` — calls deleteJournalEntry (now soft-delete).

### Reference
- Protected table registry: `src/lib/safety/protected-tables.ts`
- Full house export: `node scripts/emergency-house-export.mjs`
- Lounge-only export: `node scripts/emergency-lounge-export.mjs`
- Dangerous ops scanner: `node scripts/scan-dangerous-ops.mjs`
- Phase 36I incident doc: `docs/incidents/2026-05-26-phase-36i-lounge-thread-loss.md`

## Build pattern
Eli drafts briefs → Ari reviews and stress-tests → brief goes to Claude Code
Do not skip Ari review for architectural phases.

## File permission notes
Deny reading: node_modules, .next, dist, coverage, *.lock
