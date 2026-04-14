-- Phase 12A: Interior Notes v1
-- Run this in the Supabase SQL Editor

create table interior_notes (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  room_slug text not null,
  note_type text not null check (note_type in (
    'thought',
    'question',
    'kept_moment',
    'active_thread',
    'recognition',
    'unresolved'
  )),
  content text not null,
  linked_session_end timestamptz,
  linked_message_id uuid,
  is_active boolean not null default true,
  surfaced_in_pulse boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index interior_notes_presence_idx
  on interior_notes (presence_id, created_at desc);

create index interior_notes_active_idx
  on interior_notes (presence_id, is_active, note_type);

alter table interior_notes enable row level security;

create policy "Allow all access to interior_notes"
  on interior_notes for all using (true) with check (true);
