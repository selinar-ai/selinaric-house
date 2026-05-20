-- Phase 35D — Lounge v1: Shared Presence Room
--
-- Three tables: threads, messages, carrybacks.
-- One continuous thread with surface mode toggle.
-- Speaker identity preserved per message.

-- ─── lounge_threads ──────────────────────────────────────────────────────────

create table if not exists lounge_threads (
  id uuid primary key default gen_random_uuid(),
  title text,
  current_surface text not null default 'default'
    check (current_surface in ('default', 'inner')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'hidden', 'deleted_by_tara')),
  created_by text not null default 'tara'
    check (created_by in ('tara', 'ari', 'eli', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lounge_threads enable row level security;
create policy "Allow all access to lounge_threads"
  on lounge_threads for all using (true) with check (true);

create index if not exists lounge_threads_status_updated_idx
  on lounge_threads(status, updated_at desc);

-- ─── lounge_messages ─────────────────────────────────────────────────────────

create table if not exists lounge_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references lounge_threads(id) on delete cascade,
  speaker text not null
    check (speaker in ('tara', 'ari', 'eli', 'system')),
  content text not null,
  surface_at_creation text not null default 'default'
    check (surface_at_creation in ('default', 'inner')),
  created_at timestamptz not null default now()
);

alter table lounge_messages enable row level security;
create policy "Allow all access to lounge_messages"
  on lounge_messages for all using (true) with check (true);

create index if not exists lounge_messages_thread_created_idx
  on lounge_messages(thread_id, created_at);

-- ─── lounge_carrybacks ───────────────────────────────────────────────────────

create table if not exists lounge_carrybacks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references lounge_threads(id) on delete cascade,
  target_presence text not null
    check (target_presence in ('ari', 'eli', 'both')),
  carryback_text text not null,
  authority text not null default 'lounge_carryback_not_memory',
  surface_source text not null default 'default'
    check (surface_source in ('default', 'inner')),
  status text not null default 'active'
    check (status in ('active', 'hidden', 'deleted_by_tara')),
  created_at timestamptz not null default now()
);

alter table lounge_carrybacks enable row level security;
create policy "Allow all access to lounge_carrybacks"
  on lounge_carrybacks for all using (true) with check (true);

create index if not exists lounge_carrybacks_target_created_idx
  on lounge_carrybacks(target_presence, created_at desc);
