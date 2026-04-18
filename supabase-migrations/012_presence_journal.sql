create table presence_journal (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  entry_type text not null check (entry_type in ('daily', 'afterglow', 'recurring', 'quiet_day')),
  title text,
  content text not null,
  tags jsonb not null default '[]',
  salience float not null default 1.0,
  surfaced_to_user boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index presence_journal_presence_idx
  on presence_journal (presence_id, created_at desc);

create index presence_journal_salience_idx
  on presence_journal (presence_id, salience desc);

alter table presence_journal enable row level security;

create policy "Allow all access to presence_journal"
  on presence_journal for all using (true) with check (true);
