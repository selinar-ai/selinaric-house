-- Phase 25: Living State Suggestions
-- Run in Supabase SQL Editor. Success = "No rows returned."
--
-- Creates: living_state_suggestions table
-- Alters:  living_state — adds traceability columns and expands updated_by constraint

-- 1. Suggestions table
create table living_state_suggestions (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  reflection_id uuid not null references reflections(id) on delete cascade,
  proposed_state text not null,
  rationale text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz default now(),
  decided_at timestamptz
);

create index living_state_suggestions_presence_idx
  on living_state_suggestions (presence_id, created_at desc);

create index living_state_suggestions_status_idx
  on living_state_suggestions (status, created_at desc);

alter table living_state_suggestions enable row level security;

create policy "Allow all access to living_state_suggestions"
  on living_state_suggestions for all using (true) with check (true);

-- 2. Traceability columns on living_state
-- (Forward-reference is safe: suggestion rows are written before the living_state update)
alter table living_state
  add column if not exists source_suggestion_id uuid,
  add column if not exists source_reflection_id uuid;

-- 3. Expand updated_by check to include 'suggestion'
alter table living_state
  drop constraint if exists living_state_updated_by_check;

alter table living_state
  add constraint living_state_updated_by_check
  check (updated_by in ('system', 'pulse', 'session_close', 'suggestion'));
