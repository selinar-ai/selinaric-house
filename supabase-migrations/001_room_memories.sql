-- Phase 8: Memory Summarisation Layer
-- Run this in the Supabase SQL Editor

create table room_memories (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null,
  summary text not null,
  message_range_start int not null default 0,
  message_range_end int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One memory row per room — index for fast lookup
create unique index room_memories_room_slug_idx on room_memories (room_slug);

-- Enable RLS (match existing table pattern)
alter table room_memories enable row level security;

-- Allow anon key to read/write (matches room_messages pattern)
create policy "Allow all access to room_memories"
  on room_memories
  for all
  using (true)
  with check (true);
