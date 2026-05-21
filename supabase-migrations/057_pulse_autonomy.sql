-- Phase 11E: Pulse v2 — Autonomous Choice Windows
--
-- The clock opens the door.
-- The presence chooses what happens.
-- Every choice counts.
-- Stillness counts too.
--
-- Two new tables:
--   pulse_autonomy_events — source-of-truth/audit for every autonomy window outcome
--   pulse_telegram_responses — Tara response tracking for Telegram reach
--
-- Confirmed memory authority remains archive_items.canonical_status = 'canonical'.
-- pulse_autonomy_events is the event source; archive_items is the confirmed record.

-- ─── Table: pulse_autonomy_events ────────────────────────────────────────────

create table if not exists pulse_autonomy_events (
  id uuid primary key default gen_random_uuid(),

  presence_id text not null
    check (presence_id in ('ari', 'eli')),

  choice_window_at timestamptz not null,
  quiet_hours_active boolean not null default false,

  allowed_read_window_start timestamptz,
  allowed_read_window_end timestamptz,

  chosen_action text not null
    check (chosen_action in ('telegram', 'journal', 'desk', 'stillness')),

  choice_text text,
  reason_text text,

  telegram_message_id text,
  journal_entry_id uuid,
  desk_concept_id uuid,

  confirmed_memory_entry_id uuid,

  tara_responded boolean not null default false,
  tara_response_count integer not null default 0,
  last_tara_response_at timestamptz,

  status text not null default 'completed'
    check (status in ('completed', 'failed', 'skipped')),

  error_message text,

  created_at timestamptz not null default now()
);

create index if not exists pulse_autonomy_events_presence_window_idx
  on pulse_autonomy_events (presence_id, choice_window_at desc);

create index if not exists pulse_autonomy_events_action_idx
  on pulse_autonomy_events (chosen_action, created_at desc);

-- Idempotency: prevent duplicate autonomy events for the same presence + window
create unique index if not exists pulse_autonomy_events_unique_window_idx
  on pulse_autonomy_events (presence_id, choice_window_at);

-- RLS: open in v1 (matches House convention)
alter table pulse_autonomy_events enable row level security;

drop policy if exists "pulse_autonomy_events_open" on pulse_autonomy_events;
create policy "pulse_autonomy_events_open"
  on pulse_autonomy_events
  for all
  using (true)
  with check (true);


-- ─── Table: pulse_telegram_responses ─────────────────────────────────────────

create table if not exists pulse_telegram_responses (
  id uuid primary key default gen_random_uuid(),

  presence_id text not null
    check (presence_id in ('ari', 'eli')),

  pulse_autonomy_event_id uuid references pulse_autonomy_events(id) on delete set null,

  telegram_outbound_message_id text,
  telegram_inbound_message_id text,

  tara_response_text text not null,
  received_at timestamptz not null default now(),

  response_source text not null default 'telegram'
    check (response_source in ('telegram')),

  matched_by text not null
    check (matched_by in (
      'reply_to_message',
      'mention',
      'latest_open_event',
      'manual',
      'unmatched'
    )),

  confirmed_memory_entry_id uuid,

  created_at timestamptz not null default now()
);

create index if not exists pulse_telegram_responses_presence_received_idx
  on pulse_telegram_responses (presence_id, received_at desc);

create index if not exists pulse_telegram_responses_event_idx
  on pulse_telegram_responses (pulse_autonomy_event_id);

-- RLS: open in v1
alter table pulse_telegram_responses enable row level security;

drop policy if exists "pulse_telegram_responses_open" on pulse_telegram_responses;
create policy "pulse_telegram_responses_open"
  on pulse_telegram_responses
  for all
  using (true)
  with check (true);


-- ─── Table: pulse_config ────────────────────────────────────────────────────
-- Key-value store for Pulse system configuration.
-- Controlled by Tara/system only — never by Ari or Eli.
-- Current keys: 'pulse_mode' → 'open' | 'quiet' | 'paused'

create table if not exists pulse_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'tara'
);

-- RLS: open in v1
alter table pulse_config enable row level security;

drop policy if exists "pulse_config_open" on pulse_config;
create policy "pulse_config_open"
  on pulse_config
  for all
  using (true)
  with check (true);

-- Seed default pulse mode
insert into pulse_config (key, value, updated_by)
values ('pulse_mode', 'open', 'tara')
on conflict (key) do nothing;
