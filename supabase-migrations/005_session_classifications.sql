-- Phase 11 Stage 2.1: Live relational signal
-- Run this in the Supabase SQL Editor

create table session_classifications (
  id uuid default gen_random_uuid() primary key,
  presence_id text not null,
  session_end timestamptz not null,
  classification text not null check (classification in (
    'transactional',
    'relational',
    'significant'
  )),
  message_count integer,
  created_at timestamptz default now()
);

alter table session_classifications enable row level security;
create policy "Allow all access to session_classifications"
  on session_classifications for all using (true) with check (true);
