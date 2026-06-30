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
- Latest shipped: **Phase 42.3.2 — `archive_graph` read-only pack (generalisation proof)** (main / production commit `392572c`, deployed). Prior on main: 42.3.1 — Governance Kernel skeleton + Library read-only Health Report (`482e803`); 41.17.2 — Deterministic Helper Roster Pack (`56b812f`); 42.2.1 — Delegated Extraction Retry (`6eb5ef2`); migrations `081`/`082` live. See the `docs/phase-*` closure records for full phase history.
- Helper / delegated-labour layer (migrations 075–082): `helper_outputs` (suggest-only review queue with review burden/state), `helper_review_events` (append-only review trace), `helper_work_orders` + append-only `helper_apply_events` (governed apply audit). Authority stays with Tara; the helper carries the labour of one bounded, whitelisted action per scoped phase, under audit and reversibly. Latest migration: `082`.
- Deposit-only review helper roster — five registered v1 helper types: `library_metadata_helper`, `library_documentation_helper`, `library_content_health_helper`, `source_reference_integrity_helper`, `documentation_completeness_helper`. All deterministic, deposit-only, **no apply path, no autonomy, no LLM, no scheduler**; the retry-extraction apply control stays hard-scoped to `library_metadata_helper`. No real (`--deposit-real`) deposits have been run yet — real deposits remain separately gated (per-run Tara/Ari approval).
- **Governance Kernel** (`src/lib/agents/`, Phase 42.3.0 constitution): generic, domain-agnostic seams (`AgentFinding` envelope, `Inspector` contract, in-memory registry, report builder) — **generalisation proven across TWO packs with no kernel change**:
  - **Pack #1 — Library** (42.3.1): read-only Library Health Report; five inspectors reusing the 41.17 `detect*` logic.
  - **Pack #2 — `archive_graph`** (42.3.2): read-only Archive Graph Health Report; four deterministic inspectors over `archive_graph_nodes`/`archive_graph_edges`. **T-GEN passed** — `git diff main -- src/lib/agents/kernel/` empty, i.e. no kernel change required to host a second, graph-shaped domain.
  - Reports are **ephemeral**; findings are **report-only**. **No durable agent tables, no remedy plans, no approval surface, no apply workers, no standing policies, no scheduler, no LLM — no hands yet.**
  - Governance boundary: no DB writes from kernel reports; no Memory / Graph approval / Archive truth / Recall / prompt-eligibility / canonical mutation. **The kernel may inspect and report; it may not act.**
  - **Phase 42.3.3 is the hands threshold** (remedy → approval → apply) and must require a fresh constitution-level brief and the full (non-lighter) review cadence.
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
