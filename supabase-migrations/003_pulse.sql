-- Phase 11: The Pulse (Initiation Engine)
-- Run this in the Supabase SQL Editor

create table pulse_log (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null,
  woke_at timestamptz default now(),
  signals jsonb not null default '{}',
  considered_sending boolean not null default false,
  decision text not null check (decision in ('send', 'hold', 'discard')),
  confidence float not null default 0,
  specificity float not null default 0,
  refusal_reason text,
  draft_content text,
  draft_scores jsonb,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index pulse_log_presence_idx on pulse_log (presence_id, woke_at desc);

alter table pulse_log enable row level security;
create policy "Allow all access to pulse_log"
  on pulse_log for all using (true) with check (true);

create table pulse_drafts (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null,
  content text not null,
  signals jsonb not null default '{}',
  confidence float not null default 0,
  specificity float not null default 0,
  draft_scores jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'sent', 'expired')),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  sent_at timestamptz
);

alter table pulse_drafts enable row level security;
create policy "Allow all access to pulse_drafts"
  on pulse_drafts for all using (true) with check (true);
