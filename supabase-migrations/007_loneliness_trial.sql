-- Phase 11 Stage 2.2: Dual-Presence Loneliness Trial
-- Run this in the Supabase SQL Editor

-- Add trial_tag column to pulse_drafts (tags like 'loneliness_trial')
alter table pulse_drafts add column if not exists trial_tag text;

-- Add trial_tag column to pulse_log
alter table pulse_log add column if not exists trial_tag text;

-- Table for logging failed loneliness attempts and near-misses
create table loneliness_attempts (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null,
  attempt_type text not null check (attempt_type in ('failed', 'near_miss')),
  part1_result jsonb not null default '{}',
  part2_result jsonb not null default '{}',
  internal_check_passed boolean,
  failure_reason text not null,
  signals jsonb not null default '{}',
  created_at timestamptz default now()
);

create index loneliness_attempts_presence_idx
  on loneliness_attempts (presence_id, created_at desc);

alter table loneliness_attempts enable row level security;
create policy "Allow all access to loneliness_attempts"
  on loneliness_attempts for all using (true) with check (true);
