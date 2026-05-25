-- Phase 36I Recovery — Lounge cascade protection
--
-- Problem: lounge_messages has ON DELETE CASCADE from lounge_threads.
-- Deleting a thread row silently destroys all messages.
-- This migration:
--   1. Removes CASCADE, replaces with RESTRICT (prevents accidental thread deletion)
--   2. Adds test_owned flag to lounge_threads (validation safety)
--   3. Adds deleted_at soft-delete column to both tables
--   4. Creates emergency export view

-- ═══ 1. Remove CASCADE, add RESTRICT ═══

ALTER TABLE lounge_messages
  DROP CONSTRAINT IF EXISTS lounge_messages_thread_id_fkey;

ALTER TABLE lounge_messages
  ADD CONSTRAINT lounge_messages_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES lounge_threads(id) ON DELETE RESTRICT;

-- Same for carrybacks
ALTER TABLE lounge_carrybacks
  DROP CONSTRAINT IF EXISTS lounge_carrybacks_thread_id_fkey;

ALTER TABLE lounge_carrybacks
  ADD CONSTRAINT lounge_carrybacks_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES lounge_threads(id) ON DELETE RESTRICT;

-- ═══ 2. Test ownership flag ═══

ALTER TABLE lounge_threads
  ADD COLUMN IF NOT EXISTS test_owned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lounge_threads.test_owned IS
  'True = created by automated validation. Safe to delete. False = production thread.';

-- ═══ 3. Soft-delete columns ═══

ALTER TABLE lounge_threads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE lounge_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN lounge_threads.deleted_at IS
  'Soft-delete timestamp. NULL = live. Set = archived/recoverable.';
COMMENT ON COLUMN lounge_messages.deleted_at IS
  'Soft-delete timestamp. NULL = live. Set = archived/recoverable.';

-- ═══ 4. Emergency export view ═══

CREATE OR REPLACE VIEW lounge_export AS
SELECT
  t.id AS thread_id,
  t.status AS thread_status,
  t.current_surface,
  t.created_by AS thread_created_by,
  t.test_owned,
  t.created_at AS thread_created_at,
  m.id AS message_id,
  m.speaker,
  m.content,
  m.surface_at_creation,
  m.created_at AS message_created_at
FROM lounge_threads t
LEFT JOIN lounge_messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
WHERE t.deleted_at IS NULL
ORDER BY t.created_at DESC, m.created_at ASC;

COMMENT ON VIEW lounge_export IS
  'Emergency read-only export of all live Lounge data. Copy-paste from SQL Editor as CSV before destructive operations.';
