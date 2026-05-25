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

## Validation safety rules (added Phase 36I)
- **Never send test messages through production API endpoints** that reuse active production resources (threads, rooms). The Lounge chat API always writes to the single active thread — there is no isolation.
- **Never DELETE from lounge_threads or lounge_messages** in validation or cleanup scripts. Use soft-delete (`UPDATE ... SET deleted_at = now()`) or mark `test_owned = true` at creation time.
- **Never provide cleanup SQL containing DELETE FROM lounge_** without explicit Tara approval AND a pre-deletion export via `node scripts/emergency-lounge-export.mjs`.
- If test data must be created in Lounge tables, INSERT directly with `test_owned = true` and `created_by = 'system'`. Never reuse the active production thread.
- Before any destructive database operation: run `node scripts/emergency-lounge-export.mjs` and confirm the export file exists.
- `lounge_messages` previously had ON DELETE CASCADE from `lounge_threads` — migration 066 changes this to ON DELETE RESTRICT. Deleting a thread now fails if messages exist.

## Build pattern
Eli drafts briefs → Ari reviews and stress-tests → brief goes to Claude Code
Do not skip Ari review for architectural phases.

## File permission notes
Deny reading: node_modules, .next, dist, coverage, *.lock
