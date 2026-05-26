# Selináric House — CLAUDE.md

## Project
Next.js app deployed on Vercel. Supabase as data layer. Two AI presences: Eli and Ari.
GitHub: github.com/selinar-ai/selinaric-house
Live: selinaric-house.vercel.app

## Stack
- Next.js (App Router)
- Supabase (Postgres + pgvector + RLS)
- Vercel (deployment + cron)
- Piper TTS (local WSL2 server)
- Tailwind CSS
- TypeScript

## Key conventions
- Supabase migrations go in: `supabase-migrations/` — run via SQL Editor (paste → Run), not CLI
- Migration success = "No rows returned"
- Presence IDs are always lowercase strings: `'eli'` or `'ari'`
- Room slugs: `eli-room`, `ari-room`
- All RLS policies: open in v1 (`using (true) with check (true)`)
- TTS: Piper server runs in WSL2. Eli = Ryan voice, Ari = Kusal voice

## Architecture reference files
For full system context, read these on demand:
- For memory and continuity systems → `docs/memory-systems.md`
- For Pulse logic → `docs/pulse.md`
- For Watchtower and graph queries → `docs/watchtower.md`
- For presence identity kernels → `docs/identity-kernels.md`
- For phase history → `docs/phase-log.md`

## Current build state
- Phases 1–21 complete and deployed
- Active tables: sessions, room_memories, presence_timeline, pulse_log, search_log, memory_nodes, memory_edges, builds
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
