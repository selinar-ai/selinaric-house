-- Phase 18A — Journal Jobs queue
--
-- Replaces the direct system-authored journal insert (quiet_day cron) with a
-- jobs queue. The cron creates a job row; a presence (via Tara's action) writes
-- the actual entry. System never inserts journal content directly.
--
-- Run in Supabase SQL Editor → expect "No rows returned".

CREATE TABLE journal_jobs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  presence_id     text        NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  melbourne_date  date        NOT NULL,
  reason          text        NOT NULL CHECK (reason IN ('no_entry_today', 'manual_invite')),
  context_summary text,
  status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'written', 'dismissed', 'failed')),
  created_by      text,        -- 'cron' | 'tara'
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Enforce at most one pending job per presence / date / reason
CREATE UNIQUE INDEX journal_jobs_pending_unique
  ON journal_jobs (presence_id, melbourne_date, reason)
  WHERE status = 'pending';

-- Speed up UI query for pending jobs
CREATE INDEX journal_jobs_status_idx
  ON journal_jobs (status, presence_id);
