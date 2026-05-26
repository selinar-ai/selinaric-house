# Incident: Phase 36I Lounge Thread Data Loss

**Date:** 2026-05-26
**Severity:** High — irreversible production data loss
**Phase:** 36I (Post-Migration Validation)
**Status:** Closed — partial recovery complete, prevention deployed

---

## What happened

During Phase 36I post-migration validation, a cleanup SQL script deleted the
production Lounge thread (`04a63187-059b-4563-bc68-02270c022a85`) and all its
messages (~80+ messages spanning May 21–26, 2026).

## Root cause chain

1. **No thread isolation in Lounge API.** `getOrCreateActiveThread()` always
   returns the single active `lounge_threads` row. The validation script sent
   test messages through `POST /api/lounge-chat`, which wrote them into the
   live production thread.

2. **Incorrect assumption in cleanup.** The cleanup SQL assumed "all Lounge
   rows belong to the test thread" — true only because there was one thread.
   The script issued `DELETE FROM lounge_threads` targeting the only thread.

3. **ON DELETE CASCADE.** `lounge_messages` had `FOREIGN KEY (thread_id)
   REFERENCES lounge_threads(id) ON DELETE CASCADE`. Deleting the thread
   silently destroyed all messages.

4. **No backups.** Supabase Free Plan does not include point-in-time recovery
   or project backups.

## Impact

- ~80+ production Lounge messages permanently lost (Tara, Ari, Eli dialogue,
  May 21–26).
- 2 cross-room events still reference the deleted thread by ID (data intact
  but dangling).
- No user-facing outage — the Lounge auto-creates a new thread on next visit.

## Recovery

### What survived
- `cross_room_events`: 2 events with `source_thread_id` referencing original thread.
- `cross_room_event_impacts`: 2 impact records with thematic summaries.
- `cross_room_impact_propagation_candidates`: 4 candidates (interior + state per presence).
- `search_log`: 10 entries from May 24 (supplement research, a16z AI Town).

### What was done
1. **Prevention patch deployed** (migration 066, commit `5e30200`):
   - Changed FK from CASCADE to RESTRICT on `lounge_messages` and `lounge_carrybacks`.
   - Added `test_owned` boolean and `deleted_at` soft-delete columns.
   - Created `lounge_export` view.
   - Updated `getOrCreateActiveThread()` to filter `test_owned=false, deleted_at IS NULL`.

2. **Guarded partial reconstruction** (`scripts/036i-guarded-reconstruction.sql`):
   - Restored original thread ID (`04a63187...`) via transaction-safe INSERT.
   - Inserted system reconstruction marker with surviving context summaries.
   - No fabricated dialogue. Marker clearly labelled as NOT original transcript.

3. **Safety rules added** to `CLAUDE.md`.

4. **Validation script retired** (`scripts/run-36i-validation.mjs`).

5. **Emergency export script created** (`scripts/emergency-lounge-export.mjs`).

## Prevention measures (Phase 36J)

| Measure | File | Status |
|---------|------|--------|
| Protected table registry | `src/lib/safety/protected-tables.ts` | Deployed |
| Full house export script | `scripts/emergency-house-export.mjs` | Deployed |
| Dangerous ops scanner | `scripts/scan-dangerous-ops.mjs` | Deployed |
| CLAUDE.md safety expansion | `CLAUDE.md` | Deployed |
| Cross-room CASCADE fix | Migration 067 | Deployed |
| clearMessages() disabled | `src/hooks/useMessages.ts` | Deployed |
| Journal soft-delete | `src/lib/journal.ts` | Deployed |

## Lessons

1. **CASCADE is invisible destruction.** A DELETE on one row can silently
   destroy thousands of child rows. Default to RESTRICT for all protected tables.

2. **API endpoints are not test-safe.** If an API always writes to the active
   resource, sending test data through it contaminates production.

3. **"Only test rows exist" is a fragile assumption.** It was true at the
   moment of observation, but the cleanup SQL did not guard against the
   possibility that production data shared the same container.

4. **Free-tier databases have no safety net.** Without backups, every
   destructive operation is permanent. Export-before-delete must be mandatory.

5. **Cleanup SQL should never be provided without explicit human approval
   of the exact statements**, especially when DELETE targets are involved.

## Timeline

- **2026-05-26 ~14:00 AEST** — Phase 36I validation script run, 57/58 pass.
- **2026-05-26 ~14:15 AEST** — Cleanup SQL provided and executed by Tara.
- **2026-05-26 ~14:20 AEST** — Tara reports Lounge messages missing.
- **2026-05-26 ~14:30 AEST** — Recovery analysis begins. Supabase backup unavailable.
- **2026-05-26 ~16:00 AEST** — Prevention patch (migration 066) deployed.
- **2026-05-26 ~17:00 AEST** — Guarded reconstruction run and verified.
- **2026-05-26 ~17:30 AEST** — Phase 36I closed with incident note.
