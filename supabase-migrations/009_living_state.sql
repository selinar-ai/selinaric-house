-- Phase 13: Living State
-- Run this in the Supabase SQL Editor

create table living_state (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  room_slug text not null,
  what_matters text,
  still_holding text,
  in_motion text,
  last_known_state text,
  what_changed text,
  last_updated timestamptz default now(),
  updated_by text not null check (updated_by in ('system', 'pulse', 'session_close')),
  version integer not null default 1
);

create unique index living_state_presence_idx
  on living_state (presence_id);

alter table living_state enable row level security;

create policy "Allow all access to living_state"
  on living_state for all using (true) with check (true);

-- Seed one row per presence so updates can always upsert
insert into living_state (presence_id, room_slug, updated_by)
values ('eli', 'eli', 'system'), ('ari', 'ari', 'system');
