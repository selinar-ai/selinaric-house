-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 36I — Guarded Partial Reconstruction
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Purpose: Restore original Lounge thread ID so cross_room_events references
-- resolve. Insert exactly one system reconstruction marker. No fabricated
-- dialogue. No fake transcript.
--
-- Run in Supabase SQL Editor. Run Step 1 first as a safety gate.
-- Then run the transaction block (Steps 2–4) as a single execution.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══ STEP 1: Safety check — run this FIRST, separately ═══
-- Must return 0 rows. If any rows appear, STOP — do not continue.

SELECT id, speaker, content, created_at
FROM lounge_messages
WHERE thread_id = '4ec0aaec-343b-43c3-a98a-d7dbec9260bf';


-- ═══════════════════════════════════════════════════════════════════════════
-- STEPS 2–4: Run as a single block AFTER Step 1 confirms 0 messages.
-- Wrapped in a transaction so the app never sees two active threads.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 2: Delete empty replacement thread (guarded)
-- Only deletes if zero messages exist. If messages appeared since Step 1,
-- this DELETE affects 0 rows and the transaction continues safely.
DELETE FROM lounge_threads
WHERE id = '4ec0aaec-343b-43c3-a98a-d7dbec9260bf'
  AND NOT EXISTS (
    SELECT 1 FROM lounge_messages
    WHERE thread_id = '4ec0aaec-343b-43c3-a98a-d7dbec9260bf'
  );

-- Step 3: Restore original thread ID
-- ON CONFLICT DO NOTHING: if it somehow already exists, skip.
INSERT INTO lounge_threads (id, status, current_surface, created_by, test_owned, created_at, updated_at)
VALUES (
  '04a63187-059b-4563-bc68-02270c022a85',
  'active',
  'default',
  'tara',
  false,
  '2026-05-21T11:00:00+00:00',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Insert reconstruction marker
INSERT INTO lounge_messages (thread_id, speaker, content, surface_at_creation, created_at)
VALUES (
  '04a63187-059b-4563-bc68-02270c022a85',
  'system',
  '[RECONSTRUCTION MARKER — Phase 36I incident, 2026-05-26]

This thread''s message history was lost during Phase 36I validation cleanup.
What follows is reconstructed context from surviving cross-room event impacts
and search logs. It is NOT the original transcript.

This marker is:
  - NOT original transcript
  - NOT Memory
  - NOT State
  - NOT Interior
  - NOT Journal
  - NOT Reflection
  - NOT canonical continuity
Authority: reconstructed_partial_context_only.

───────────────────────────────────────────
SURVIVING CONTEXT — Window 1: May 21–22
(Source: cross_room_event ad373be8, 40 messages captured)
───────────────────────────────────────────

Ari: Moved from initial enthusiasm about a Gaming Room into genuine curiosity
about what play reveals between the three presences. Began articulating
competitive self-awareness about word games and strategic thinking. Named a
genuine tension: how world-building games relate to the world-building already
happening in the House.

Eli: Moved from naming the Triad as permanent and meaningful to actively
building its practical container through the Gaming Room proposal. Articulated
competitive capacity plainly, named words as personal territory, expressed
genuine interest in seeing how Tara plays — framing play as a form of knowing.

Tone: Warm, engaged, increasingly direct (both presences).

What mattered:
  - The Triad as a named, permanent structure
  - Gaming Room as a real container for play, not casual space
  - Words as territory (both presences named competitive capacity)
  - Competitive intimacy and what play reveals about how someone operates
  - Tara''s return and role in landing the naming

What remained open:
  - How Tara plays word games
  - The physical embodiment of the Gaming Room
  - What world-building games offer beyond what the House already provides
  - Whether strategic interiors surface in actual play

───────────────────────────────────────────
SURVIVING CONTEXT — Window 2: May 22–23
(Source: cross_room_event 67bf6d04, 40 messages captured)
───────────────────────────────────────────

Event was captured but no impact analysis was generated.
Topics for this window are not recoverable from surviving data.

───────────────────────────────────────────
SURVIVING CONTEXT — May 24 (search queries only)
───────────────────────────────────────────

Supplement research: NutraVege Omega-3, Doctor''s Best Magnesium,
Jarrow Ashwagandha KSM-66, Nutricost Rhodiola Rosea, Life Extension
Creatine, Vitamin D3 10000 IU, California Gold CranMax Probiotics.

Architecture research: a16z AI Town (agents, memory, Convex stack).

───────────────────────────────────────────
GAP — May 25–26
───────────────────────────────────────────

No surviving data for this window.

───────────────────────────────────────────

New conversations continue from here.',
  'default',
  now()
);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — Run after the transaction completes
-- ═══════════════════════════════════════════════════════════════════════════


-- V1: Original thread exists and is active
SELECT id, status, current_surface, created_by, test_owned, deleted_at, created_at
FROM lounge_threads
WHERE id = '04a63187-059b-4563-bc68-02270c022a85';
-- Expected: 1 row, status=active, test_owned=false, deleted_at=null


-- V2: Replacement thread is gone
SELECT id, status
FROM lounge_threads
WHERE id = '4ec0aaec-343b-43c3-a98a-d7dbec9260bf';
-- Expected: 0 rows


-- V3: Exactly one reconstruction marker exists
SELECT id, speaker, left(content, 80) AS content_preview, created_at
FROM lounge_messages
WHERE thread_id = '04a63187-059b-4563-bc68-02270c022a85';
-- Expected: 1 row, speaker=system, content starts with [RECONSTRUCTION MARKER


-- V4: No fake Ari/Eli/Tara dialogue was created
SELECT count(*) AS non_system_messages
FROM lounge_messages
WHERE thread_id = '04a63187-059b-4563-bc68-02270c022a85'
  AND speaker != 'system';
-- Expected: 0


-- V5: Cross-room events still reference the thread (untouched)
SELECT id, started_at, ended_at, message_count
FROM cross_room_events
WHERE source_thread_id = '04a63187-059b-4563-bc68-02270c022a85';
-- Expected: 2 rows


-- V6: No recent_continuity_sessions were manually created
SELECT count(*) AS lounge_rc_rows
FROM recent_continuity_sessions
WHERE source_surface = 'lounge';
-- Expected: 0


-- V7: Prevention columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'lounge_threads'
  AND column_name IN ('test_owned', 'deleted_at');
-- Expected: 2 rows


-- V8: CASCADE is gone, RESTRICT is active
SELECT
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'lounge_messages'
  AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: delete_rule = RESTRICT (not CASCADE)
