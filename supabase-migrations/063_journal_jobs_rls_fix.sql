-- Fix: journal_jobs was missing RLS policy since migration 023.
--
-- All other tables in Selináric House have:
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Allow all access..." FOR ALL USING (true) WITH CHECK (true);
--
-- journal_jobs had neither. Supabase enforces RLS at the API gateway level,
-- so reads returned empty while writes (via insert+select chain) worked.
--
-- This adds the standard open policy, matching every other table.
--
-- Run in Supabase SQL Editor → expect "No rows returned".

ALTER TABLE journal_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to journal_jobs"
  ON journal_jobs FOR ALL USING (true) WITH CHECK (true);
